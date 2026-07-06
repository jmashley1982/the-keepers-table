import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export interface JobStatusState {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | null
  assetId: string | null
  errorMessage: string | null
  rawError: string | null
  retry: (() => void) | null
}

const CLIENT_TIMEOUT_MS = 12 * 60 * 1000 // 12 minutes

export function useJobStatus(
  jobId: string | null,
  onRetry?: () => void,
): JobStatusState {
  const [state, setState] = useState<Omit<JobStatusState, 'retry'>>({
    status: null,
    assetId: null,
    errorMessage: null,
    rawError: null,
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)

  const stopAll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }, [])

  const fetchStatus = useCallback(async (targetJobId: string) => {
    try {
      const res = await api.get<{ status: string; assetId: string | null; error: string | null; rawError: string | null }>(`/api/jobs/${targetJobId}`)
      const { status, assetId, error, rawError } = res.data
      setState({ status: status as JobStatusState['status'], assetId, errorMessage: error, rawError: rawError ?? null })
      if (status === 'succeeded' || status === 'failed') {
        doneRef.current = true
        stopAll()
      }
    } catch {
      // network error — keep polling
    }
  }, [stopAll])

  useEffect(() => {
    if (!jobId) {
      setState({ status: null, assetId: null, errorMessage: null, rawError: null })
      return
    }

    doneRef.current = false
    setState({ status: null, assetId: null, errorMessage: null, rawError: null })

    fetchStatus(jobId)

    // Client-side safety timeout — surfaces an error if the server worker
    // dies without ever marking the job failed (prevents infinite spinner)
    timeoutRef.current = setTimeout(() => {
      if (!doneRef.current) {
        setState({
          status: 'failed',
          assetId: null,
          errorMessage: 'Generation timed out — please try again',
          rawError: 'Client-side timeout: no response after 12 minutes',
        })
        doneRef.current = true
        stopAll()
      }
    }, CLIENT_TIMEOUT_MS)

    const es = new EventSource('/api/jobs/stream', { withCredentials: true })
    esRef.current = es

    es.addEventListener('job_update', (evt: MessageEvent<string>) => {
      const data = JSON.parse(evt.data) as { jobId: string; status: string; assetId?: string }
      if (data.jobId !== jobId) return

      if (data.status === 'succeeded' || data.status === 'failed') {
        // For terminal states, fetch the full record (which includes errorMessage /
        // rawError) so state is updated atomically — avoids a race where the
        // effect in GenerateArtButton sees status='failed' before the error is set.
        fetchStatus(jobId)
      } else {
        setState(prev => ({
          status: data.status as JobStatusState['status'],
          assetId: data.assetId ?? prev.assetId,
          errorMessage: prev.errorMessage,
          rawError: prev.rawError,
        }))
      }
    })

    es.onerror = () => {
      if (doneRef.current) return
      es.close()
      esRef.current = null
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          if (!doneRef.current) fetchStatus(jobId)
        }, 4000)
      }
    }

    return () => {
      stopAll()
    }
  }, [jobId, fetchStatus, stopAll])

  return {
    ...state,
    retry: onRetry ?? null,
  }
}
