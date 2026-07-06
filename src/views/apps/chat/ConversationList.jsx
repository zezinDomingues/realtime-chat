'use client'

import { useState, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import {
  Box,
  Typography,
  TextField,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  InputAdornment,
  Divider,
  Badge,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon
} from '@mui/material'

import { supabase } from '@/libs/supabase'
import { usePresence } from '@/hooks/usePresence'

const ConversationList = ({ currentUser, selectedId, onSelect, onEditProfile }) => {
  const router = useRouter()
  const [conversations, setConversations] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const onlineUsers = usePresence(currentUser?.id)

  const handleLogout = async () => {
    setMenuAnchor(null)
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    if (!currentUser) return

    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations (
            id,
            created_at,
            messages (content, created_at, is_read, sender_id, attachment_type)
          ),
          profiles:user_id (id, full_name, avatar_url)
        `)
        .neq('user_id', currentUser.id)

      if (!error && data) {
        const formatted = data.map(item => {
          const msgs = item.conversations.messages || []

          const lastMsg = msgs.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]

          const attachmentLabel = {
            image: '📷 Imagem',
            video: '🎥 Vídeo',
            file: '📎 Arquivo'
          }

          const preview = lastMsg
            ? lastMsg.content || attachmentLabel[lastMsg.attachment_type] || 'Anexo'
            : 'Inicie uma conversa'

          return {
            id: item.conversation_id,
            otherUser: item.profiles,
            lastMessage: preview,
            lastMessageTime: lastMsg ? new Date(lastMsg.created_at).getTime() : 0,
            unreadCount: msgs.filter(m => !m.is_read && m.sender_id !== currentUser.id).length
          }
        })

        // Não lidas primeiro; dentro de cada grupo, mais recentes no topo
        formatted.sort((a, b) => {
          if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
            return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0)
          }

          return b.lastMessageTime - a.lastMessageTime
        })

        setConversations(formatted)
      }

      setLoading(false)
    }

    fetchConversations()

    const subscription = supabase
      .channel('conversations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchConversations()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [currentUser])

  // Filtra os atendimentos existentes pelo nome do usuário (client-side).
  const filteredConversations =
    searchQuery.trim().length > 0
      ? conversations.filter(conv =>
          (conv.otherUser?.full_name || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : conversations

  return (
    <Box
      sx={{
        width: 350,
        borderRight: theme => `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Cabeçalho com o usuário logado */}
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar src={currentUser?.avatar_url} sx={{ width: 40, height: 40 }} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant='subtitle2' noWrap sx={{ fontWeight: 600 }}>
            {currentUser?.full_name || 'Meu perfil'}
          </Typography>
          <Typography variant='caption' color='textSecondary' noWrap sx={{ display: 'block' }}>
            {currentUser?.email}
          </Typography>
        </Box>
        <IconButton onClick={e => setMenuAnchor(e.currentTarget)}>
          <i className='ri-more-2-line' />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null)
              onEditProfile()
            }}
          >
            <ListItemIcon>
              <i className='ri-user-settings-line' />
            </ListItemIcon>
            Editar perfil
          </MenuItem>
          <MenuItem onClick={handleLogout}>
            <ListItemIcon>
              <i className='ri-logout-box-r-line' />
            </ListItemIcon>
            Sair
          </MenuItem>
        </Menu>
      </Box>

      <Divider />

      <Box sx={{ p: 4 }}>
        <Typography variant='h6' sx={{ mb: 4 }}>
          Atendimentos
        </Typography>
        <TextField
          fullWidth
          size='small'
          placeholder='Buscar atendimento...'
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <i className='ri-search-line' />
              </InputAdornment>
            )
          }}
        />
      </Box>

      <Divider />

      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : filteredConversations.length === 0 ? (
          <Typography variant='body2' color='textSecondary' sx={{ px: 4, py: 6, textAlign: 'center' }}>
            {searchQuery ? 'Nenhum atendimento encontrado' : 'Nenhum atendimento ainda'}
          </Typography>
        ) : (
          <List>
            {filteredConversations.map(conv => {
              const hasUnread = conv.unreadCount > 0

              return (
                <ListItemButton
                  key={conv.id}
                  selected={selectedId === conv.id}
                  onClick={() => onSelect(conv.id)}
                  sx={
                    hasUnread
                      ? {
                          borderLeft: '4px solid',
                          borderColor: 'error.main',
                          bgcolor: 'rgba(244,67,54,0.14)',
                          '&:hover': { bgcolor: 'rgba(244,67,54,0.22)' }
                        }
                      : { borderLeft: '4px solid transparent' }
                  }
                >
                  <ListItemAvatar>
                    <Badge
                      overlap='circular'
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      variant='dot'
                      color={onlineUsers[conv.otherUser.id]?.status === 'online' ? 'success' : 'warning'}
                      invisible={!onlineUsers[conv.otherUser.id]}
                    >
                      <Avatar src={conv.otherUser.avatar_url} />
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conv.otherUser.full_name}
                    secondary={conv.lastMessage}
                    slotProps={{
                      primary: { sx: { fontWeight: hasUnread ? 700 : 400 } },
                      secondary: {
                        noWrap: true,
                        sx: { color: hasUnread ? 'error.main' : 'text.secondary', fontWeight: hasUnread ? 600 : 400 }
                      }
                    }}
                  />
                  {hasUnread && (
                    <Box
                      sx={{
                        ml: 2,
                        minWidth: 22,
                        height: 22,
                        px: 1,
                        borderRadius: 999,
                        bgcolor: 'error.main',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'pulseUnread 1.4s ease-in-out infinite',
                        '@keyframes pulseUnread': {
                          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244,67,54,0.6)' },
                          '50%': { boxShadow: '0 0 0 6px rgba(244,67,54,0)' }
                        }
                      }}
                    >
                      {conv.unreadCount}
                    </Box>
                  )}
                </ListItemButton>
              )
            })}
          </List>
        )}
      </Box>
    </Box>
  )
}

export default ConversationList
