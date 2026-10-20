import { createContext, useContext } from 'react';

// { user, project, projectRole, can, refreshSession, switchProject, navigate }
export const SessionContext = createContext(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionContext.Provider');
  return ctx;
}
