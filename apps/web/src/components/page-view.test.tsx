import { StrictMode, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { PageView } from './layout';

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: vi.fn().mockResolvedValue({}),
}));

it('counts navigation once under StrictMode and excludes ordinary rerenders', () => {
  function Garden() {
    const [count, setCount] = useState(0);
    return (
      <>
        <PageView route="dashboard" />
        <button onClick={() => setCount(count + 1)}>Обновить {count}</button>
        <Link to="/statistics">Статистика</Link>
      </>
    );
  }
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname: '/', key: 'page-view-test' }]}>
        <Routes>
          <Route path="/" element={<Garden />} />
          <Route path="/statistics" element={<PageView route="statistics" />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Обновить 0' }));
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('link', { name: 'Статистика' }));
  expect(api).toHaveBeenCalledTimes(2);
  expect(api).toHaveBeenLastCalledWith('/telemetry/page-view', {
    method: 'POST',
    body: JSON.stringify({ route: 'statistics' }),
  });
});
