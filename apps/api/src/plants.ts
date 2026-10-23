import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { Plant, WateringEvent } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthRequest, SessionGuard } from './auth';
import { CreatePlantDto, UpdatePlantDto, WaterPlantDto } from './dto';
import { wateringSchedule } from './calendar';

type PlantWithWaterings = Plant & { waterings: WateringEvent[] };
export function serializePlant(plant: PlantWithWaterings, timezone: string) {
  const lastWateredAt = plant.waterings[0]?.happenedAt ?? null;
  return {
    ...plant,
    lastWateredAt,
    ...wateringSchedule(plant.createdAt, lastWateredAt, plant.intervalDays, timezone),
  };
}

@ApiTags('Растения')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('plants')
export class PlantsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private async owned(id: string, userId: string) {
    const plant = await this.db.plant.findFirst({
      where: { id, userId },
      include: { waterings: { orderBy: { happenedAt: 'desc' } } },
    });
    if (!plant) throw new NotFoundException('Растение не найдено');
    return plant;
  }

  private initialWatering(value: string | undefined, timezone: string) {
    if (!value) return undefined;
    const date = DateTime.fromISO(value, { zone: timezone }).startOf('day');
    if (!date.isValid || date > DateTime.now().setZone(timezone).endOf('day'))
      throw new BadRequestException('Укажите существующую дату не позднее сегодняшней');
    return { create: { happenedAt: date.toJSDate() } };
  }

  @Get()
  async list(@Req() request: AuthRequest) {
    const plants = await this.db.plant.findMany({
      where: { userId: request.user.id },
      include: { waterings: { orderBy: { happenedAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    return plants.map((plant) => serializePlant(plant, request.user.timezone));
  }

  @Post()
  async create(@Req() request: AuthRequest, @Body() input: CreatePlantDto) {
    const { lastWateredOn, ...fields } = input;
    const plant = await this.db.plant.create({
      data: {
        ...fields,
        userId: request.user.id,
        waterings: this.initialWatering(lastWateredOn, request.user.timezone),
      },
      include: { waterings: { orderBy: { happenedAt: 'desc' } } },
    });
    return serializePlant(plant, request.user.timezone);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    return serializePlant(await this.owned(id, request.user.id), request.user.timezone);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthRequest,
    @Body() input: UpdatePlantDto,
  ) {
    await this.owned(id, request.user.id);
    if (input.lastWateredOn !== undefined)
      throw new BadRequestException('Последний полив меняется через историю поливов');
    const { lastWateredOn: _, ...fields } = input;
    const plant = await this.db.plant.update({
      where: { id },
      data: fields,
      include: { waterings: { orderBy: { happenedAt: 'desc' } } },
    });
    return serializePlant(plant, request.user.timezone);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    await this.owned(id, request.user.id);
    await this.db.plant.delete({ where: { id } });
  }

  @Get(':id/waterings')
  async history(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
    return (await this.owned(id, request.user.id)).waterings;
  }

  @Post(':id/waterings')
  @HttpCode(200)
  async water(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthRequest,
    @Body() input: WaterPlantDto,
  ) {
    await this.owned(id, request.user.id);
    await this.db.wateringEvent.upsert({
      where: { plantId_requestId: { plantId: id, requestId: input.requestId } },
      update: {},
      create: { plantId: id, requestId: input.requestId },
    });
    return serializePlant(await this.owned(id, request.user.id), request.user.timezone);
  }

  @Delete(':id/waterings/:eventId')
  @HttpCode(204)
  async undo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthRequest,
  ) {
    await this.owned(id, request.user.id);
    const result = await this.db.wateringEvent.deleteMany({ where: { id: eventId, plantId: id } });
    if (!result.count) throw new NotFoundException('Запись полива не найдена');
  }
}
