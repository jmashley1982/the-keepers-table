import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma.js'
import { decrypt } from './crypto.js'

async function isFriendAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return Boolean(user?.email.startsWith('friend_') && user.email.endsWith('@keeper.internal'))
}

/**
 * Returns an Anthropic client for the given user, following the priority chain:
 *   1. User's saved Anthropic API key → direct Anthropic SDK
 *   2. User's saved EvoLink key → Anthropic SDK routed through EvoLink proxy
 *   3. Friend accounts only: CLAUDE_API_KEY env var, then EVOLINK_API_KEY env var
 *   4. null — caller must handle the no-key case
 */
export async function getAnthropicClient(userId: string): Promise<Anthropic | null> {
  const anthropicCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'anthropic' } },
  })
  if (anthropicCred?.encryptedKey) {
    try {
      const key = decrypt(anthropicCred.encryptedKey)
      return new Anthropic({ apiKey: key })
    } catch {
      // fall through to EvoLink
    }
  }

  const evolinkCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'evolink' } },
  })
  if (evolinkCred?.encryptedKey) {
    try {
      const key = decrypt(evolinkCred.encryptedKey)
      return new Anthropic({ apiKey: key, baseURL: 'https://api.evolink.ai/v1' })
    } catch {
      // fall through to env var
    }
  }

  // Fallback to owner's env-var keys — only for friend accounts
  if (await isFriendAccount(userId)) {
    const envClaudeKey = process.env.CLAUDE_API_KEY?.trim()
    if (envClaudeKey) return new Anthropic({ apiKey: envClaudeKey })

    const envEvolinkKey = process.env.EVOLINK_API_KEY?.trim()
    if (envEvolinkKey) return new Anthropic({ apiKey: envEvolinkKey, baseURL: 'https://api.evolink.ai/v1' })
  }

  return null
}
