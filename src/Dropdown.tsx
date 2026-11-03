import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export type DropdownOption = { value: string; label: string }

type DropdownProps = {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

export default function Dropdown({ options, value, onChange, className = '', ariaLabel, disabled = false }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (selectedIndex + direction + options.length) % options.length
      onChange(options[nextIndex].value)
      setOpen(true)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen((current) => !current)
    }
  }

  return (
    <div ref={rootRef} className={`dropdown${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label || 'Select option'}</span>
        <span className="dropdown-chevron" aria-hidden="true" />
      </button>
      <div className="dropdown-menu" role="listbox" aria-hidden={!open}>
        {options.map((option) => (
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={`dropdown-option${option.value === value ? ' is-selected' : ''}`}
            key={option.value}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
