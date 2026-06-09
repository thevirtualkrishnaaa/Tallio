import { useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardShell from './pages/DashboardShell';
import DemoExpiredPage from './pages/DemoExpiredPage';

function App() {
  const { user, loading, org, orgLoading, demoExpired } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading workspace…
      </div>
    );
  }

  // Demo window elapsed — block access behind the upgrade screen
  if (demoExpired) return <DemoExpiredPage />;

  if (!org) return <OnboardingPage />;

  return <DashboardShell />;
}

export default App;
