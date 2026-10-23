import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, ArrowRight, LoaderCircle, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlantArt } from '@/components/plant-art';
import { Loading, Logo } from '@/components/shared';
import { PageView } from '@/components/layout';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api, jsonBody, type User } from '@/lib/api';

export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, loading, setUser } = useAuth();
  const { setTheme } = useTheme();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const schema = z.object({
    email: z.email('Введите корректный email'),
    password: z
      .string()
      .min(register ? 8 : 1, register ? 'Минимум 8 символов' : 'Введите пароль')
      .max(128, 'Не больше 128 символов'),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  const submit = form.handleSubmit(async (values) => {
    setError('');
    try {
      const result = await api<User>(register ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: jsonBody({
          ...values,
          ...(register ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
        }),
      });
      setUser(result);
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  });
  return (
    <div className="auth-page">
      <PageView route={register ? 'register' : 'login'} />
      <div className="auth-form-side">
        <div className="auth-top">
          <Link to="/login">
            <Logo />
          </Link>
          <Button
            className="icon-button"
            aria-label="Переключить тему"
            onClick={() =>
              setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
            }
          >
            <Sun className="sun-icon" size={19} />
            <Moon className="moon-icon" size={19} />
          </Button>
        </div>
        <div className="auth-form-wrap">
          <h1>{register ? 'Регистрация' : 'Вход'}</h1>
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="field" htmlFor="email">
              Email
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register('email')}
                aria-invalid={Boolean(form.formState.errors.email)}
              />
              {form.formState.errors.email && (
                <span className="field-error">{form.formState.errors.email.message}</span>
              )}
            </label>
            <label className="field" htmlFor="password">
              Пароль
              <div className="password-input">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'Не менее 8 символов' : 'Ваш пароль'}
                  {...form.register('password')}
                  aria-invalid={Boolean(form.formState.errors.password)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {form.formState.errors.password && (
                <span className="field-error">{form.formState.errors.password.message}</span>
              )}
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button
              className="button-primary auth-submit"
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {register ? 'Создать аккаунт' : 'Войти'}
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
          </form>
          <p className="auth-switch">
            {register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Войти' : 'Зарегистрироваться'}
            </Link>
          </p>
        </div>
      </div>
      <div className="auth-visual">
        <div className="auth-visual-grain" />
        <div className="auth-plant-scene">
          <span className="scene-circle" />
          <PlantArt kind="monstera" />
        </div>
      </div>
    </div>
  );
}
