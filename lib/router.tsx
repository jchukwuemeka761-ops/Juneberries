import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterContextValue {
  pathname: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue>({
  pathname: '/',
  navigate: () => {},
});

function normalizePath(path: string): string {
  if (!path) return '/';
  const cleaned = path.split('?')[0]?.split('#')[0] || '/';
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    return cleaned.slice(0, -1);
  }
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/'
  );

  useEffect(() => {
    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = normalizePath(to);
    if (typeof window !== 'undefined' && normalizePath(window.location.pathname) !== next) {
      window.history.pushState({}, '', next);
      setPathname(next);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      setPathname(next);
    }
  }, []);

  return (
    <RouterContext.Provider value={{ pathname, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function usePathname(): string {
  return useContext(RouterContext).pathname;
}

export function useNavigate(): (to: string) => void {
  return useContext(RouterContext).navigate;
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export function Link({ href, onClick, children, ...rest }: LinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target === '_blank' ||
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('mailto:')
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
