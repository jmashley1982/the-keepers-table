import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import ThemedLoader from '../../components/ui/Loader'

export default function FriendsLogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    api.post('/api/friends/logout').catch(() => {}).finally(() => {
      navigate('/friends', { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <ThemedLoader />
    </div>
  )
}
