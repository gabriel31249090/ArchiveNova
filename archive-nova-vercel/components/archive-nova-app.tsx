  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget

    if (!currentChapter || !reader || !requireUser() || !supabase || !profile) return

    const form = new FormData(formElement)
    const body = readFormString(form, 'comment')

    if (!body) return

    setBusy(true)

    const { error } = await supabase
      .from('comments')
      .insert({
        chapter_id: currentChapter.id,
        user_id: profile.id,
        body,
      })

    setBusy(false)

    if (error) {
      console.error('Erro ao publicar comentário:', error)
      notify('Não foi possível publicar o comentário.')
      return
    }

    formElement.reset()

    await Promise.all([
      loadComments(),
      refreshReader(),
    ])

    notify('Comentário publicado.')
  }


  async function submitPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget

    if (!requireUser() || !supabase) return

    const form = new FormData(formElement)

    const title = readFormString(form, 'title')
    const fandom = readFormString(form, 'fandom')
    const content = readFormString(form, 'content')

    if (!title || !fandom || !content) return

    setBusy(true)

    const expectedText = readFormString(form, 'expected')

    const { data, error } = await supabase.rpc('publish_work', {
      work_title: title,
      work_summary: readFormString(form, 'summary'),
      work_rating: readFormString(form, 'rating') || 'GENERAL',
      work_status: readFormString(form, 'status') || 'ONGOING',
      fandom_names: splitLabels(fandom),
      tag_names: splitLabels(readFormString(form, 'tags')),
      chapter_title: readFormString(form, 'chapterTitle') || null,
      chapter_content: content,
      expected_chapter_count: expectedText
        ? Number(expectedText)
        : null,
      work_language: 'pt-BR',
      allow_comments_input:
        form.get('allowComments') === 'on',
    })

    setBusy(false)

    if (error) {
      console.error('Erro ao publicar obra:', error)
      notify(error.message || 'Não foi possível publicar a obra.')
      return
    }

    formElement.reset()

    publishDialog.current?.close()

    notify('Obra publicada com sucesso.')

    await refreshPublic()

    if (data) {
      await openWork(String(data))
    }
  }


  async function submitChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget

    if (!reader || !requireUser() || !supabase) return

    const form = new FormData(formElement)

    const content = readFormString(
      form,
      'chapterContent'
    )

    if (!content) return

    setBusy(true)

    const { error } = await supabase.rpc(
      'add_chapter',
      {
        target_work: reader.work.id,
        chapter_title:
          readFormString(form, 'chapterTitle') || null,
        chapter_content: content,
        publish_now: true,
      }
    )

    setBusy(false)

    if (error) {
      console.error('Erro ao publicar capítulo:', error)
      notify('Não foi possível publicar o capítulo.')
      return
    }

    formElement.reset()

    chapterDialog.current?.close()

    await Promise.all([
      refreshReader(),
      refreshPublic(),
    ])

    notify('Novo capítulo publicado.')
  }


  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget

    if (!ensureConfigured() || !supabase) return

    const form = new FormData(formElement)

    const email =
      readFormString(form, 'email').trim()

    const password =
      String(form.get('password') || '')

    setBusy(true)
    setAuthError('')

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (error) {
        console.error('Erro de login:', error)

        if (error.code === 'email_not_confirmed') {
          setAuthError(
            'Seu e-mail ainda não foi confirmado. Abra o e-mail enviado pelo ArchiveNova e confirme sua conta.'
          )
        } else if (
          error.code === 'invalid_credentials'
        ) {
          setAuthError(
            'E-mail ou senha incorretos.'
          )
        } else {
          setAuthError(
            error.message ||
              'Não foi possível entrar na sua conta.'
          )
        }

        return
      }

      formElement.reset()

      authDialog.current?.close()

      notify('Você entrou na sua conta.')

    } catch (error) {
      console.error(
        'Erro inesperado no login:',
        error
      )

      setAuthError(
        'Ocorreu um erro inesperado ao entrar.'
      )
    } finally {
      setBusy(false)
    }
  }


  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget

    if (!ensureConfigured() || !supabase) return

    const form = new FormData(formElement)

    const username =
      readFormString(form, 'username')

    const email =
      readFormString(form, 'email')

    const password =
      String(form.get('password') || '')

    const displayName =
      readFormString(form, 'displayName')

    if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
      setAuthError(
        'O usuário deve ter de 3 a 40 caracteres: letras, números ou _.'
      )
      return
    }

    if (password.length < 10) {
      setAuthError(
        'A senha deve possuir pelo menos 10 caracteres.'
      )
      return
    }

    setBusy(true)
    setAuthError('')

    try {
      const availability =
        await supabase.rpc(
          'is_username_available',
          {
            candidate: username,
          }
        )

      if (
        availability.error ||
        availability.data !== true
      ) {
        setAuthError(
          availability.error?.message ||
            'Esse nome de usuário já está em uso.'
        )

        return
      }

      const { data, error } =
        await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              window.location.origin,
            data: {
              username,
              display_name:
                displayName || null,
            },
          },
        })

      if (error) {
        console.error(
          'Erro ao criar conta:',
          error
        )

        if (
          error.code === 'user_already_exists'
        ) {
          setAuthError(
            'Já existe uma conta cadastrada com esse e-mail.'
          )
        } else {
          setAuthError(
            error.message ||
              'Não foi possível criar sua conta.'
          )
        }

        return
      }

      formElement.reset()

      if (data.session) {
        authDialog.current?.close()

        notify(
          'Conta criada e conectada.'
        )
      } else {
        setAuthError(
          'Conta criada. Confira seu e-mail para confirmar o cadastro.'
        )
      }

    } catch (error) {
      console.error(
        'Erro inesperado no cadastro:',
        error
      )

      setAuthError(
        'Ocorreu um erro inesperado ao criar sua conta.'
      )
    } finally {
      setBusy(false)
    }
  }
