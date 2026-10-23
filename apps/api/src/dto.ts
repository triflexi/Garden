import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

const OptionalField = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined);

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email аккаунта' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Введите корректный email' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow', description: 'Часовой пояс IANA' })
  @OptionalField()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Введите корректный email' })
  @MaxLength(254)
  email!: string;
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Europe/Moscow' })
  @IsString()
  @MaxLength(100)
  timezone!: string;
}

export class CreatePlantDto {
  @ApiProperty({ example: 'Монстера Мона', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Укажите название растения' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Monstera deliciosa' })
  @OptionalField()
  @IsString()
  @MaxLength(100)
  species?: string;
  @ApiPropertyOptional({ example: 'Гостиная' })
  @OptionalField()
  @IsString()
  @MaxLength(80)
  room?: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @OptionalField()
  @IsString()
  @MaxLength(2000)
  note?: string;
  @ApiProperty({ minimum: 1, maximum: 365, example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays!: number;
  @ApiPropertyOptional({ enum: ['monstera', 'fern', 'cactus', 'ficus', 'palm', 'flower'] })
  @OptionalField()
  @IsIn(['monstera', 'fern', 'cactus', 'ficus', 'palm', 'flower'])
  icon?: string;
  @ApiPropertyOptional({
    format: 'date',
    description: 'Последний полив, только при создании растения',
  })
  @OptionalField()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна иметь формат ГГГГ-ММ-ДД' })
  lastWateredOn?: string;
}

export class UpdatePlantDto extends PartialType(CreatePlantDto, { skipNullProperties: false }) {}

export class WaterPlantDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 для защиты от повторной отправки' })
  @IsUUID('4')
  requestId!: string;
}

export class PageViewDto {
  @ApiProperty({
    enum: ['login', 'register', 'dashboard', 'plants', 'plant', 'statistics', 'settings'],
  })
  @IsIn(['login', 'register', 'dashboard', 'plants', 'plant', 'statistics', 'settings'])
  route!: string;
}
