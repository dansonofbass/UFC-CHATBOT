import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page">
      <h1>No record in this corner.</h1>
      <p>This page or verified profile is not available.</p>
      <Link className="button button-primary" href="/">
        Back home
      </Link>
    </div>
  );
}
