import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Loader, LogIn } from 'lucide-react'
import { api } from '../../lib/api'

interface Props {
  /** Pass true when the user is logged in so the export button appears */
  loggedIn?: boolean
}

export default function MigrationBanner({ loggedIn = false }: Props) {
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const res = await api.get('/api/preferences/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'kt-account-export.json'
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch {
      setError('Export failed — please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="shrink-0 w-full"
      style={{
        background: 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)',
        borderBottom: '2px solid #ef4444',
      }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 max-w-6xl mx-auto w-full">
        {/* Warning text */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <AlertTriangle size={20} className="text-red-300 shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-100 leading-snug">
              ⚠️ Server migration in progress — all data will be wiped.
            </p>
            <p className="text-xs text-red-300 mt-0.5 leading-snug">
              {loggedIn
                ? 'Export your data now to keep everything you\'ve created. Uploaded images are not included.'
                : 'Log in and export your data before it\'s gone.'}
            </p>
            {error && <p className="text-xs text-red-400 mt-1 font-medium">{error}</p>}
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2 shrink-0 ml-8 sm:ml-0">
          {loggedIn ? (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-card text-sm font-bold transition-all disabled:opacity-60 whitespace-nowrap"
              style={{
                background: done ? '#16a34a' : '#ef4444',
                color: '#fff',
                boxShadow: done ? '0 0 12px rgba(22,163,74,0.5)' : '0 0 12px rgba(239,68,68,0.5)',
              }}
            >
              {exporting
                ? <><Loader size={14} className="animate-spin" /> Exporting…</>
                : done
                  ? <>✓ Downloaded!</>
                  : <><Download size={14} /> Export all my data</>}
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-4 py-2 rounded-card text-sm font-bold transition-all whitespace-nowrap"
              style={{
                background: '#ef4444',
                color: '#fff',
                boxShadow: '0 0 12px rgba(239,68,68,0.5)',
              }}
            >
              <LogIn size={14} /> Log in to export
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
