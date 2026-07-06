'use client'

import { useState, useEffect, useCallback } from 'react'

import { useRouter } from 'next/navigation'

import { Box, useMediaQuery, CircularProgress } from '@mui/material'

import ConversationList from './ConversationList'
import ChatWindow from './ChatWindow'
import ProfileDialog from './ProfileDialog'
import SupportWidget from './SupportWidget'
import { supabase } from '@/libs/supabase'
import { useMessageNotifications } from '@/hooks/useMessageNotifications'

const isProfileComplete = profile => !!profile && !!profile.full_name && !!profile.date_of_birth

const ChatWrapper = () => {
  const router = useRouter()
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const isMdUp = useMediaQuery(theme => theme.breakpoints.up('md'))
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)

  // Usuário completo usado pelo chat (auth + dados do perfil)
  const currentUser = authUser ? { ...authUser, ...profile } : null

  // Som + notificação do navegador + título piscando ao receber mensagens
  useMessageNotifications(currentUser)

  const loadUser = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    // Sem sessão do Supabase -> volta para o login
    if (!user) {
      router.push('/login')

      return
    }

    setAuthUser(user)

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()

    setProfile(profileData || null)

    // Perfil incompleto -> abre o popup obrigatório
    if (!isProfileComplete(profileData)) {
      setProfileDialogOpen(true)
    }

    setLoadingAuth(false)
  }, [router])

  useEffect(() => {
    let mounted = true

    loadUser()

    // Reage a login/logout em tempo real (ex.: retorno do OAuth do Google).
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login')
      } else {
        setTimeout(() => {
          if (mounted) loadUser()
        }, 0)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadUser, router])

  const handleConversationSelect = id => {
    setSelectedConversationId(id)

    if (!isMdUp) {
      setLeftSidebarOpen(false)
    }
  }

  const handleProfileSaved = savedProfile => {
    setProfile(savedProfile)
    setProfileDialogOpen(false)
  }

  if (loadingAuth) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100dvh' }}>
        <CircularProgress />
      </Box>
    )
  }

  const isAdmin = !!currentUser?.is_admin

  return (
    <>
      {isAdmin ? (
        /* ADMIN: painel de todos os atendimentos */
        <Box
          sx={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden', bgcolor: 'background.default' }}
        >
          <ConversationList
            currentUser={currentUser}
            selectedId={selectedConversationId}
            onSelect={handleConversationSelect}
            open={leftSidebarOpen}
            onClose={() => setLeftSidebarOpen(false)}
            onEditProfile={() => setProfileDialogOpen(true)}
          />
          <ChatWindow
            currentUser={currentUser}
            conversationId={selectedConversationId}
            onToggleSidebar={() => setLeftSidebarOpen(true)}
          />
        </Box>
      ) : (
        /* USUÁRIO COMUM: tela + widget de suporte flutuante */
        <SupportWidget currentUser={currentUser} onEditProfile={() => setProfileDialogOpen(true)} />
      )}

      {authUser && (
        <ProfileDialog
          open={profileDialogOpen}
          authUser={authUser}
          existingProfile={profile}
          mandatory={!isProfileComplete(profile)}
          onClose={() => setProfileDialogOpen(false)}
          onSaved={handleProfileSaved}
        />
      )}
    </>
  )
}

export default ChatWrapper
