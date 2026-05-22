import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main style={{
      minHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      fontFamily: 'inherit',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '6rem', fontWeight: 700, margin: 0 }}>
        404
      </h1>
      <p style={{ fontSize: '1.25rem', opacity: 0.7 }}>
        This page doesn't exist.
      </p>
      <Link
        to="/"
        style={{
          padding: '0.75rem 2rem',
          background: '#b8860b',
          color: '#fff',
          borderRadius: '4px',
          textDecoration: 'none',
          fontWeight: 600
        }}
      >
        Back to Home
      </Link>
    </main>
  );
}
