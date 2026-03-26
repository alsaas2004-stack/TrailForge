import { Outlet, NavLink } from 'react-router-dom'
import { Sun, Calendar, BarChart2, User, Zap } from 'lucide-react'

const nav = [
  { to: '/', icon: Sun, label: "Aujourd'hui" },
  { to: '/programme', icon: Calendar, label: 'Programme' },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  { to: '/profil', icon: User, label: 'Profil' },
]

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={16} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1.5, color: 'var(--text)' }}>TRAILFORGE</span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              background: isActive ? 'var(--accent-light)' : 'transparent',
              fontFamily: 'var(--font-body)', fontWeight: isActive ? 700 : 500,
              fontSize: 14, textDecoration: 'none', transition: 'all 0.15s',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent'
            })}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <div className="main-inner"><Outlet /></div>
      </main>
    </div>
  )
}
