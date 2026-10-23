import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type User } from './api';

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  setUser: (user: User | null) => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await api<User>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  const setUser = (user: User | null) => {
    void client.cancelQueries();
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'user' });
    client.setQueryData(['user'], user);
  };
  useEffect(() => {
    const expired = () => {
      void client.cancelQueries();
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'user' });
      client.setQueryData(['user'], null);
    };
    window.addEventListener('listva:unauthorized', expired);
    return () => window.removeEventListener('listva:unauthorized', expired);
  }, [client]);
  return (
    <AuthContext.Provider
      value={{
        user: query.data ?? null,
        loading: query.isPending,
        error: query.error,
        refresh: () => {
          void query.refetch();
        },
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
