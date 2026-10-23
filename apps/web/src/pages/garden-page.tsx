import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Sprout,
  Droplets,
  Clock3,
  ArrowUpRight,
  SlidersHorizontal,
  Leaf,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, shortDate, plural, type Plant, type Statistics } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PlantArt } from '@/components/plant-art';
import { PlantCard, statusLabel } from '@/components/plant-card';
import { PlantForm } from '@/components/plant-form';
import { Loading, ErrorState } from '@/components/shared';
import { PageView } from '@/components/layout';

export function GardenPage({ collection = false }: { collection?: boolean }) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [room, setRoom] = useState('all');
  const plants = useQuery({ queryKey: ['plants'], queryFn: () => api<Plant[]>('/plants') });
  const statistics = useQuery({
    queryKey: ['statistics'],
    queryFn: () => api<Statistics>('/statistics'),
  });
  if (plants.isPending || statistics.isPending) return <Loading />;
  if (plants.error || statistics.error)
    return (
      <ErrorState
        error={(plants.error || statistics.error)!}
        retry={() => {
          void plants.refetch();
          void statistics.refetch();
        }}
      />
    );
  const data = plants.data!,
    stats = statistics.data!;
  const rooms = [...new Set(data.map((p) => p.room).filter(Boolean))];
  const filtered = data.filter(
    (p) =>
      (filter === 'all' || (filter === 'attention' && p.daysUntil <= 0) || p.status === filter) &&
      (room === 'all' || p.room === room) &&
      `${p.name} ${p.species} ${p.room}`.toLowerCase().includes(search.toLowerCase()),
  );
  const upcoming = [...data].sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 4);
  return (
    <>
      <PageView route={collection ? 'plants' : 'dashboard'} />
      <div className="page-title">
        <div>
          <h1>{collection ? 'Растения' : 'Мой сад'}</h1>
        </div>
        <Button className="button-primary" onClick={() => setAdding(true)}>
          <Plus size={17} />
          Добавить растение
        </Button>
      </div>
      <section className="stat-grid" aria-label="Сводка по саду">
        {[
          {
            label: 'Растений в коллекции',
            value: stats.totalPlants,
            icon: Sprout,
            color: 'green',
          },
          {
            label: 'Нужно полить сегодня',
            value: stats.dueToday,
            icon: Droplets,
            color: 'blue',
          },
          {
            label: 'Пропущен полив',
            value: stats.overduePlants,
            icon: Clock3,
            color: 'amber',
          },
          {
            label: 'Поливов за 30 дней',
            value: stats.wateringsLast30Days,
            icon: CalendarDays,
            color: 'sage',
          },
        ].map((item) => (
          <article className="stat-card" key={item.label}>
            <div className="stat-top">
              <span>{item.label}</span>
              <span className={`stat-icon ${item.color}`}>
                <item.icon size={18} />
              </span>
            </div>
            <strong>
              {item.value}
              <span className="stat-sprout">
                {item.label === 'Растений в коллекции' && <Leaf size={18} />}
              </span>
            </strong>
          </article>
        ))}
      </section>
      <div className={`garden-content-grid ${collection ? 'collection-only' : ''}`}>
        <section className="collection-section">
          <div className="section-heading">
            <div>
              <h2>
                {collection ? 'Вся коллекция' : 'Мои растения'}{' '}
                <span className="count-pill">{data.length}</span>
              </h2>
            </div>
            {!collection && (
              <Link to="/plants" className="text-link">
                Все растения <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
          <div className="collection-toolbar">
            <div className="filter-tabs" aria-label="Фильтр растений">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                Все растения
              </button>
              <button
                className={filter === 'attention' ? 'active' : ''}
                onClick={() => setFilter('attention')}
              >
                Нужен полив <span>{stats.dueToday + stats.overduePlants}</span>
              </button>
            </div>
            <div className="collection-search">
              <Search size={16} />
              <Input
                aria-label="Поиск растений"
                placeholder="Найти растение…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {rooms.length > 0 && (
              <label className="room-filter">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Помещение"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                >
                  <option value="all">Все комнаты</option>
                  {rooms.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {filtered.length > 0 ? (
            <div className="plant-grid">
              {filtered.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
            </div>
          ) : (
            <div className="empty-state garden-empty">
              <div className="empty-plant">
                <PlantArt kind="ficus" />
              </div>
              <h2>{data.length ? 'Ничего не найдено' : 'Нет растений'}</h2>
              {data.length > 0 && <p>Измените поиск или фильтр</p>}
              {!data.length && (
                <Button className="button-primary" onClick={() => setAdding(true)}>
                  <Plus size={17} />
                  Добавить первое растение
                </Button>
              )}
              {data.length > 0 && (
                <Button
                  className="button-secondary"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                    setRoom('all');
                  }}
                >
                  Сбросить фильтры
                </Button>
              )}
            </div>
          )}
        </section>
        {!collection && (
          <aside className="care-sidebar">
            <div className="care-panel">
              <div className="section-heading">
                <h2>Ближайший полив</h2>
                <span className="care-clock">
                  <Clock3 size={17} />
                </span>
              </div>
              {upcoming.length ? (
                upcoming.map((plant) => (
                  <Link to={`/plants/${plant.id}`} className="upcoming-item" key={plant.id}>
                    <span className={`upcoming-art art-${plant.icon}`}>
                      <PlantArt kind={plant.icon} />
                    </span>
                    <span className="upcoming-copy">
                      <strong>{plant.name}</strong>
                      {plant.room && <span>{plant.room}</span>}
                      <small className={`due-${plant.status}`}>
                        {plant.daysUntil <= 0
                          ? statusLabel(plant)
                          : shortDate(plant.nextWateringOn, user!.timezone)}
                      </small>
                    </span>
                    <ArrowUpRight size={14} className="upcoming-arrow" />
                  </Link>
                ))
              ) : (
                <div className="care-empty">
                  <Droplets size={26} />
                  <p>Нет растений</p>
                </div>
              )}
              <div className="care-panel-footer">
                <span className="small-dot" />{' '}
                {stats.dueToday + stats.overduePlants > 0
                  ? `${stats.dueToday + stats.overduePlants} ${plural(stats.dueToday + stats.overduePlants, 'растение ждёт', 'растения ждут', 'растений ждут')} полива`
                  : 'Нет растений, требующих полива'}
              </div>
            </div>
          </aside>
        )}
      </div>
      {adding && <PlantForm onClose={() => setAdding(false)} />}
    </>
  );
}
