import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme';

let matches = false;
let onChange: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  matches = false;
  onChange = undefined;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: () => void) => {
      onChange = listener;
    },
    removeEventListener: () => {
      onChange = undefined;
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Preferences() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span>Выбрано: {theme}</span>
      <button onClick={() => setTheme('dark')}>Тёмная</button>
      <button onClick={() => setTheme('light')}>Светлая</button>
      <button onClick={() => setTheme('system')}>Системная</button>
    </>
  );
}

it('persists an explicit choice across remounts', () => {
  const first = render(
    <ThemeProvider>
      <Preferences />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Тёмная' }));
  expect(document.documentElement).toHaveClass('dark');
  first.unmount();
  render(
    <ThemeProvider>
      <Preferences />
    </ThemeProvider>,
  );
  expect(screen.getByText('Выбрано: dark')).toBeVisible();
  expect(document.documentElement).toHaveClass('dark');
});

it('follows system changes only while system theme is selected', () => {
  render(
    <ThemeProvider>
      <Preferences />
    </ThemeProvider>,
  );
  expect(document.documentElement).not.toHaveClass('dark');
  act(() => {
    matches = true;
    onChange?.();
  });
  expect(document.documentElement).toHaveClass('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Светлая' }));
  act(() => {
    matches = true;
    onChange?.();
  });
  expect(document.documentElement).not.toHaveClass('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Системная' }));
  expect(document.documentElement).toHaveClass('dark');
});
