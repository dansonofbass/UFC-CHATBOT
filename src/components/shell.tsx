'use client';
import Link from 'next/link';
import { Hexagon } from 'lucide-react';
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
  return (
    <header className="header">
      <nav aria-label="Main navigation" className="nav">
        <Brand />
        <div className="nav-links"><Link href="/chat">AI Chat</Link><Link href="/about">About</Link></div>
        <div className="nav-actions">
          <Button asChild>
            <a href="https://www.ufc.com/" target="_blank" rel="noopener noreferrer">Official UFC Site</a>
          </Button>
        </div>
      </nav>
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
        {['About', 'Privacy', 'Terms', 'Admin'].map((n) => (
          <Link href={`/${n.toLowerCase()}`} key={n}>
            {n}
          </Link>
        ))}
      </div>
    </footer>
  );
}
