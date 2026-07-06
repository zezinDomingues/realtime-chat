'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import {
  Box,
  Typography,
  IconButton,
  Fab,
  Paper,
  Slide,
  Menu,
  MenuItem,
  ListItemIcon,
  Avatar,
  CircularProgress
} from '@mui/material'

import ChatWindow from './ChatWindow'
import { supabase } from '@/libs/supabase'

// Paleta SmartRanch
const BRAND = {
  gold: '#e3d007',
  goldDark: '#c4b306',
  dark: '#161616',
  surface: '#1e1e1e',
  onGold: '#161616'
}

const SupportWidget = ({ currentUser, onEditProfile }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [loadingConv, setLoadingConv] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)

  const handleLogout = async () => {
    setMenuAnchor(null)
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Abre o widget e garante que a conversa com o Suporte (admin) exista.
  const handleToggle = async () => {
    const willOpen = !open

    setOpen(willOpen)

    if (willOpen && !conversationId) {
      setLoadingConv(true)

      const { data, error } = await supabase.rpc('start_support_conversation')

      if (error || !data) {
        console.error('Erro ao abrir suporte:', error)
      } else {
        setConversationId(data)
      }

      setLoadingConv(false)
    }
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        bgcolor: BRAND.dark,
        color: '#fff'
      }}
    >
      {/* Barra superior */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 4, md: 8 },
          py: 4
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: BRAND.gold,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <i className='ri-plant-line' style={{ color: BRAND.onGold, fontSize: '1.25rem' }} />
          </Box>
          <Typography variant='h6' sx={{ fontWeight: 700, color: '#fff' }}>
            Smart<span style={{ color: BRAND.gold }}>Ranch</span>
          </Typography>
        </Box>

        <IconButton onClick={e => setMenuAnchor(e.currentTarget)} sx={{ color: '#fff' }}>
          <Avatar src={currentUser?.avatar_url} sx={{ width: 34, height: 34 }} />
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

      {/* Conteúdo central */}
      <Box
        sx={{
          height: 'calc(100dvh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 4
        }}
      >
        <Typography variant='h3' sx={{ fontWeight: 800, mb: 3, color: '#fff' }}>
          Olá, {currentUser?.full_name?.split(' ')[0] || 'seja bem-vindo'}!
        </Typography>
        <Typography variant='h6' sx={{ maxWidth: 560, color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>
          Precisa de ajuda? Nossa equipe de suporte está pronta para te atender. Clique no botão no canto inferior
          direito para iniciar uma conversa.
        </Typography>
        <Box
          sx={{
            mt: 6,
            px: 4,
            py: 2,
            borderRadius: 999,
            border: `1px solid ${BRAND.gold}`,
            color: BRAND.gold,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2
          }}
        >
          <i className='ri-customer-service-2-line' />
          <Typography variant='body2' sx={{ color: BRAND.gold, fontWeight: 600 }}>
            Suporte SmartRanch
          </Typography>
        </Box>
      </Box>

      {/* Painel do chat */}
      <Slide direction='up' in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={12}
          sx={{
            position: 'fixed',
            bottom: { xs: 0, sm: 100 },
            right: { xs: 0, sm: 24 },
            width: { xs: '100%', sm: 380 },
            height: { xs: '100dvh', sm: 560 },
            maxHeight: { sm: 'calc(100dvh - 120px)' },
            display: 'flex',
            flexDirection: 'column',
            borderRadius: { xs: 0, sm: 2 },
            overflow: 'hidden',
            zIndex: 1300
          }}
        >
          {/* Header do painel */}
          <Box
            sx={{
              px: 4,
              py: 3,
              bgcolor: BRAND.gold,
              color: BRAND.onGold,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <i className='ri-customer-service-2-line' style={{ fontSize: '1.4rem' }} />
              <Box>
                <Typography variant='subtitle1' sx={{ fontWeight: 700, color: BRAND.onGold, lineHeight: 1.2 }}>
                  Suporte
                </Typography>
                <Typography variant='caption' sx={{ color: 'rgba(22,22,22,0.7)' }}>
                  Normalmente respondemos rápido
                </Typography>
              </Box>
            </Box>
            <IconButton size='small' onClick={() => setOpen(false)} sx={{ color: BRAND.onGold }}>
              <i className='ri-close-line' />
            </IconButton>
          </Box>

          {/* Corpo do chat */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {loadingConv ? (
              <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : (
              <ChatWindow
                currentUser={currentUser}
                conversationId={conversationId}
                onToggleSidebar={() => {}}
                hideHeader
                emptyText='Iniciando conversa com o suporte...'
              />
            )}
          </Box>
        </Paper>
      </Slide>

      {/* Botão flutuante (canto inferior direito) */}
      <Fab
        onClick={handleToggle}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: BRAND.gold,
          color: BRAND.onGold,
          zIndex: 1301,
          '&:hover': { bgcolor: BRAND.goldDark }
        }}
      >
        <i className={open ? 'ri-close-line' : 'ri-customer-service-2-line'} style={{ fontSize: '1.5rem' }} />
      </Fab>
    </Box>
  )
}

export default SupportWidget
