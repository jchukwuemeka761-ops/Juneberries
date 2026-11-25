import React, { useCallback, useState } from 'react';
import { Link } from '@/lib/router';
import {
  apiFetch,
  getBootstrapSnapshot,
  getHealthSnapshot,
  setAuthToken,
  type HealthInfo,
  type PortalBootstrapData,
} from '@/lib/api-client';
import { type PortalScope, validatePortalRoleAccess } from '@/lib/portal-routing';
import AuthPortal from './AuthPortal';
import PortalShell, { type NavKey } from './PortalShell';

interface PortalWorkspaceProps {
  portalScope: PortalScope;
  defaultNav?: NavKey;
}

export default function PortalWorkspace({
  portalScope,
  defaultNav,
}: PortalWorkspaceProps) {
  const [health, setHealth] = useState<HealthInfo>(() => getHealthSnapshot());
  const [portalData, setPortalData] = useState<PortalBootstrapData | null>(() =>
    getBootstrapSnapshot()
  );

  const loadHealth = useCallback(async () => {
    const h = await apiFetch<HealthInfo>('/api/health');
    setHealth(h);
    return h;
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<PortalBootstrapData>('/api/portal/bootstrap');
      setPortalData(data);
    } catch {
      setPortalData(null);
    }
  }, []);

  // Registration routes always display their dedicated registration portal unless user switches
  if (
    !portalData ||
    portalScope === 'student_register' ||
    portalScope === 'teacher_register'
  ) {
    return (
      <AuthPortal
        health={health}
        portalScope={portalScope}
        onAuthenticated={loadBootstrap}
        onRefreshHealth={async () => {
          await loadHealth();
        }}
      />
    );
  }

  // If authenticated user visits a portal restricted to another role, show clear portal switch guidance
  const accessCheck = validatePortalRoleAccess(portalData.me.role, portalScope);
  if (!accessCheck.allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#0A1E3D] to-[#4C1D95] p-6">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-md border border-purple-200/70 rounded-2xl p-7 space-y-4 text-center shadow-2xl">
          <div className="font-display text-lg font-bold text-[#1E103D]">
            Signed In as {portalData.me.fullName}
          </div>
          <p className="text-sm text-slate-600">{accessCheck.error}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {accessCheck.redirectPath && (
              <Link
                href={accessCheck.redirectPath}
                className="px-4 py-2 bg-[#4C1D95] hover:bg-[#5B21B6] text-white text-xs font-semibold rounded-lg"
              >
                Open My Portal
              </Link>
            )}
            <button
              type="button"
              onClick={async () => {
                await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                setAuthToken(null);
                setPortalData(null);
                await loadHealth();
              }}
              className="px-4 py-2 border border-purple-200 text-[#1E103D] text-xs font-semibold rounded-lg hover:bg-purple-50"
            >
              Sign Out &amp; Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalShell
      data={portalData}
      defaultNav={defaultNav}
      onRefresh={loadBootstrap}
      onLoggedOut={() => {
        setPortalData(null);
        void loadHealth();
      }}
    />
  );
}
