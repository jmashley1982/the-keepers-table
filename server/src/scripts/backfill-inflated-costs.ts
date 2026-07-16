/**
 * One-time backfill: fix GenerationJob rows where costActual was mistakenly
 * stored as raw EvoLink credits instead of USD.
 *
 * Criteria: provider = 'evolink' AND costActual > costEstimate * 20
 * Fix:      SET costActual = costActual / 67   (evolinkCreditsPerUsd = 67)
 *
 * Run with:  pnpm db:backfill-costs
 * Safe to re-run — rows already corrected no longer match the WHERE clause.
 */

import { prisma } from '../lib/prisma.js'

const CREDITS_PER_USD = 67
const RATIO_THRESHOLD = 20

async function main() {
  console.log('=== Backfill inflated EvoLink costActual values ===\n')

  // Preview: count affected rows before making any changes
  const affected = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count
    FROM "GenerationJob"
    WHERE provider = 'evolink'
      AND "costActual"  IS NOT NULL
      AND "costEstimate" IS NOT NULL
      AND "costEstimate" > 0
      AND "costActual" > "costEstimate" * ${RATIO_THRESHOLD}
  `

  const rowCount = Number(affected[0]?.count ?? 0)
  console.log(`Rows matching inflated-cost criteria: ${rowCount}`)

  if (rowCount === 0) {
    console.log('Nothing to do — database is already clean.')
    await prisma.$disconnect()
    return
  }

  // Fetch the rows so we can log what is changing
  const rows = await prisma.$queryRaw<
    { id: string; costEstimate: number; costActual: number }[]
  >`
    SELECT id, "costEstimate", "costActual"
    FROM "GenerationJob"
    WHERE provider = 'evolink'
      AND "costActual"  IS NOT NULL
      AND "costEstimate" IS NOT NULL
      AND "costEstimate" > 0
      AND "costActual" > "costEstimate" * ${RATIO_THRESHOLD}
    ORDER BY "createdAt"
  `

  console.log('\nRows to be corrected:')
  for (const r of rows) {
    const corrected = r.costActual / CREDITS_PER_USD
    console.log(
      `  ${r.id}  estimate=$${r.costEstimate.toFixed(4)}  ` +
      `actual=$${r.costActual.toFixed(4)} → $${corrected.toFixed(4)}`
    )
  }

  // Apply the fix in a single UPDATE
  const result = await prisma.$executeRaw`
    UPDATE "GenerationJob"
    SET "costActual" = "costActual" / ${CREDITS_PER_USD},
        "updatedAt"  = NOW()
    WHERE provider = 'evolink'
      AND "costActual"  IS NOT NULL
      AND "costEstimate" IS NOT NULL
      AND "costEstimate" > 0
      AND "costActual" > "costEstimate" * ${RATIO_THRESHOLD}
  `

  console.log(`\nUpdated ${result} row(s). Backfill complete.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
