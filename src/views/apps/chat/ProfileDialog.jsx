'use client'

import { useState, useEffect } from 'react'

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  Button,
  Avatar,
  Box,
  CircularProgress,
  IconButton
} from '@mui/material'

import { supabase } from '@/libs/supabase'

// Extrai os dados que o Google (ou outro provedor OAuth) já forneceu
const getMetaValue = (authUser, keys) => {
  const meta = authUser?.user_metadata || {}

  for (const key of keys) {
    if (meta[key]) return meta[key]
  }

  return ''
}

const ProfileDialog = ({ open, authUser, existingProfile, mandatory = false, onClose, onSaved }) => {
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pré-preenche o formulário: prioriza o perfil salvo, depois os dados do Google
  useEffect(() => {
    if (!open) return

    setFullName(existingProfile?.full_name || getMetaValue(authUser, ['full_name', 'name']))
    setDateOfBirth(existingProfile?.date_of_birth || '')
    setAvatarPreview(existingProfile?.avatar_url || getMetaValue(authUser, ['avatar_url', 'picture']))
    setAvatarFile(null)
    setError(null)
  }, [open, authUser, existingProfile])

  const handleAvatarChange = e => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]

      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()

    if (!authUser) return

    setLoading(true)
    setError(null)

    try {
      let avatarUrl = existingProfile?.avatar_url || getMetaValue(authUser, ['avatar_url', 'picture']) || ''

      // Faz upload da nova foto (se o usuário escolheu uma)
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const fileName = `${authUser.id}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile, { upsert: true })

        if (uploadError) throw uploadError

        const {
          data: { publicUrl }
        } = supabase.storage.from('avatars').getPublicUrl(fileName)

        // Cache-buster para a imagem atualizar na hora
        avatarUrl = `${publicUrl}?t=${new Date().getTime()}`
      }

      // Cria ou atualiza o perfil (upsert respeita a RLS: auth.uid() = id)
      const { data, error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          date_of_birth: dateOfBirth
        })
        .select()
        .single()

      if (upsertError) throw upsertError

      onSaved(data)
    } catch (err) {
      console.error('Erro ao salvar perfil:', err)
      setError(err.message || 'Erro ao salvar perfil. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={mandatory ? undefined : onClose} maxWidth='sm' fullWidth disableEscapeKeyDown={mandatory}>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant='h5'>{existingProfile ? 'Editar Perfil' : 'Configure seu Perfil'}</Typography>
          {!mandatory && (
            <IconButton onClick={onClose} size='small'>
              <i className='ri-close-line' />
            </IconButton>
          )}
        </Box>
        <Typography variant='body2' color='textSecondary'>
          {existingProfile
            ? 'Atualize suas informações quando quiser.'
            : 'Antes de começar a conversar, precisamos de algumas informações básicas.'}
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Avatar src={avatarPreview || ''} sx={{ width: 100, height: 100, mb: 2 }} />
              <Button variant='outlined' component='label' size='small'>
                Upload Foto
                <input type='file' hidden accept='image/*' onChange={handleAvatarChange} />
              </Button>
            </Box>
            <TextField
              fullWidth
              label='Nome Completo'
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
            <TextField
              fullWidth
              label='Data de Nascimento'
              type='date'
              required
              InputLabelProps={{ shrink: true }}
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
            />
            {error && (
              <Typography color='error' variant='body2'>
                {error}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 4 }}>
          {!mandatory && (
            <Button color='secondary' onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
          )}
          <Button variant='contained' type='submit' disabled={loading || !fullName || !dateOfBirth}>
            {loading ? <CircularProgress size={24} /> : existingProfile ? 'Salvar' : 'Finalizar Cadastro'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default ProfileDialog
