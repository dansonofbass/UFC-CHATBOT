// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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

it('keeps a compact status visible during partial streaming and removes it at completion', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            stream = controller;
          },
        }),
      ),
    ),
  );
  render(<Chat />);
  fireEvent.change(await screen.findByLabelText('Ask a UFC question'), {
    target: { value: 'Jon Jones record' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  expect(await screen.findByRole('status')).toHaveTextContent('Working on your answer...');
  await act(async () =>
    stream.enqueue(
      new TextEncoder().encode(
        JSON.stringify({ type: 'text', text: 'Verified partial answer' }) + '\n',
      ),
    ),
  );
  expect(await screen.findByText('Verified partial answer')).toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () => stream.close());
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByText('Verified partial answer')).toBeInTheDocument();
});

it('removes the typing status on a provider error', async () => {
  let reject!: (reason: Error) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    ),
  );
  render(<Chat />);
  fireEvent.change(await screen.findByLabelText('Ask a UFC question'), {
    target: { value: 'Latest UFC event' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  await screen.findByRole('status');
  await act(async () => reject(new Error('Provider unavailable')));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('removes the typing status when the user stops generation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Stopped', 'AbortError')),
          );
        }),
    ),
  );
  render(<Chat />);
  fireEvent.change(await screen.findByLabelText('Ask a UFC question'), {
    target: { value: 'UFC history' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  await screen.findByRole('status');
  fireEvent.click(screen.getByLabelText('Stop generation'));
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
