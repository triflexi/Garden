import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutGrid,
  Sprout,
  ChartNoAxesCombined,
  Settings2,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  Leaf,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { ErrorState, Loading, Logo } from './shared';

let lastTrackedKey = '';
export function PageView({ route }: { route: string }) {
  const location = useLocation();
  useEffect(() => {
    const key = `${location.key}:${route}`;
    if (lastTrackedKey !== key) {
      lastTrackedKey = key;
      void api('/telemetry/page-view', { method: 'POST', body: JSON.stringify({ route }) }).catch(
        () => {},
      );
    }
  }, [location.key, route]);
  return null;
}
const navigation = [
  { to: '/', title: 'Мой сад', icon: LayoutGrid },
  { to: '/plants', title: 'Растения', icon: Sprout },
  { to: '/statistics', title: 'Статистика', icon: ChartNoAxesCombined },
];
export function AppLayout() {
  const { user, loading, error, refresh, setUser } = useAuth();
  const { setTheme } = useTheme();
  const location = useLocation();
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={refresh} />;
  if (!user) return <Navigate to="/login" replace />;
  const title =
    location.pathname === '/'
      ? 'Мой сад'
      : location.pathname === '/plants'
        ? 'Растения'
        : location.pathname === '/statistics'
          ? 'Статистика'
          : location.pathname === '/settings'
            ? 'Настройки'
            : 'Моё растение';
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" aria-label="Листва — мой сад">
          <Logo />
        </Link>
        <nav aria-label="Основная навигация">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={19} />
              {item.title}
              <ChevronRight className="nav-chevron" size={14} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Settings2 size={19} />
            Настройки
          </NavLink>
          <div className="user-panel">
            <span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>Мой аккаунт</strong>
              <span title={user.email}>{user.email}</span>
            </div>
            <Button
              className="icon-button logout-button"
              aria-label="Выйти из аккаунта"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Leaf size={16} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              {new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: user.timezone,
              }).format(new Date())}
            </span>
            <LiquidGlass radius={14} className="theme-glass">
              <Button
                className="icon-button theme-toggle"
                aria-label="Переключить тему"
                onClick={() =>
                  setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
                }
              >
                <Sun className="sun-icon" size={18} />
                <Moon className="moon-icon" size={18} />
              </Button>
            </LiquidGlass>
            <span className="avatar topbar-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {[...navigation, { to: '/settings', title: 'Настройки', icon: Settings2 }].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <item.icon size={20} />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
