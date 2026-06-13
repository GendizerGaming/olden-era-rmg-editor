import React, { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import type { ToastNotification } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';

export const ToastContainer: React.FC = () => {
  const notifications = useEditorStore((state) => state.notifications);
  const actions = useEditorStore((state) => state.actions);

  return (
    <div className="toast-container" aria-live="polite">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onRemove={actions.removeNotification} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  notification: ToastNotification;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ notification, onRemove }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(notification.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [notification.id, onRemove]);

  return (
    <div className={`toast-item ${notification.type || 'info'}`} onClick={() => onRemove(notification.id)}>
      <div className="toast-content">
        {t(notification.key, notification.params)}
      </div>
      <button className="toast-close" type="button" aria-label="Close">
        ×
      </button>
    </div>
  );
};
