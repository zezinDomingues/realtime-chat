'use client'

import { useEffect, useState } from 'react'

import { supabase } from '@/libs/supabase'

export const usePresence = userId => {
  const [onlineUsers, setOnlineUsers] = useState({})

  useEffect(() => {
    if (!userId) return

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId
        }
      }
    })

    const trackPresence = async status => {
      await channel.track({
        status,
        lastSeen: new Date().toISOString()
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        trackPresence('away')
      } else {
        trackPresence('online')
      }
    }

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState()
        const formattedState = {}

        Object.keys(newState).forEach(key => {
          formattedState[key] = newState[key][0]
        })

        setOnlineUsers(formattedState)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await trackPresence('online')
        }
      })

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel.unsubscribe()
    }
  }, [userId])

  return onlineUsers
}
