import 'reflect-metadata';
import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from './prisma.service';
import { AuthController, SessionGuard } from './auth';
import { PlantsController } from './plants';
import { StatisticsController } from './statistics';
import {
  HealthController,
  MetricsController,
  MetricsService,
  TelemetryController,
} from './monitoring';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    AuthController,
    PlantsController,
    StatisticsController,
    HealthController,
    MetricsController,
    TelemetryController,
  ],
  providers: [
    PrismaService,
    SessionGuard,
    MetricsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api', { exclude: ['metrics'] });
  app.use(cookieParser());
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({ message: 'Недопустимый источник запроса' });
      return;
    }
    const started = performance.now();
    res.on('finish', () => {
      if (req.path === '/metrics') return;
      const metrics = app.get(MetricsService);
      const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      metrics.requests.inc({ method: req.method, route, status: res.statusCode });
      metrics.duration.observe({ method: req.method, route }, (performance.now() - started) / 1000);
    });
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const localized = errors
          .flatMap((e) => Object.values(e.constraints ?? {}))
          .filter((message) => /[А-Яа-яЁё]/.test(message));
        return new BadRequestException(
          localized.length ? localized : 'Проверьте формат и полноту введённых данных',
        );
      },
    }),
  );
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Листва API')
      .setDescription('Личный трекер полива комнатных растений')
      .setVersion('1.0')
      .addCookieAuth('listva_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  app.enableShutdownHooks();
  return app;
}
