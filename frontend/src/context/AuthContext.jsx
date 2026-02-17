import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      authApi.me()
        .then(({ data }) => setUser(data.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await authApi.login(email, password);
    const { access_token, refresh_token, user } = data.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const isAdmin  = () => ['super_admin', 'admin', 'campaign_manager'].includes(user?.role);
  const isAgent  = () => user?.role === 'agent';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isAgent }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
