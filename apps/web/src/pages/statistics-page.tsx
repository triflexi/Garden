import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Droplets, Leaf, Clock3, CalendarDays, TrendingUp } from 'lucide-react';
import { api, shortDate, type Statistics } from '@/lib/api';
import { ErrorState, Loading } from '@/components/shared';
import { PageView } from '@/components/layout';

export function StatisticsPage() {
  const query = useQuery({
    queryKey: ['statistics'],
    queryFn: () => api<Statistics>('/statistics'),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const stats = query.data;
  return (
    <>
      <PageView route="statistics" />
      <div className="page-title">
        <div>
          <h1>Статистика</h1>
        </div>
        <span className="period-pill">
          <CalendarDays size={16} />
          Последние 30 дней
        </span>
      </div>
      <div className="stat-grid">
        {[
          { label: 'Растений в саду', value: stats.totalPlants, icon: Leaf },
          { label: 'Поливов сегодня', value: stats.wateringsToday, icon: Droplets },
          { label: 'Поливов за 30 дней', value: stats.wateringsLast30Days, icon: TrendingUp },
          { label: 'Просрочено растений', value: stats.overduePlants, icon: Clock3 },
        ].map((item) => (
          <article className="stat-card" key={item.label}>
            <div className="stat-top">
              <span>{item.label}</span>
              <span className="stat-icon green">
                <item.icon size={18} />
              </span>
            </div>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>
      <section className="panel chart-panel">
        <div className="section-heading">
          <div>
            <h2>Поливы по дням</h2>
          </div>
          <span className="chart-legend">
            <span />
            Поливы
          </span>
        </div>
        <div
          className="chart-container"
          role="img"
          aria-label={`График поливов за 30 дней, всего ${stats.wateringsLast30Days}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.daily} margin={{ top: 25, right: 16, left: -20, bottom: 8 }}>
              <defs>
                <linearGradient id="watering-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5c865c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#5c865c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--app-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => shortDate(value)}
                minTickGap={42}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(value) => shortDate(String(value))}
                formatter={(value) => [value, 'Поливы']}
                contentStyle={{
                  background: 'var(--app-panel)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 12,
                  color: 'var(--app-text)',
                  fontSize: 13,
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#5c865c"
                strokeWidth={2.5}
                fill="url(#watering-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!stats.wateringsLast30Days && (
          <p className="chart-empty-note">За последние 30 дней поливов нет</p>
        )}
      </section>
    </>
  );
}
