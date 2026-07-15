import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function FriendsLogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    api.post('/api/friends/logout').catch(() => {}).finally(() => {
      navigate('/friends', { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
