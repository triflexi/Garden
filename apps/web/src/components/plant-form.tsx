import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, jsonBody, type Plant, type PlantIcon } from '@/lib/api';
import { Modal } from './shared';
import { PlantArt } from './plant-art';

const schema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(100, 'Не больше 100 символов'),
  species: z.string().max(100),
  room: z.string().max(80),
  note: z.string().max(2000),
  intervalDays: z
    .number({ error: 'Укажите интервал в днях' })
    .int('Укажите целое число дней')
    .min(1, 'Минимум 1 день')
    .max(365, 'Максимум 365 дней'),
  lastWateredOn: z.string(),
});
type Fields = z.infer<typeof schema>;
const icons: { key: PlantIcon; name: string }[] = [
  { key: 'monstera', name: 'Монстера' },
  { key: 'ficus', name: 'Фикус' },
  { key: 'fern', name: 'Папоротник' },
  { key: 'cactus', name: 'Кактус' },
  { key: 'palm', name: 'Пальма' },
  { key: 'flower', name: 'Цветок' },
];
export function PlantForm({ plant, onClose }: { plant?: Plant; onClose: () => void }) {
  const client = useQueryClient();
  const [icon, setIcon] = useState<PlantIcon>(plant?.icon ?? 'monstera');
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: plant?.name ?? '',
      species: plant?.species ?? '',
      room: plant?.room ?? '',
      note: plant?.note ?? '',
      intervalDays: plant?.intervalDays ?? 7,
      lastWateredOn: '',
    },
  });
  const save = useMutation({
    mutationFn: (values: Fields) => {
      const { lastWateredOn, ...fields } = values;
      return api<Plant>(plant ? `/plants/${plant.id}` : '/plants', {
        method: plant ? 'PATCH' : 'POST',
        body: jsonBody({ ...fields, icon, ...(!plant && lastWateredOn ? { lastWateredOn } : {}) }),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['plants'] });
      await client.invalidateQueries({ queryKey: ['plant'] });
      await client.invalidateQueries({ queryKey: ['statistics'] });
      toast.success(plant ? 'Изменения сохранены' : 'Растение добавлено');
      onClose();
    },
  });
  return (
    <Modal title={plant ? 'Редактировать растение' : 'Добавить растение'} onClose={onClose}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="plant-form">
        <fieldset className="icon-picker">
          <legend>Выберите иллюстрацию</legend>
          {icons.map((item) => (
            <button
              type="button"
              key={item.key}
              className={icon === item.key ? 'selected' : ''}
              onClick={() => setIcon(item.key)}
              aria-label={item.name}
              aria-pressed={icon === item.key}
            >
              <PlantArt kind={item.key} />
            </button>
          ))}
        </fieldset>
        <label className="field">
          Название
          <Input
            {...form.register('name')}
            placeholder="Например, Монстера Мона"
            autoFocus
            maxLength={100}
          />
          {form.formState.errors.name && (
            <span className="field-error">{form.formState.errors.name.message}</span>
          )}
        </label>
        <div className="form-row">
          <label className="field">
            Вид <span className="optional">необязательно</span>
            <Input {...form.register('species')} placeholder="Monstera deliciosa" maxLength={100} />
          </label>
          <label className="field">
            Помещение <span className="optional">необязательно</span>
            <Input {...form.register('room')} placeholder="Гостиная" maxLength={80} />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            Интервал полива, дней
            <Input
              type="number"
              min={1}
              max={365}
              {...form.register('intervalDays', { valueAsNumber: true })}
            />
            {form.formState.errors.intervalDays && (
              <span className="field-error">{form.formState.errors.intervalDays.message}</span>
            )}
          </label>
          {!plant && (
            <label className="field">
              Последний полив <span className="optional">если помните</span>
              <Input type="date" {...form.register('lastWateredOn')} />
            </label>
          )}
        </div>
        <label className="field">
          Заметка <span className="optional">необязательно</span>
          <textarea
            {...form.register('note')}
            placeholder="Любит рассеянный свет. Стоит у восточного окна."
            rows={3}
            maxLength={2000}
          />
        </label>
        {save.error && (
          <p className="form-error" role="alert">
            {save.error.message}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" className="button-secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" className="button-primary" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="spin" size={16} />}{' '}
            {plant ? 'Сохранить' : 'Добавить растение'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
