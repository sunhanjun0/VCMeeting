// React context that exposes the assembled app (bus/store/net) to components.
// Creates the app once and manages the socket connection lifecycle.

import { createContext, useContext, useRef, useEffect } from 'react';
import { createApp } from './setup.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const ref = useRef(null);
  if (!ref.current) ref.current = createApp({ url: '/' });

  useEffect(() => {
    const app = ref.current;
    app.connect();
    return () => app.disconnect();
  }, []);

  return <AppContext.Provider value={ref.current}>{children}</AppContext.Provider>;
}

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within <AppProvider>');
  return app;
}
