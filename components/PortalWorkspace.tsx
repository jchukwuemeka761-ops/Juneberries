'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, setAuthToken, type HealthInfo, type PortalBootstrapData } from '@/lib/api-client';
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
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [portalData, setPortalData] = useState<PortalBootstrapData | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    (async () => {
      try {
        const h = await loadHealth();
        if (h.authenticated) {
          await loadBootstrap();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHealth, loadBootstrap]);

  if (loading || !health) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07162E] text-white">
        <div className="bg-[#0A1E3D] border border-white/15 rounded-xl px-8 py-6 text-center space-y-2">
          <div className="font-display text-base font-bold text-[#E6C567]">
            JUNEBERRIES INTERNATIONAL SCHOOLS
          </div>
          <div className="text-xs text-slate-300">Loading examination workspace...</div>
        </div>
      </div>
    );
  }

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
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-7 space-y-4 text-center">
          <div className="font-display text-lg font-bold text-[#0A1E3D]">
            Signed In as {portalData.me.fullName}
          </div>
          <p className="text-sm text-slate-600">{accessCheck.error}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {accessCheck.redirectPath && (
              <Link
                href={accessCheck.redirectPath}
                className="px-4 py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
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
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
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
