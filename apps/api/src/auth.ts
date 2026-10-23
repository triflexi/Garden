import {
  BadRequestException,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Patch,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma, User } from '@prisma/client';
import { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto';
import { validTimezone } from './calendar';

export type AuthRequest = Request & { user: User; sessionHash: string };
const COOKIE = 'listva_session';
const lifetime = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: lifetime,
});
export const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  timezone: user.timezone,
});

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[COOKIE];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Войдите в аккаунт');
    const hash = tokenHash(token);
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException('Сессия истекла. Войдите снова');
    request.user = session.user;
    request.sessionHash = hash;
    return true;
  }
}

@ApiTags('Аккаунт')
@Controller('auth')
export class AuthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private async createSession(user: User, response: Response) {
    const token = randomBytes(32).toString('hex');
    await this.db.$transaction([
      this.db.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } }),
      this.db.session.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + lifetime),
        },
      }),
    ]);
    response.cookie(COOKIE, token, cookieOptions());
    return publicUser(user);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() input: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const timezone = input.timezone ?? 'Europe/Moscow';
    if (!validTimezone(timezone)) throw new BadRequestException('Неизвестный часовой пояс');
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email,
          passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
          timezone,
        },
      });
      return this.createSession(user, response);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Этот email уже зарегистрирован');
      throw error;
    }
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!user || !(await argon2.verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('Неверный email или пароль');
    return this.createSession(user, response);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  me(@Req() request: AuthRequest) {
    return publicUser(request.user);
  }

  @Patch('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  async update(@Req() request: AuthRequest, @Body() input: UpdateProfileDto) {
    if (!validTimezone(input.timezone)) throw new BadRequestException('Неизвестный часовой пояс');
    return publicUser(
      await this.db.user.update({
        where: { id: request.user.id },
        data: { timezone: input.timezone },
      }),
    );
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.db.session.deleteMany({ where: { tokenHash: request.sessionHash } });
    response.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  }
}
