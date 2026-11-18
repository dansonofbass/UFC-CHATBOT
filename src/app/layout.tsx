import type { Metadata } from 'next';
import './globals.css';
import { Header, Footer } from '@/components/shell';
export const metadata: Metadata = {
  title: { default: 'OCTAGON AI — Every fight has a story', template: '%s | OCTAGON AI' },
  description:
    'An independent UFC research assistant. Explore fighters, fight history, events and verified sources in English and Persian.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
