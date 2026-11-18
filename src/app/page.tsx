import Link from 'next/link';
import {
  Sparkles,
  ShieldCheck,
  Activity,
  Layers,
  Search,
  MessageSquare,
  BookOpen,
  Scale,
  Globe2,
  Check,
  CornerDownLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion';
export const dynamic = 'force-dynamic';
export default async function Home() {
  return (
    <>
      <section className="hero">
        <Reveal>
          <div className="hero-eyebrow">
            <span />
            THE INTELLIGENCE BEHIND THE OCTAGON
          </div>
          <h1>
            Every fight has a story.
            <br />
            <span>Know them all.</span>
          </h1>
          <p className="hero-copy">
            Your AI-powered source for UFC fighters, fight history,
            <br className="desktop-break" /> statistics, events and verified news.
          </p>
          <div className="hero-buttons">
            <Button asChild>
              <Link href="/chat">
                <Sparkles size={17} />
                Start Chatting
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/chat?q=Tell%20me%20about%20UFC%20fighters">Ask about fighters</Link>
            </Button>
          </div>
          <div className="hero-note">
            <ShieldCheck size={14} />
            Built around sources. Never around guesses.
          </div>
        </Reveal>
        <div className="visual-stage">
          <div className="red-glow" />
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="float-card float-left">
            <div className="mini-icon">
              <Activity size={18} />
            </div>
            <small>THE COMPLETE PICTURE</small>
            <h4>Beyond the record.</h4>
            <div className="stat-bars">
              {[38, 63, 50, 85, 67, 94, 76, 100].map((v, i) => (
                <i key={i} style={{ height: v + '%' }} />
              ))}
            </div>
            <p>Fight history. In context.</p>
          </div>
          <Reveal className="chat-preview">
            <div className="preview-top">
              <span className="preview-logo">
                <Sparkles size={18} />
              </span>
              <strong>Octagon intelligence</strong>
              <span className="tag">PREVIEW</span>
            </div>
            <div className="preview-question">What makes a complete fighter?</div>
            <div className="preview-answer">
              <span className="mini-spark">
                <Sparkles size={17} />
              </span>
              <div>
                <p>A better question starts with the details.</p>
                <p className="muted">
                  Explore striking, grappling, fight history, and the sources behind every answer.
                </p>
                <div className="preview-chips">
                  <span>
                    <Check size={12} />
                    Source-linked
                  </span>
                  <span>
                    <Globe2 size={12} />
                    EN / فارسی
                  </span>
                </div>
              </div>
            </div>
            <div className="preview-input">
              <span>Ask anything about the octagon...</span>
              <Link href="/chat" aria-label="Open chat">
                <CornerDownLeft size={17} />
              </Link>
            </div>
          </Reveal>
          <div className="float-card float-right">
            <span className="mini-icon">
              <ShieldCheck size={19} />
            </span>
            <small>KNOW WHAT YOU KNOW</small>
            <h4>Sources. Not speculation.</h4>
            <p>
              Original links.
              <br />
              Clear timestamps.
              <br />
              Honest uncertainty.
            </p>
            <div className="source-line">
              <BookOpen size={14} />
              Verified context
            </div>
          </div>
          <div className="floating-pill">
            <Layers size={15} />
            One conversation. Every angle.
          </div>
        </div>
        <div className="feature-strip">
          <span>FIGHT HISTORY</span>
          <i />
          <span>FIGHTER INTELLIGENCE</span>
          <i />
          <span>EVENT TRACKING</span>
          <i />
          <span>VERIFIED SOURCES</span>
        </div>
      </section>
      <section className="section">
        <Reveal>
          <div className="section-kicker">YOUR CURIOSITY. UNLOCKED.</div>
          <h2>Go deeper than the highlights.</h2>
          <p className="section-copy">
            From the first bell to the finer details. Start with a question.
          </p>
        </Reveal>
        <div className="ask-grid">
          {[
            [
              Search,
              'Fighter deep dives',
              'Explore a fighter’s career, style, and verified record.',
              'Tell me about UFC fighter careers',
            ],
            [
              Activity,
              'The story in the stats',
              'Understand the numbers behind a performance.',
              'Explain UFC fight statistics',
            ],
            [
              CalendarIcon,
              'What’s next',
              'Explore upcoming cards and confirmed changes.',
              'What is the next UFC event?',
            ],
            [
              Scale,
              'Head to head',
              'Compare two fighters using available sourced metrics.',
              'Compare UFC fighters',
            ],
          ].map(([Icon, title, copy, q]) => {
            const I = Icon as typeof Search;
            return (
              <Link
                href={`/chat?q=${encodeURIComponent(q as string)}`}
                className="panel ask-card"
                key={title as string}
              >
                <I size={23} />
                <h3>{title as string}</h3>
                <p>{copy as string}</p>
                <span>
                  Ask Octagon <MessageSquare size={14} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="section how-section">
        <div className="section-kicker">INTELLIGENCE YOU CAN TRACE</div>
        <h2>A good answer has a corner.</h2>
        <div className="grid three">
          {[
            [
              BookOpen,
              'Grounded in records',
              'Database-first retrieval brings verified facts into the conversation.',
            ],
            [
              ShieldCheck,
              'Every source matters',
              'Source links and timestamps show where an answer comes from.',
            ],
            [
              Globe2,
              'Your language. Your pace.',
              'Ask in English or Persian. Follow up without starting over.',
            ],
          ].map(([Icon, title, copy]) => {
            const I = Icon as typeof Search;
            return (
              <div className="how-card" key={title as string}>
                <I />
                <h3>{title as string}</h3>
                <p>{copy as string}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="final-cta">
        <Sparkles />
        <h2>There’s always another layer.</h2>
        <p>Find your next question. We’ll help you follow it.</p>
        <Button asChild>
          <Link href="/chat">Start Chatting</Link>
        </Button>
      </section>
    </>
  );
}
function CalendarIcon(props: React.ComponentProps<typeof BookOpen>) {
  return <BookOpen {...props} />;
}
