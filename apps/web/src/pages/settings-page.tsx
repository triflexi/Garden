import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, Monitor, Globe2, UserRound, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, jsonBody, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { PageView } from '@/components/layout';

export function SettingsPage() {
  const { user, setUser } = useAuth(),
    { theme, setTheme } = useTheme(),
    client = useQueryClient();
  const [timezone, setTimezone] = useState(user!.timezone);
  const save = useMutation({
    mutationFn: () => api<User>('/auth/me', { method: 'PATCH', body: jsonBody({ timezone }) }),
    onSuccess: async (result) => {
      client.setQueryData(['user'], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['plants'] }),
        client.invalidateQueries({ queryKey: ['plant'] }),
        client.invalidateQueries({ queryKey: ['statistics'] }),
      ]);
      toast.success('Часовой пояс сохранён');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <PageView route="settings" />
      <div className="page-title">
        <div>
          <h1>Настройки</h1>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>
            <Sun size={20} />
            Внешний вид
          </h2>
          <div className="theme-options">
            {[
              { key: 'light', name: 'Светлая', icon: Sun },
              { key: 'dark', name: 'Тёмная', icon: Moon },
              { key: 'system', name: 'Системная', icon: Monitor },
            ].map((item) => (
              <button
                key={item.key}
                className={theme === item.key ? 'selected' : ''}
                onClick={() => setTheme(item.key as 'light' | 'dark' | 'system')}
                aria-pressed={theme === item.key}
              >
                <item.icon size={25} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>
            <Globe2 size={20} />
            Часовой пояс
          </h2>
          <p>Используется для дат полива и статистики.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <label className="field">
              Часовой пояс IANA
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                list="timezones"
                placeholder="Europe/Moscow"
              />
            </label>
            <datalist id="timezones">
              {[
                'Europe/Moscow',
                'Europe/Kaliningrad',
                'Europe/Samara',
                'Asia/Yekaterinburg',
                'Asia/Novosibirsk',
                'Asia/Irkutsk',
                'Asia/Vladivostok',
                'Europe/Minsk',
                'Asia/Almaty',
                'America/New_York',
                'UTC',
              ].map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <div className="settings-timezone-actions">
              <Button
                type="button"
                className="button-text"
                onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              >
                Как на устройстве
              </Button>
              <Button className="button-primary" type="submit" disabled={save.isPending}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </section>
        <section className="panel settings-panel account-settings">
          <h2>
            <UserRound size={20} />
            Аккаунт
          </h2>
          <div className="account-email">
            <span>Email</span>
            <strong>{user!.email}</strong>
          </div>
          <Button className="button-secondary" onClick={() => void logout()}>
            <LogOut size={16} />
            Выйти из аккаунта
          </Button>
        </section>
      </div>
    </>
  );
}
