// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { Chat } from '../src/components/chat';
import '@testing-library/jest-dom/vitest';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('renders questions, streams an answer, stores local history and starts over', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ type: 'text', text: 'Verified fixture response' }) + '\n'),
      ),
  );
  Element.prototype.scrollIntoView = vi.fn();
  render(<Chat />);
  const input = await screen.findByLabelText('Ask a UFC question');
  fireEvent.change(input, { target: { value: 'What is the next UFC event?' } });
  fireEvent.click(screen.getByLabelText('Send question'));
  await screen.findByText('Verified fixture response');
  await waitFor(() =>
    expect(localStorage.getItem('octagon-conversations-v1')).toContain('Verified fixture response'),
  );
  fireEvent.click(screen.getByLabelText('New conversation'));
  expect(screen.getByText('What’s on your fight mind?')).toBeInTheDocument();
});
