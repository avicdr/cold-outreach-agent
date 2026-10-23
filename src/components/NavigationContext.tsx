'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface NavigationContextType {
  isMobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isMobileNavOpen: false,
  openMobileNav: () => {},
  closeMobileNav: () => {},
  toggleMobileNav: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close mobile nav on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    if (isMobileNavOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  return (
    <NavigationContext.Provider
      value={{
        isMobileNavOpen,
        openMobileNav: () => setIsMobileNavOpen(true),
        closeMobileNav: () => setIsMobileNavOpen(false),
        toggleMobileNav: () => setIsMobileNavOpen((prev) => !prev),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
