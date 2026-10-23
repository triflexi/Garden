import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { AuthRequest, SessionGuard } from './auth';
import { PrismaService } from './prisma.service';
import { localDate, wateringSchedule } from './calendar';

@ApiTags('Статистика')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get()
  async get(@Req() request: AuthRequest) {
    const zone = request.user.timezone;
    const today = DateTime.now().setZone(zone).startOf('day');
    const start = today.minus({ days: 29 });
    const [plants, waterings] = await this.db.$transaction([
      this.db.plant.findMany({
        where: { userId: request.user.id },
        include: { waterings: { orderBy: { happenedAt: 'desc' }, take: 1 } },
      }),
      this.db.wateringEvent.findMany({
        where: {
          plant: { userId: request.user.id },
          happenedAt: { gte: start.toJSDate(), lte: today.endOf('day').toJSDate() },
        },
      }),
    ]);
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: start.plus({ days: i }).toISODate()!,
      count: 0,
    }));
    for (const event of waterings) {
      const bucket = daily.find((day) => day.date === localDate(event.happenedAt, zone));
      if (bucket) bucket.count++;
    }
    const schedules = plants.map((p) =>
      wateringSchedule(p.createdAt, p.waterings[0]?.happenedAt ?? null, p.intervalDays, zone),
    );
    return {
      totalPlants: plants.length,
      overduePlants: schedules.filter((s) => s.status === 'overdue').length,
      dueToday: schedules.filter((s) => s.status === 'today').length,
      wateringsToday: daily[29].count,
      wateringsLast30Days: waterings.length,
      daily,
    };
  }
}
