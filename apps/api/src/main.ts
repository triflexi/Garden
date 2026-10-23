import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createApp } from './app';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

createApp()
  .then((app) => app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0'))
  .catch((error) => {
    console.error('Не удалось запустить API:', error);
    process.exitCode = 1;
  });
