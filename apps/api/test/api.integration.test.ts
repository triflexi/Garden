import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../dist/app';
import type { NestExpressApplication } from '@nestjs/platform-express';

describe.skipIf(!process.env.DATABASE_URL)('API with PostgreSQL', () => {
  let app: NestExpressApplication,
    db: PrismaClient,
    owner: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>;
  const prefix = `test-${randomUUID()}`;
  const email = `${prefix}@example.test`,
    otherEmail = `${prefix}-other@example.test`,
    password = 'testing-password-123';
  let plantId: string;
  beforeAll(async () => {
    db = new PrismaClient();
    app = await createApp();
    await app.init();
    owner = request.agent(app.getHttpServer());
    other = request.agent(app.getHttpServer());
    const registered = await owner
      .post('/api/auth/register')
      .send({ email, password, timezone: 'America/New_York' })
      .expect(201);
    expect(registered.body).not.toHaveProperty('passwordHash');
    expect(registered.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(registered.headers['set-cookie'][0]).toContain('SameSite=Lax');
    await other.post('/api/auth/register').send({ email: otherEmail, password }).expect(201);
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app?.close();
    await db?.$disconnect();
  });
  it('requires authentication and validates credentials', async () => {
    await request(app.getHttpServer()).get('/api/plants').expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'incorrect' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(409);
    const profile = await owner.get('/api/auth/me').expect(200);
    expect(profile.body.email).toBe(email);
    const record = await db.user.findUniqueOrThrow({ where: { email } });
    expect(record.passwordHash).toMatch(/^\$argon2id\$/);
    const session = await db.session.findFirstOrThrow({ where: { userId: record.id } });
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects cross-origin writes', async () => {
    await owner
      .post('/api/plants')
      .set('Origin', 'http://evil.example')
      .send({ name: 'Bad', intervalDays: 7 })
      .expect(403);
  });
  it('creates a plant due today and validates intervals', async () => {
    await owner.post('/api/plants').send({ name: 'Invalid', intervalDays: 0 }).expect(400);
    await owner
      .post('/api/plants')
      .send({ name: 'Future', intervalDays: 7, lastWateredOn: '2099-01-01' })
      .expect(400);
    const created = await owner
      .post('/api/plants')
      .send({
        name: 'Монстера',
        species: 'Monstera deliciosa',
        room: 'Гостиная',
        intervalDays: 7,
        icon: 'monstera',
      })
      .expect(201);
    plantId = created.body.id;
    expect(created.body.status).toBe('today');
    expect(created.body.waterings).toHaveLength(0);
  });
  it('isolates all plant and watering operations by owner', async () => {
    const list = await other.get('/api/plants').expect(200);
    expect(list.body).toHaveLength(0);
    await other.get(`/api/plants/${plantId}`).expect(404);
    await other.patch(`/api/plants/${plantId}`).send({ name: 'Stolen' }).expect(404);
    await other.delete(`/api/plants/${plantId}`).expect(404);
    await other.get(`/api/plants/${plantId}/waterings`).expect(404);
    await other
      .post(`/api/plants/${plantId}/waterings`)
      .send({ requestId: randomUUID() })
      .expect(404);
  });
  it('records one watering on retries and updates statistics', async () => {
    const input = { requestId: randomUUID() };
    const first = await owner.post(`/api/plants/${plantId}/waterings`).send(input).expect(200);
    expect(first.body.status).toBe('upcoming');
    expect(first.body.daysUntil).toBe(7);
    const second = await owner.post(`/api/plants/${plantId}/waterings`).send(input).expect(200);
    expect(second.body.waterings).toHaveLength(1);
    const stats = await owner.get('/api/statistics').expect(200);
    expect(stats.body).toMatchObject({
      totalPlants: 1,
      dueToday: 0,
      wateringsToday: 1,
      wateringsLast30Days: 1,
    });
    expect(stats.body.daily).toHaveLength(30);
    const foreign = await other.get('/api/statistics').expect(200);
    expect(foreign.body.wateringsLast30Days).toBe(0);
  });
  it('recalculates a changed interval and undoes a watering', async () => {
    const updated = await owner
      .patch(`/api/plants/${plantId}`)
      .send({ intervalDays: 3 })
      .expect(200);
    expect(updated.body.daysUntil).toBe(3);
    const eventId = updated.body.waterings[0].id;
    await other.delete(`/api/plants/${plantId}/waterings/${eventId}`).expect(404);
    await owner.delete(`/api/plants/${plantId}/waterings/${eventId}`).expect(204);
    const result = await owner.get(`/api/plants/${plantId}`).expect(200);
    expect(result.body.status).toBe('today');
    expect(result.body.waterings).toHaveLength(0);
    const stats = await owner.get('/api/statistics').expect(200);
    expect(stats.body.wateringsToday).toBe(0);
  });
  it('exports durable page views without counting ordinary API requests', async () => {
    const before = await db.pageViewCounter.findUnique({ where: { route: 'dashboard' } });
    await owner.get('/api/plants').expect(200);
    const unchanged = await db.pageViewCounter.findUnique({ where: { route: 'dashboard' } });
    expect(unchanged?.total ?? 0n).toBe(before?.total ?? 0n);
    await request(app.getHttpServer())
      .post('/api/telemetry/page-view')
      .send({ route: 'dashboard' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/telemetry/page-view')
      .send({ route: '/plants/private-id' })
      .expect(400);
    const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(metrics.text).toContain('app_page_views_total{route="dashboard"}');
    const after = await db.pageViewCounter.findUniqueOrThrow({ where: { route: 'dashboard' } });
    expect(after.total).toBe((before?.total ?? 0n) + 1n);
  });
  it('checks liveness and database readiness', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
  });
  it('persists sessions and data across an API restart', async () => {
    const loggedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = loggedIn.headers['set-cookie'][0].split(';')[0];
    await app.close();
    app = await createApp();
    await app.init();
    const persisted = await request(app.getHttpServer())
      .get('/api/plants')
      .set('Cookie', cookie)
      .expect(200);
    expect(persisted.body.some((p: { id: string }) => p.id === plantId)).toBe(true);
    owner = request.agent(app.getHttpServer());
    await owner.post('/api/auth/login').send({ email, password }).expect(200);
  });
  it('rejects unknown timezones, revokes logout and expires sessions', async () => {
    await owner.patch('/api/auth/me').send({ timezone: 'Not/A_Zone' }).expect(400);
    await owner.patch('/api/auth/me').send({ timezone: 'Europe/Moscow' }).expect(200);
    const loggedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = loggedIn.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    await owner.get('/api/plants').expect(401);
  });
});
