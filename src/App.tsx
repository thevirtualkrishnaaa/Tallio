import { useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardShell from './pages/DashboardShell';

function App() {
  const { user, loading, org, orgLoading } = useAuth();

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

  if (!org) return <OnboardingPage />;

  return <DashboardShell />;
}

export default App;
