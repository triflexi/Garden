import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaService } from './prisma.service';
import { PageViewDto } from './dto';
import { within } from './timeout';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly requests = new Counter({
    name: 'app_http_requests_total',
    help: 'HTTP requests by route template',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly duration = new Histogram({
    name: 'app_http_request_duration_seconds',
    help: 'HTTP response duration',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
    registers: [this.registry],
  });
  constructor(@Inject(PrismaService) db: PrismaService) {
    collectDefaultMetrics({ register: this.registry, prefix: 'app_' });
    new Counter<'route'>({
      name: 'app_page_views_total',
      help: 'Durable page views; reloads and route navigations count once',
      labelNames: ['route'],
      registers: [this.registry],
      collect: async function () {
        try {
          const rows = await within(db.pageViewCounter.findMany());
          this.reset();
          for (const row of rows) this.inc({ route: row.route }, Number(row.total));
        } catch {
          // Keep the last durable counter while still exposing process and DB-down metrics.
        }
      },
    });
    new Gauge({
      name: 'app_database_up',
      help: 'PostgreSQL connection is ready',
      registers: [this.registry],
      collect: async function () {
        this.set((await db.isReady()) ? 1 : 0);
      },
    });
  }
}

@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}
  @Get()
  async get(@Res() response: Response) {
    response.type(this.metrics.registry.contentType).send(await this.metrics.registry.metrics());
  }
}

@Controller('telemetry')
export class TelemetryController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Post('page-view')
  @HttpCode(204)
  async pageView(@Body() input: PageViewDto) {
    await this.db.pageViewCounter.upsert({
      where: { route: input.route },
      update: { total: { increment: 1 } },
      create: { route: input.route, total: 1 },
    });
  }
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready')
  async ready() {
    if (!(await this.db.isReady()))
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    return { status: 'ok', database: 'up' };
  }
}
