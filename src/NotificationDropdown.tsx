import { useState, type ReactNode } from 'react'

export type NotificationDropdownItem = {
  id: string
  title: string
  detail: string
  label: string
  read: boolean
  icon?: ReactNode
  onClick: () => void
}

type NotificationDropdownProps = {
  items: NotificationDropdownItem[]
}

export default function NotificationDropdown({ items }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`notification-dropdown${open ? ' is-open' : ''}`}>
      <button className="notification-dropdown-header" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="notification-bell" aria-hidden="true">♢</span>
        <span className="notification-dropdown-heading">
          <strong>{items.length ? `${items.length} ${items.length === 1 ? 'New Activity' : 'New Activities'}` : 'No New Activities'}</strong>
          <span>What&apos;s happening around you</span>
        </span>
        <span className="notification-dropdown-chevron" aria-hidden="true">⌃</span>
      </button>
      <div className="notification-dropdown-content">
        <div className="notification-dropdown-list">
          {items.length ? items.map((item, index) => (
            <button
              className={`notification-dropdown-item${item.read ? ' is-read' : ''}`}
              type="button"
              key={item.id}
              onClick={item.onClick}
              style={{ transitionDelay: open ? `${index * 75}ms` : '0ms' }}
            >
              <span className="notification-dropdown-icon" aria-hidden="true">{item.icon || '✦'}</span>
              <span className="notification-dropdown-copy"><strong>{item.title}</strong><span>{item.detail}</span></span>
              <span className="notification-dropdown-time">{item.read ? 'Read' : item.label}</span>
            </button>
          )) : <p className="notification-dropdown-empty">Deadlines and calendar events due in the next two weeks will show up here.</p>}
        </div>
      </div>
    </div>
  )
}
