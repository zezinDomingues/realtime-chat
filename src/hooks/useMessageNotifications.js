'use client'

import { useEffect, useRef } from 'react'

import { supabase } from '@/libs/supabase'

// Notifica o usuário logado quando chega uma mensagem de OUTRA pessoa:
//  - toca um som (dois bipes curtos via Web Audio, sem precisar de arquivo)
//  - mostra uma notificação do navegador (aparece mesmo em outra aba/tela)
//  - pisca o título da aba com a contagem de não lidas
//
// Montar UMA vez (ex.: no ChatWrapper). Funciona para o admin (avisa quando um
// cliente escreve) e para o cliente (avisa quando o suporte responde).

export function useMessageNotifications(currentUser) {
  const audioCtxRef = useRef(null)
  const originalTitleRef = useRef('')
  const unreadRef = useRef(0)

  useEffect(() => {
    if (!currentUser?.id || typeof window === 'undefined') return

    originalTitleRef.current = document.title

    const ensureAudioCtx = () => {
      if (!audioCtxRef.current) {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext

          if (Ctx) audioCtxRef.current = new Ctx()
        } catch {
          /* ignore */
        }
      }

      audioCtxRef.current?.resume?.()
    }

    // No primeiro gesto do usuário: destrava o áudio e pede permissão de notificação
    const onFirstGesture = () => {
      ensureAudioCtx()

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    }

    window.addEventListener('click', onFirstGesture)
    window.addEventListener('keydown', onFirstGesture)

    // Tenta pedir permissão logo de cara também (alguns navegadores permitem)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const playBeep = () => {
      try {
        ensureAudioCtx()
        const ctx = audioCtxRef.current

        if (!ctx) return

        const now = ctx.currentTime

        ;[
          { at: 0, freq: 880 },
          { at: 0.18, freq: 1046 }
        ].forEach(({ at, freq }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, now + at)
          gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now + at)
          osc.stop(now + at + 0.17)
        })
      } catch {
        /* ignore */
      }
    }

    const restoreTitle = () => {
      unreadRef.current = 0
      document.title = originalTitleRef.current
    }

    const onVisibility = () => {
      if (!document.hidden) restoreTitle()
    }

    window.addEventListener('focus', restoreTitle)
    document.addEventListener('visibilitychange', onVisibility)

    const channel = supabase
      .channel('global-message-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
        const msg = payload.new

        // Ignora as minhas próprias mensagens
        if (!msg || msg.sender_id === currentUser.id) return

        // 1) Som
        playBeep()

        // 2) Título da aba piscando (quando não está com o app em foco)
        if (document.hidden) {
          unreadRef.current += 1
          document.title = `(${unreadRef.current}) Nova mensagem 💬`
        }

        // 3) Notificação do navegador (aparece mesmo em outra aba/tela)
        if ('Notification' in window && Notification.permission === 'granted') {
          let senderName = 'Nova mensagem'

          try {
            const { data } = await supabase.from('profiles').select('full_name').eq('id', msg.sender_id).single()

            if (data?.full_name) senderName = data.full_name
          } catch {
            /* ignore */
          }

          const body =
            msg.content && msg.content.trim().length > 0
              ? msg.content
              : msg.attachment_type
                ? '📎 Enviou um anexo'
                : 'Nova mensagem'

          try {
            const notification = new Notification(senderName, {
              body,
              tag: msg.conversation_id,
              renotify: true
            })

            notification.onclick = () => {
              window.focus()
              notification.close()
            }
          } catch {
            /* ignore */
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('click', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
      window.removeEventListener('focus', restoreTitle)
      document.removeEventListener('visibilitychange', onVisibility)
      document.title = originalTitleRef.current
    }
  }, [currentUser?.id])
}
