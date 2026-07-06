'use client'

import { useEffect, useState, useRef } from 'react'

import { supabase } from '@/libs/supabase'

export const useTypingIndicator = (conversationId, userId) => {
  const [isTyping, setIsTyping] = useState({})
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (!conversationId || !userId) return

    const channel = supabase.channel(`typing:${conversationId}`)

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== userId) {
          setIsTyping(prev => ({ ...prev, [payload.userId]: true }))
        }
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        if (payload.userId !== userId) {
          setIsTyping(prev => ({ ...prev, [payload.userId]: false }))
        }
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [conversationId, userId])

  const sendTypingEvent = isStarting => {
    if (!conversationId || !userId) return

    const channel = supabase.channel(`typing:${conversationId}`)

    if (isStarting) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId }
      })

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

      typingTimeoutRef.current = setTimeout(() => {
        sendTypingEvent(false)
      }, 3000)
    } else {
      channel.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId }
      })
    }
  }

  return { isTyping, sendTypingEvent }
}
