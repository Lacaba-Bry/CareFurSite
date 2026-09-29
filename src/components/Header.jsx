import { useState } from 'react'

const sections = [
  { key: 'rooms', label: 'Rooms', href: '#rooms', type: 'link' },
  { key: 'reviews', label: 'Reviews', href: '#reviews', type: 'link' },
  { key: 'app', label: 'App', href: '#app', type: 'link' },
  { key: 'location', label: 'Location', href: '#location', type: 'link' },
]

export default function Header({ onOpenInquiry, activeSection = 'rooms' }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const openInquiry = () => {
    close()
    onOpenInquiry?.()
  }

  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <a className="brand" href="#top" onClick={close}><img src="/carefur-logo.png" alt="CareFur" /><span>CareFur</span></a>
        <button className="nav-toggle" onClick={() => setOpen((v) => !v)}>☰</button>
        <nav className={open ? 'main-nav open' : 'main-nav'}>
          {sections.map((item) => (
            <a
              key={item.key}
              href={item.href}
              onClick={close}
              className={activeSection === item.key ? 'nav-link active' : 'nav-link'}
            >
              {item.label}
            </a>
          ))}
          <button className={activeSection === 'inquiries' ? 'nav-inquiry active' : 'nav-inquiry'} type="button" onClick={openInquiry}>Inquiries</button>
          <a className={activeSection === 'reservation' ? 'nav-cta active' : 'nav-cta'} href="#reservation" onClick={close}>Reserve</a>
        </nav>
      </div>
    </header>
  )
}
