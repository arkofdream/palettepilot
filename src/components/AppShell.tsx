import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Menu, X, Sparkles } from 'lucide-react';
import { useWardrobe } from '@/hooks/data';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/wardrobe', label: 'My Wardrobe' },
  { to: '/buy-or-skip', label: 'Buy or Skip' },
  { to: '/showdown', label: 'Shopping Showdown' },
  { to: '/insights', label: 'Wardrobe Insights' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: wardrobe = [] } = useWardrobe();

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header-inner">
          <Link to="/" className="brand-mark" onClick={() => setMenuOpen(false)} title="PalettePilot">
            <span className="brand-name">
              <img
                src="/images/brand/palettepilot-icon.png"
                alt=""
                aria-hidden="true"
                className="brand-logo-icon"
                width="32"
                height="32"
              />
              <span className="sr-only">P</span>
              <span className="brand-text-tail">alettePilot</span>
            </span>
            <span className="brand-tag">Wardrobe Match Engine</span>
          </Link>

          <nav className={`primary-nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <span className="badge" title="Items currently in your local wardrobe">
              {wardrobe.length} {wardrobe.length === 1 ? 'piece' : 'pieces'}
            </span>
            <Link to="/buy-or-skip" className="btn btn-primary btn-sm">
              <Sparkles size={14} /> Should I buy this?
            </Link>
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label="Toggle navigation menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="main-container">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <img
              src="/images/brand/palettepilot-icon.png"
              alt=""
              aria-hidden="true"
              style={{ width: 18, height: 18, opacity: 0.8 }}
            />
            <div>
              <strong>PalettePilot</strong> · Shop Smarter. Wear Longer. · Wardrobe Match Engine
            </div>
          </div>
          <div>
            Data is stored locally in this browser (IndexedDB). No cloud account or external AI
            service is connected.
          </div>
        </div>
      </footer>
    </div>
  );
}
