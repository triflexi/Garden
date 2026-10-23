import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { within } from './timeout';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readinessProbe: Promise<boolean> | undefined;

  async isReady() {
    // Concurrent health checks share the same query instead of filling the pool during an outage.
    this.readinessProbe ??= this.$queryRaw`SELECT 1`
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        this.readinessProbe = undefined;
      });
    return within(this.readinessProbe).catch(() => false);
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
