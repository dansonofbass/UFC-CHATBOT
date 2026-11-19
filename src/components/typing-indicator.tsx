export function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      <span className="typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Working on your answer...</span>
    </div>
  );
}
