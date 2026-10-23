import { test, expect } from '@playwright/test';

test('register, create a plant, water, undo, edit and persist the account', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мой сад', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить растение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название', { exact: true }).fill('Монстера Мона');
  await dialog.getByLabel(/Помещение/).fill('Гостиная');
  await dialog.getByLabel('Интервал полива, дней').fill('7');
  await dialog.getByRole('button', { name: 'Добавить растение', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.plant-card').getByText('Полить сегодня')).toBeVisible();
  await page.getByRole('button', { name: 'Полить Монстера Мона', exact: true }).click();
  await expect(page.locator('.plant-card').getByText('Полито', { exact: true })).toBeVisible();
  await page.locator('.plant-name').filter({ hasText: 'Монстера Мона' }).click();
  await expect(page.getByRole('heading', { name: 'История поливов' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Отменить полив', exact: true })
    .click();
  await expect(page.getByText('Нет записей о поливе')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Название', { exact: true })
    .fill('Монстера Мона — дома');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Монстера Мона — дома', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Монстера Мона — дома', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('desktop-light.png'), fullPage: true });
  await page.getByRole('link', { name: 'Статистика', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Статистика', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Настройки', exact: true }).first().click();
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath('desktop-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.locator('.plant-name').filter({ hasText: 'Монстера Мона — дома' }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('mobile layout, light/dark themes and isolated empty garden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(`mobile-${Date.now()}@example.test`);
  await page.getByLabel('Пароль', { exact: true }).fill('mobile-password-123');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Нет растений', exact: true })).toBeVisible();
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-light.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('.mobile-nav').getByRole('link', { name: 'Настройки' }).click();
  const timezone = page.getByLabel('Часовой пояс IANA', { exact: true });
  const lightInputBackground = await timezone.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() => timezone.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(lightInputBackground);
  await page.screenshot({ path: test.info().outputPath('mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Светлая', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
