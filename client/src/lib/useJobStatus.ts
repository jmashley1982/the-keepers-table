import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export interface JobStatusState {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | null
  assetId: string | null
  errorMessage: string | null
  retry: (() => void) | null
}

export function useJobStatus(
  jobId: string | null,
  onRetry?: () => void,
): JobStatusState {
  const [state, setState] = useState<Omit<JobStatusState, 'retry'>>({
    status: null,
    assetId: null,
    errorMessage: null,
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const doneRef = useRef(false)

  const stopAll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }, [])

  const fetchStatus = useCallback(async (targetJobId: string) => {
    try {
      const res = await api.get<{ status: string; assetId: string | null; error: string | null }>(`/api/jobs/${targetJobId}`)
      const { status, assetId, error } = res.data
      setState({ status: status as JobStatusState['status'], assetId, errorMessage: error })
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
      setState({ status: null, assetId: null, errorMessage: null })
      return
    }

    doneRef.current = false
    setState({ status: null, assetId: null, errorMessage: null })

    fetchStatus(jobId)

    const es = new EventSource('/api/jobs/stream', { withCredentials: true })
    esRef.current = es

    es.addEventListener('job_update', (evt: MessageEvent<string>) => {
      const data = JSON.parse(evt.data) as { jobId: string; status: string; assetId?: string }
      if (data.jobId !== jobId) return

      setState(prev => ({
        status: data.status as JobStatusState['status'],
        assetId: data.assetId ?? prev.assetId,
        errorMessage: prev.errorMessage,
      }))

      if (data.status === 'succeeded' || data.status === 'failed') {
        fetchStatus(jobId)
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
