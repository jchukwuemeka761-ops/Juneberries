import React from 'react';
import PortalWorkspace from '@/components/PortalWorkspace';
import { RouterProvider, usePathname } from '@/lib/router';

function AppRoutes() {
  const pathname = usePathname();

  switch (pathname) {
    case '/student':
      return <PortalWorkspace key="student" portalScope="student" defaultNav="student-exams" />;
    case '/student/register':
      return <PortalWorkspace key="student-register" portalScope="student_register" />;
    case '/teacher':
      return <PortalWorkspace key="teacher" portalScope="teacher" defaultNav="questions" />;
    case '/teacher/register':
      return <PortalWorkspace key="teacher-register" portalScope="teacher_register" />;
    case '/questions':
      return <PortalWorkspace key="questions" portalScope="questions" defaultNav="questions" />;
    case '/results':
      return <PortalWorkspace key="results" portalScope="results_checker" defaultNav="result-checker" />;
    case '/admin':
      return <PortalWorkspace key="admin" portalScope="admin" defaultNav="operations" />;
    case '/':
    default:
      return <PortalWorkspace key="gateway" portalScope="gateway" />;
  }
}

export default function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}
