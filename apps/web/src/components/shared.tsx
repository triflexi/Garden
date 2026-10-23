import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Leaf, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-icon">
        <Leaf size={23} strokeWidth={1.7} />
      </span>
      {!compact && (
        <>
          лист<span className="brand-soft">ва</span>
        </>
      )}
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={27} />
      <span>Загрузка…</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="empty-state">
      <AlertCircle size={35} />
      <h2>Не получилось загрузить данные</h2>
      <p>{error.message}</p>
      <Button onClick={retry}>Попробовать снова</Button>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="app-dialog"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <Button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
