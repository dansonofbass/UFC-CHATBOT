'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, Hexagon } from 'lucide-react';
import { Button } from './ui/button';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Octagon home">
      <span className="brand-icon">
        <Hexagon size={23} />
        <span />
      </span>
      OCTAGON<span className="brand-ai">AI</span>
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <nav aria-label="Main navigation" className="nav">
        <Brand />
        <div className="nav-links">
          {['Fighters', 'Events', 'Rankings', 'News'].map((n) => (
            <Link key={n} href={`/${n.toLowerCase()}`}>
              {n}
            </Link>
          ))}
        </div>
        <div className="nav-actions">
          <Button asChild>
            <Link href="/chat">Launch AI</Link>
          </Button>
          <button
            className="mobile-menu icon-button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="mobile-links">
          {['Fighters', 'Events', 'Rankings', 'News', 'Compare', 'Status'].map((n) => (
            <Link key={n} onClick={() => setOpen(false)} href={`/${n.toLowerCase()}`}>
              {n}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Brand />
        <p>Independent intelligence. For the fight curious.</p>
        <small>
          Not affiliated with UFC, Zuffa, or TKO. UFC is a trademark of its respective owner.
        </small>
      </div>
      <div className="footer-links">
        {['About', 'Status', 'Privacy', 'Terms'].map((n) => (
          <Link href={`/${n.toLowerCase()}`} key={n}>
            {n}
          </Link>
        ))}
      </div>
    </footer>
  );
}
