async function submitLogin(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  const formElement = event.currentTarget

  if (!ensureConfigured() || !supabase) return

  const form = new FormData(formElement)
  const email = readFormString(form, 'email').trim()
  const password = String(form.get('password') || '')

  setBusy(true)
  setAuthError('')

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  setBusy(false)

  if (error) {
    console.error('Erro de login:', error)

    if (error.code === 'email_not_confirmed') {
      setAuthError(
        'Seu e-mail ainda não foi confirmado. Abra o e-mail enviado pelo ArchiveNova e confirme sua conta.'
      )
    } else if (error.code === 'invalid_credentials') {
      setAuthError('E-mail ou senha incorretos.')
    } else {
      setAuthError(error.message || 'Não foi possível entrar na sua conta.')
    }

    return
  }

  formElement.reset()
  authDialog.current?.close()
  notify('Você entrou na sua conta.')
}
