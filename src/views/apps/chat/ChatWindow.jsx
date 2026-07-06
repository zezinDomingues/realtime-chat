'use client'

import { useState, useEffect, useRef } from 'react'

import { Box, Typography, TextField, IconButton, Avatar, Paper, InputAdornment, CircularProgress } from '@mui/material'

import { supabase } from '@/libs/supabase'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'

const ChatWindow = ({ currentUser, conversationId, hideHeader = false, emptyText }) => {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [otherUser, setOtherUser] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [previews, setPreviews] = useState({})
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const fetchedUrls = useRef(new Set())
  const { isTyping, sendTypingEvent } = useTypingIndicator(conversationId, currentUser?.id)

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    if (!conversationId || !currentUser) return

    // Marca como lidas as mensagens que EU recebi nesta conversa
    const markAsRead = async () => {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUser.id)
        .eq('is_read', false)
    }

    const fetchData = async () => {
      setLoading(true)

      const { data: member } = await supabase
        .from('conversation_members')
        .select('profiles:user_id (*)')
        .eq('conversation_id', conversationId)
        .neq('user_id', currentUser.id)
        .single()

      if (member) setOtherUser(member.profiles)

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      setMessages(msgs || [])
      setLoading(false)

      // Ao entrar na conversa, vai direto para a última mensagem (instantâneo).
      // Duas tentativas para garantir o fim mesmo após imagens/preview renderizarem.
      setTimeout(() => scrollToBottom('auto'), 60)
      setTimeout(() => scrollToBottom('auto'), 300)

      markAsRead()
    }

    fetchData()

    const subscription = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          setMessages(prev => [...prev, payload.new])
          setTimeout(scrollToBottom, 100)

          if (payload.new.sender_id !== currentUser.id) {
            markAsRead()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          setMessages(prev => prev.map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [conversationId, currentUser])

  const handleSendMessage = async e => {
    e.preventDefault()
    if (!newMessage.trim() || !conversationId || !currentUser) return

    const messageToSend = newMessage

    setNewMessage('')
    sendTypingEvent(false)

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUser.id,
      content: messageToSend
    })

    if (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleInputChange = e => {
    setNewMessage(e.target.value)
    sendTypingEvent(true)
  }

  // Abre o seletor de arquivos
  const handleAttachClick = () => fileInputRef.current?.click()

  // Faz upload do arquivo para o Storage e envia como mensagem
  const handleFileChange = async e => {
    const file = e.target.files?.[0]

    e.target.value = '' // permite reenviar o mesmo arquivo depois

    if (!file || !conversationId || !currentUser) return

    if (file.size > 50 * 1024 * 1024) {
      alert('Arquivo muito grande. O limite é 50MB.')

      return
    }

    setUploading(true)

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file, { upsert: false })

    if (uploadError) {
      console.error('Erro no upload:', uploadError)
      setUploading(false)
      alert('Falha ao enviar o arquivo.')

      return
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from('chat-attachments').getPublicUrl(path)

    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'

    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUser.id,
      content: '',
      attachment_url: publicUrl,
      attachment_type: type,
      attachment_name: file.name
    })

    if (msgError) console.error('Erro ao enviar anexo:', msgError)

    setUploading(false)
  }

  // Primeiro link http(s) encontrado no texto (para o cartão de preview)
  const firstUrl = text => {
    if (!text) return null
    const m = text.match(/https?:\/\/[^\s]+/)

    return m ? m[0] : null
  }

  // Busca o preview (Open Graph) de cada link novo que aparecer nas mensagens
  useEffect(() => {
    messages.forEach(m => {
      const url = firstUrl(m.content)

      if (!url || fetchedUrls.current.has(url)) return
      fetchedUrls.current.add(url)

      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (data && (data.title || data.image)) {
            setPreviews(prev => ({ ...prev, [url]: data }))
          }
        })
        .catch(() => {})
    })
  }, [messages])

  // Transforma URLs do texto em links clicáveis
  const isUrl = s => /^https?:\/\/[^\s]+$/.test(s)

  const renderTextWithLinks = (text, mine) =>
    text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      isUrl(part) ? (
        <a
          key={i}
          href={part}
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: mine ? '#0b3d91' : '#e3d007', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      )
    )

  if (!conversationId) {
    return (
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          bgcolor: 'action.hover'
        }}
      >
        <Avatar sx={{ width: 80, height: 80, mb: 4, bgcolor: 'primary.lightOpacity' }}>
          <i className='ri-message-3-line text-4xl text-primary' />
        </Avatar>
        <Typography variant='h6' color='textSecondary'>
          {emptyText || 'Selecione uma conversa para começar'}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      {!hideHeader && (
        <Box
          sx={{ p: 3, display: 'flex', alignItems: 'center', borderBottom: theme => `1px solid ${theme.palette.divider}` }}
        >
          <Avatar src={otherUser?.avatar_url} sx={{ mr: 3 }} />
          <Box>
            <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
              {otherUser?.full_name || 'Carregando...'}
            </Typography>
            {isTyping[otherUser?.id] && (
              <Typography variant='caption' color='primary'>
                digitando...
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Messages Area */}
      <Box sx={{ flexGrow: 1, p: 4, overflowY: 'auto', bgcolor: 'action.hover' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          messages.map(msg => {
            const isMine = msg.sender_id === currentUser?.id

            const textColor = isMine ? '#161616' : '#fff'

            return (
              <Box
                key={msg.id}
                sx={{
                  display: 'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                  mb: 4
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    px: 4,
                    maxWidth: '70%',
                    borderRadius: 2,
                    bgcolor: isMine ? '#fff' : '#161616',
                    color: textColor,
                    boxShadow: theme => theme.shadows[1]
                  }}
                >
                  {msg.attachment_url && msg.attachment_type === 'image' && (
                    <Box
                      component='img'
                      src={msg.attachment_url}
                      alt={msg.attachment_name || 'imagem'}
                      onClick={() => window.open(msg.attachment_url, '_blank')}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: 220,
                        borderRadius: 1,
                        cursor: 'pointer',
                        display: 'block',
                        mb: msg.content ? 2 : 0
                      }}
                    />
                  )}

                  {msg.attachment_url && msg.attachment_type === 'video' && (
                    <Box
                      component='video'
                      src={msg.attachment_url}
                      controls
                      sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, display: 'block', mb: msg.content ? 2 : 0 }}
                    />
                  )}

                  {msg.attachment_url && msg.attachment_type === 'file' && (
                    <Box
                      component='a'
                      href={msg.attachment_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      download={msg.attachment_name}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 2,
                        mb: msg.content ? 2 : 0,
                        borderRadius: 1,
                        bgcolor: isMine ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)',
                        color: textColor,
                        textDecoration: 'none',
                        maxWidth: 240
                      }}
                    >
                      <i className='ri-file-3-line' style={{ fontSize: '1.5rem' }} />
                      <Typography variant='body2' sx={{ color: textColor, wordBreak: 'break-word' }}>
                        {msg.attachment_name || 'Arquivo'}
                      </Typography>
                    </Box>
                  )}

                  {(() => {
                    const url = firstUrl(msg.content)
                    const p = url ? previews[url] : null

                    if (!p) return null

                    const accent = isMine ? '#161616' : '#e3d007'

                    return (
                      <Box
                        component='a'
                        href={p.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        sx={{
                          display: 'block',
                          mb: msg.content ? 2 : 0,
                          borderRadius: 2,
                          overflow: 'hidden',
                          textDecoration: 'none',
                          bgcolor: isMine ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.06)',
                          border: isMine ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.12)',
                          maxWidth: 320,
                          transition: 'transform .15s ease, box-shadow .15s ease',
                          '&:hover': { transform: 'translateY(-1px)', boxShadow: 3 }
                        }}
                      >
                        {p.image && (
                          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: 'rgba(0,0,0,0.2)' }}>
                            <Box
                              component='img'
                              src={p.image}
                              alt=''
                              onError={e => {
                                const box = e.currentTarget.parentElement

                                if (box) box.style.display = 'none'
                              }}
                              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            {p.mediaType === 'video' && (
                              <Box
                                sx={{
                                  position: 'absolute',
                                  inset: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 54,
                                    height: 54,
                                    borderRadius: '50%',
                                    bgcolor: 'rgba(0,0,0,0.65)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <i className='ri-play-fill' style={{ color: '#fff', fontSize: '1.9rem', marginLeft: 2 }} />
                                </Box>
                              </Box>
                            )}
                          </Box>
                        )}
                        <Box sx={{ p: 3, borderLeft: `3px solid ${accent}` }}>
                          {p.siteName && (
                            <Typography
                              sx={{
                                color: accent,
                                opacity: isMine ? 0.85 : 1,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '.06em',
                                textTransform: 'uppercase',
                                display: 'block',
                                mb: 0.75
                              }}
                            >
                              {p.siteName}
                            </Typography>
                          )}
                          {p.title && (
                            <Typography
                              variant='body2'
                              sx={{
                                color: textColor,
                                fontWeight: 700,
                                lineHeight: 1.3,
                                mb: 0.75,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {p.title}
                            </Typography>
                          )}
                          {p.description && (
                            <Typography
                              variant='caption'
                              sx={{
                                color: textColor,
                                opacity: 0.75,
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {p.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )
                  })()}

                  {msg.content && (
                    <Typography variant='body2' sx={{ color: textColor, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderTextWithLinks(msg.content, isMine)}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                    <Typography variant='caption' sx={{ color: textColor, opacity: 0.7, fontSize: '0.7rem' }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                    {isMine && (
                      <i
                        className={msg.is_read ? 'ri-check-double-line' : 'ri-check-line'}
                        style={{ fontSize: '0.95rem', color: '#161616', opacity: msg.is_read ? 1 : 0.7 }}
                      />
                    )}
                  </Box>
                </Paper>
              </Box>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Footer / Input */}
      <Box sx={{ p: 4, borderTop: theme => `1px solid ${theme.palette.divider}` }}>
        <input ref={fileInputRef} type='file' hidden onChange={handleFileChange} />
        <form onSubmit={handleSendMessage}>
          <TextField
            fullWidth
            placeholder='Digite sua mensagem...'
            value={newMessage}
            onChange={handleInputChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position='start'>
                  <IconButton onClick={handleAttachClick} disabled={uploading || !conversationId} edge='start'>
                    {uploading ? <CircularProgress size={20} /> : <i className='ri-attachment-2' />}
                  </IconButton>
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position='end'>
                  <IconButton color='primary' type='submit' disabled={!newMessage.trim()}>
                    <i className='ri-send-plane-2-line' />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </form>
      </Box>
    </Box>
  )
}

export default ChatWindow
