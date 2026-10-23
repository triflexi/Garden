import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlantDto, UpdatePlantDto, RegisterDto } from '../dist/dto';

describe('Public input validation', () => {
  it('normalizes the email but preserves the password', async () => {
    const input = plainToInstance(RegisterDto, {
      email: '  Garden@Example.com  ',
      password: ' password 123 ',
    });
    expect(await validate(input)).toHaveLength(0);
    expect(input.email).toBe('garden@example.com');
    expect(input.password).toBe(' password 123 ');
  });
  it('accepts omitted optional plant fields but rejects null instead of causing Prisma errors', async () => {
    expect(
      await validate(plainToInstance(CreatePlantDto, { name: 'Монстера', intervalDays: 7 })),
    ).toHaveLength(0);
    const errors = await validate(
      plainToInstance(CreatePlantDto, { name: 'Монстера', intervalDays: 7, room: null }),
    );
    expect(errors.map((e) => e.property)).toContain('room');
  });
  it('accepts an empty patch while rejecting null for required plant properties', async () => {
    expect(await validate(plainToInstance(UpdatePlantDto, {}))).toHaveLength(0);
    const errors = await validate(
      plainToInstance(UpdatePlantDto, { name: null, intervalDays: null }),
    );
    expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['name', 'intervalDays']));
  });
});
