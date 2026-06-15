import { Bell, Flame, Gauge, Network, Plus, Router, ShieldCheck } from "lucide-react";

const viewLabels = {
  dashboard: "Panel",
  routers: "Routers",
  wireguard: "WireGuard",
  ipam: "Segmentos",
  firewall: "Firewall",
  backups: "Respaldos",
  security: "Seguridad",
  keys: "Llaves WG"
};

function Header({
  activeView,
  continuousMonitor,
  metrics,
  monitoring,
  notificationCount,
  selectedRouter,
  onNavigate
}) {
  const routerCount = metrics?.routers || 0;
  const tunnelCount = metrics?.tunnels || 0;
  const activeTunnels = monitoring?.activeTunnels || 0;
  const throughputBps = monitoring?.throughputBps || 0;
  const hasRouter = Boolean(selectedRouter);

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-brand-icon">
          <ShieldCheck size={23} />
        </div>
        <div className="min-w-0">
          <p>Orquestador WireGuard</p>
          <h1>VPN WG CONTROL</h1>
          <span>{viewLabels[activeView] || "Panel"} operativo</span>
        </div>
      </div>

      <div className="header-metrics">
        <HeaderMetric
          detail={hasRouter ? selectedRouter.alias : "sin seleccionar"}
          icon={Router}
          label={`${routerCount} router(s)`}
          tone={hasRouter ? "ok" : "idle"}
        />
        <HeaderMetric
          detail={`${activeTunnels}/${tunnelCount} con handshake`}
          icon={Network}
          label="Tuneles"
          tone={activeTunnels > 0 ? "ok" : "idle"}
        />
        <HeaderMetric
          detail={`${formatBytes(throughputBps)}/s`}
          icon={Gauge}
          label="Trafico vivo"
          tone={throughputBps > 0 ? "ok" : "idle"}
        />
        <HeaderMetric
          detail={continuousMonitor?.enabled ? "continuo activo" : "en espera"}
          icon={ShieldCheck}
          label="Monitor"
          tone={continuousMonitor?.enabled ? "ok" : "warn"}
        />
      </div>

      <div className="header-actions">
        <button className="header-primary-action" onClick={() => onNavigate(hasRouter ? "wireguard" : "routers")} type="button">
          {hasRouter ? <Network size={16} /> : <Plus size={16} />}
          <span>{hasRouter ? "Crear VPN" : "Registrar"}</span>
        </button>
        <button className="header-icon-action" onClick={() => onNavigate("firewall")} title="Firewall" type="button">
          <Flame size={18} />
        </button>
        <button className="header-icon-action" onClick={() => onNavigate("dashboard")} title="Notificaciones" type="button">
          <Bell size={20} />
          {notificationCount > 0 && <span>{notificationCount}</span>}
        </button>
      </div>
    </header>
  );
}

function HeaderMetric({ detail, icon: Icon, label, tone }) {
  return (
    <article className={`header-metric header-metric-${tone}`}>
      <Icon size={16} />
      <span>{label}</span>
      <strong>{detail}</strong>
    </article>
  );
}

function formatBytes(value) {
  const number = Number(value || 0);

  if (number < 1024) {
    return `${number} B`;
  }

  const units = ["KB", "MB", "GB"];
  let current = number / 1024;
  let index = 0;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[index]}`;
}

export default Header;
