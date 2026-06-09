import React from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function formatLeft(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

const DemoBanner: React.FC = () => {
  const { isDemo, demoMsLeft, logout } = useAuth();

  if (!isDemo) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Sparkles size={15} />
        <span className="font-medium">Demo mode</span>
        <span className="hidden sm:inline text-amber-600">
          — you're exploring Tallio with sample data
        </span>
      </div>
      <div className="flex items-center gap-3">
        {demoMsLeft !== null && (
          <span className="flex items-center gap-1 text-amber-700 tabular-nums">
            <Clock size={14} />
            {formatLeft(demoMsLeft)}
          </span>
        )}
        <button
          onClick={logout}
          className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-amber-700 whitespace-nowrap"
        >
          Create free account
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
