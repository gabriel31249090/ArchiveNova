'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { NovaIcon } from '@/components/ui/nova-icon'

export type NovaConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

function NovaConfirmDialog({
  open,
  options,
  onResolve,
}: {
  open: boolean
  options: NovaConfirmOptions
  onResolve: (value: boolean) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      window.requestAnimationFrame(() => confirmButton.current?.focus())
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="nova-confirm-dialog"
      aria-labelledby="nova-confirm-title"
      aria-describedby={options.description ? 'nova-confirm-description' : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onResolve(false)
      }}
    >
      <div className="nova-confirm-icon" aria-hidden="true">
        <NovaIcon name={options.tone === 'danger' ? 'warning' : 'check'} size={22} />
      </div>
      <div className="nova-confirm-copy">
        <h2 id="nova-confirm-title">{options.title}</h2>
        {options.description ? <p id="nova-confirm-description">{options.description}</p> : null}
      </div>
      <div className="nova-confirm-actions">
        <button type="button" className="secondary-button" onClick={() => onResolve(false)}>
          {options.cancelLabel || 'Cancelar'}
        </button>
        <button
          ref={confirmButton}
          type="button"
          className={options.tone === 'danger' ? 'primary-button nova-danger-button' : 'primary-button'}
          onClick={() => onResolve(true)}
        >
          {options.confirmLabel || 'Confirmar'}
        </button>
      </div>
    </dialog>
  )
}

export function useNovaConfirm() {
  const [options, setOptions] = useState<NovaConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const ask = useCallback((next: NovaConfirmOptions) => {
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setOptions(next)
    })
  }, [])

  const resolve = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }, [])

  useEffect(() => () => {
    resolver.current?.(false)
    resolver.current = null
  }, [])

  return {
    ask,
    dialog: options ? <NovaConfirmDialog open options={options} onResolve={resolve} /> : null,
  }
}
