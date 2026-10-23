import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Droplets, Pencil, Trash2, MapPin, Clock3, History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, shortDate, plural, type Plant } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PlantArt } from '@/components/plant-art';
import { PlantForm } from '@/components/plant-form';
import { statusLabel, useWaterPlant } from '@/components/plant-card';
import { ErrorState, Loading, Modal } from '@/components/shared';
import { PageView } from '@/components/layout';

export function PlantPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['plant', id],
    queryFn: () => api<Plant>(`/plants/${id}`),
    retry: false,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return <PlantDetails plant={query.data} />;
}
function PlantDetails({ plant }: { plant: Plant }) {
  const { user } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const [editing, setEditing] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null);
  const water = useWaterPlant(plant);
  const remove = useMutation({
    mutationFn: () => api(`/plants/${plant.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['plants'] });
      void client.invalidateQueries({ queryKey: ['statistics'] });
      toast.success('Растение удалено');
      navigate('/plants');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const undo = useMutation({
    mutationFn: (id: string) => api(`/plants/${plant.id}/waterings/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['plant'] }),
        client.invalidateQueries({ queryKey: ['plants'] }),
        client.invalidateQueries({ queryKey: ['statistics'] }),
      ]);
      setConfirm(null);
      toast.success('Запись полива отменена');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageView route="plant" />
      <Link to="/plants" className="back-link">
        <ArrowLeft size={16} />К растениям
      </Link>
      <div className="page-title">
        <div>
          <h1>{plant.name}</h1>
          {plant.species && <p>{plant.species}</p>}
        </div>
        <div className="inline-actions">
          <Button className="button-secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Редактировать
          </Button>
          <Button
            className="icon-button delete-button"
            aria-label="Удалить растение"
            onClick={() => setConfirm('plant')}
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>
      <div className="plant-detail-grid">
        <section className={`detail-art plant-${plant.icon}`}>
          <PlantArt kind={plant.icon} />
          <span className={`plant-status status-${plant.status}`}>
            <span />
            {statusLabel(plant)}
          </span>
        </section>
        <section className="detail-info panel">
          <h2>Полив</h2>
          <dl className="detail-facts">
            <div>
              <dt>
                <MapPin size={17} />
                Помещение
              </dt>
              <dd>{plant.room || 'Не указано'}</dd>
            </div>
            <div>
              <dt>
                <Droplets size={17} />
                Интервал полива
              </dt>
              <dd>
                {plant.intervalDays} {plural(plant.intervalDays, 'день', 'дня', 'дней')}
              </dd>
            </div>
            <div>
              <dt>
                <History size={17} />
                Последний полив
              </dt>
              <dd>
                {plant.lastWateredAt
                  ? shortDate(plant.lastWateredAt, user!.timezone)
                  : 'Пока нет записей'}
              </dd>
            </div>
            <div>
              <dt>
                <Clock3 size={17} />
                Следующий полив
              </dt>
              <dd>{shortDate(plant.nextWateringOn, user!.timezone)}</dd>
            </div>
          </dl>
          <Button
            className="button-primary detail-water"
            onClick={() => water.mutate()}
            disabled={water.isPending}
          >
            <Droplets size={18} />
            {water.isPending ? 'Записываем…' : 'Отметить полив'}
          </Button>
        </section>
      </div>
      {plant.note && (
        <section className="panel plant-note">
          <span className="eyebrow">ВАШИ ЗАМЕТКИ</span>
          <p>{plant.note}</p>
        </section>
      )}
      <section className="panel history-panel">
        <div className="section-heading">
          <div>
            <h2>История поливов</h2>
          </div>
          <span className="count-pill">{plant.waterings.length}</span>
        </div>
        {plant.waterings.length ? (
          <div className="watering-history">
            {plant.waterings.map((event) => (
              <div key={event.id} className="history-row">
                <span className="history-drop">
                  <Droplets size={18} />
                </span>
                <div>
                  <strong>Растение полито</strong>
                  <p>
                    {new Intl.DateTimeFormat('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: user!.timezone,
                    }).format(new Date(event.happenedAt))}
                  </p>
                </div>
                <Button className="button-text" onClick={() => setConfirm(event.id)}>
                  <Undo2 size={14} />
                  Отменить
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            <History size={26} />
            <p>Нет записей о поливе</p>
          </div>
        )}
      </section>
      {editing && <PlantForm plant={plant} onClose={() => setEditing(false)} />}{' '}
      {confirm && (
        <Modal
          title={confirm === 'plant' ? 'Удалить растение?' : 'Отменить запись полива?'}
          description={
            confirm === 'plant'
              ? 'Растение и вся его история будут удалены.'
              : 'Запись исчезнет из истории, а следующая дата полива пересчитается.'
          }
          onClose={() => setConfirm(null)}
        >
          <div className="dialog-actions">
            <Button className="button-secondary" onClick={() => setConfirm(null)}>
              Оставить
            </Button>
            <Button
              className="button-danger"
              disabled={remove.isPending || undo.isPending}
              onClick={() => (confirm === 'plant' ? remove.mutate() : undo.mutate(confirm))}
            >
              {confirm === 'plant' ? 'Удалить растение' : 'Отменить полив'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
