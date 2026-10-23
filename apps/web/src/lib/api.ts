export interface User {
  id: string;
  email: string;
  timezone: string;
}
export interface Watering {
  id: string;
  plantId: string;
  happenedAt: string;
  requestId: string;
}
export type PlantIcon = 'monstera' | 'fern' | 'cactus' | 'ficus' | 'palm' | 'flower';
export interface Plant {
  id: string;
  name: string;
  species: string;
  room: string;
  note: string;
  intervalDays: number;
  icon: PlantIcon;
  createdAt: string;
  lastWateredAt: string | null;
  nextWateringOn: string;
  daysUntil: number;
  status: 'overdue' | 'today' | 'upcoming';
  waterings: Watering[];
}
export interface Statistics {
  totalPlants: number;
  overduePlants: number;
  dueToday: number;
  wateringsToday: number;
  wateringsLast30Days: number;
  daily: { date: string; count: number }[];
}
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('listva:unauthorized'));
    const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
    throw new ApiError(
      response.status,
      response.status >= 500
        ? 'На сервере произошла ошибка. Попробуйте ещё раз чуть позже.'
        : response.status === 429
          ? 'Слишком много запросов. Попробуйте через минуту.'
          : message || 'Не удалось выполнить действие',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const jsonBody = (data: unknown) => JSON.stringify(data);
// crypto.randomUUID is unavailable on a public IP over HTTP; getRandomValues works there.
export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function shortDate(value: string, timezone?: string) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(timezone && !isDate ? { timeZone: timezone } : {}),
  }).format(new Date(isDate ? `${value}T12:00:00` : value));
}
export function plural(count: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(count) % 100,
    mod10 = mod100 % 10;
  return mod100 >= 11 && mod100 <= 14
    ? many
    : mod10 === 1
      ? one
      : mod10 >= 2 && mod10 <= 4
        ? few
        : many;
}
