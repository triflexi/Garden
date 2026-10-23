import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplets, MapPin, ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, jsonBody, plural, shortDate, requestId, type Plant } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PlantArt } from './plant-art';

export function useWaterPlant(plant: Plant) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Plant>(`/plants/${plant.id}/waterings`, {
        method: 'POST',
        body: jsonBody({ requestId: requestId() }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['plants'] }),
        client.invalidateQueries({ queryKey: ['plant'] }),
        client.invalidateQueries({ queryKey: ['statistics'] }),
      ]);
      toast.success(`${plant.name}: полив записан`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
export function statusLabel(plant: Plant) {
  if (plant.status === 'today') return 'Полить сегодня';
  if (plant.status === 'overdue')
    return `Просрочено на ${Math.abs(plant.daysUntil)} ${plural(plant.daysUntil, 'день', 'дня', 'дней')}`;
  return `Через ${plant.daysUntil} ${plural(plant.daysUntil, 'день', 'дня', 'дней')}`;
}
export function PlantCard({ plant }: { plant: Plant }) {
  const { user } = useAuth();
  const watering = useWaterPlant(plant);
  const wateredToday =
    plant.lastWateredAt &&
    new Intl.DateTimeFormat('en-CA', { timeZone: user!.timezone }).format(
      new Date(plant.lastWateredAt),
    ) === new Intl.DateTimeFormat('en-CA', { timeZone: user!.timezone }).format(new Date());
  return (
    <article className={`plant-card plant-${plant.icon}`}>
      <Link to={`/plants/${plant.id}`} className="plant-cover" aria-label={`Открыть ${plant.name}`}>
        <span className={`plant-status status-${plant.status}`}>
          <span />
          {statusLabel(plant)}
        </span>
        <PlantArt kind={plant.icon} />
        <span className="card-open">
          <ArrowUpRight size={17} />
        </span>
      </Link>
      <div className="plant-card-body">
        <Link to={`/plants/${plant.id}`} className="plant-name">
          {plant.name}
        </Link>
        {plant.species && <p className="plant-species">{plant.species}</p>}
        <div className="plant-meta">
          {plant.room && (
            <span>
              <MapPin size={13} />
              {plant.room}
            </span>
          )}
          <span>
            <Droplets size={13} />
            {plant.intervalDays} {plural(plant.intervalDays, 'день', 'дня', 'дней')}
          </span>
        </div>
        <div className="plant-card-footer">
          <div>
            <span className="micro-label">ПОСЛЕДНИЙ ПОЛИВ</span>
            <p>
              {plant.lastWateredAt
                ? shortDate(plant.lastWateredAt, user!.timezone)
                : 'Ещё не записан'}
            </p>
          </div>
          <Button
            className={`water-button ${wateredToday ? 'watered' : ''}`}
            disabled={watering.isPending || Boolean(wateredToday)}
            onClick={() => watering.mutate()}
            aria-label={`Полить ${plant.name}`}
          >
            {watering.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : wateredToday ? (
              <Check size={15} />
            ) : (
              <Droplets size={15} />
            )}{' '}
            {wateredToday ? 'Полито' : 'Полить'}
          </Button>
        </div>
      </div>
    </article>
  );
}
