import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const icons = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle
};

function NotificationCenter({ notifications, onDismiss }) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-stack" aria-live="polite">
      {notifications.map((notification) => {
        const Icon = icons[notification.type] || Info;

        return (
          <article className={`toast toast-${notification.type || "info"}`} key={notification.id}>
            <Icon size={18} />
            <div>
              <p>{notification.title}</p>
              {notification.detail && <span>{notification.detail}</span>}
            </div>
            <button onClick={() => onDismiss(notification.id)} title="Cerrar notificacion" type="button">
              <X size={15} />
            </button>
          </article>
        );
      })}
    </div>
  );
}

export default NotificationCenter;
