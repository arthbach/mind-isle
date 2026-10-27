import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="panel card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h2>Enter the palace</h2>
      <p className="sub">This island is private.</p>
      <LoginForm next={next ?? '/'} />
    </div>
  );
}
