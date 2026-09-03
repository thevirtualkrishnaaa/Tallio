import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';

// AuthPage is what a logged-out visitor sees, so it stays in the first chunk.
// Everything behind the login is fetched once there is a session to show.
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const DashboardShell = lazy(() => import('./pages/DashboardShell'));
const DemoExpiredPage = lazy(() => import('./pages/DemoExpiredPage'));

const Splash = ({ label }: { label: string }) => (
  <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
    {label}
  </div>
);

function App() {
  const { user, loading, org, orgLoading, demoExpired } = useAuth();

  if (loading) return <Splash label="Loading…" />;

  if (!user) return <AuthPage />;

  if (orgLoading) return <Splash label="Loading workspace…" />;

  return (
    <Suspense fallback={<Splash label="Loading workspace…" />}>
      {/* Demo window elapsed — block access behind the upgrade screen */}
      {demoExpired ? <DemoExpiredPage /> : !org ? <OnboardingPage /> : <DashboardShell />}
    </Suspense>
  );
}

export default App;
