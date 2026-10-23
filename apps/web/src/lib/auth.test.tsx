import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';

vi.mock('./api', async (original) => {
  const actual = await original<typeof import('./api')>();
  return { ...actual, api: vi.fn().mockRejectedValue(new actual.ApiError(401, 'Войдите')) };
});

it('updates the active user observer on login and clears private data on logout', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Profile() {
    const { user, loading, setUser } = useAuth();
    if (loading) return <span>Загрузка</span>;
    return (
      <>
        <span>{user?.email ?? 'Гость'}</span>
        <button
          onClick={() =>
            setUser({ id: 'new-user', email: 'garden@example.test', timezone: 'Europe/Moscow' })
          }
        >
          Войти
        </button>
        <button onClick={() => setUser(null)}>Выйти</button>
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Profile />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('Гость');
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByText('garden@example.test')).toBeVisible();
  client.setQueryData(['plants'], [{ id: 'private-plant' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(await screen.findByText('Гость')).toBeVisible();
  expect(client.getQueryData(['plants'])).toBeUndefined();
  client.clear();
});
