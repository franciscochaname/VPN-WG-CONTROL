import {
  Archive,
  CircleAlert,
  CircleCheck,
  Clock3,
  DatabaseZap,
  Flame,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Network,
  Plus,
  Router,
  ShieldCheck,
  Unplug,
  Wand2
} from "lucide-react";
import { useState } from "react";
import StatusPill from "../../shared/ui/StatusPill.jsx";

const navigationItems = [
  { id: "dashboard", label: "Panel", icon: LayoutDashboard },
  { id: "routers", label: "Routers", icon: Router },
  { id: "wireguard", label: "WireGuard", icon: Network },
  { id: "ipam", label: "Segmentos", icon: GitBranch },
  { id: "firewall", label: "Firewall", icon: Flame },
  { id: "backups", label: "Respaldos", icon: Archive },
  { id: "security", label: "Seguridad", icon: ShieldCheck },
  { id: "keys", label: "Llaves WG", icon: KeyRound }
];

const statusMap = {
  online: { label: "Online", tone: "mint", icon: CircleCheck },
  offline: { label: "Offline", tone: "danger", icon: CircleAlert },
  pending_connection: { label: "Pendiente", tone: "amber", icon: Clock3 }
};

function Sidebar({
  activeView,
  routers,
  selectedRouter,
  onDiagnoseRouter,
  onNavigate,
  onOpenFirewall,
  onOpenIpam,
  onOpenRouterRegistration,
  onOpenWireGuard,
  onSelectRouter,
  onSyncWireGuard
}) {
  const [busyAction, setBusyAction] = useState(null);
  const hasRouter = Boolean(selectedRouter);

  async function runAction(actionName, callback) {
    if (!selectedRouter) {
      return;
    }

    setBusyAction(actionName);

    try {
      await callback(selectedRouter.id);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <aside className="sidebar-shell">
      <div className="side-command-card">
        <div className="side-command-head">
          <div>
            <p>Operacion</p>
            <h2>VPN segura</h2>
          </div>
          <Wand2 size={18} />
        </div>

        <button className="dock-primary-action" onClick={hasRouter ? onOpenWireGuard : onOpenRouterRegistration} type="button">
          {hasRouter ? <Network size={17} /> : <Plus size={17} />}
          {hasRouter ? "Crear VPN" : "Registrar router"}
        </button>

        <div className="dock-action-grid">
          <button className="dock-action" disabled={!hasRouter || Boolean(busyAction)} onClick={() => runAction("sync", onSyncWireGuard)} type="button">
            <DatabaseZap size={15} />
            Extraer
          </button>
          <button className="dock-action" disabled={!hasRouter || Boolean(busyAction)} onClick={() => runAction("diagnose", onDiagnoseRouter)} type="button">
            <Unplug size={15} />
            Validar
          </button>
          <button className="dock-action" onClick={onOpenFirewall} type="button">
            <ShieldCheck size={15} />
            Firewall
          </button>
          <button className="dock-action" onClick={onOpenIpam} type="button">
            <GitBranch size={15} />
            IPAM
          </button>
        </div>

        <div className="safety-rail">
          <span>Backup</span>
          <span>Logs</span>
          <span>Verificacion</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="side-router-card">
        <div className="mb-3 flex items-center justify-between">
          <h2>Routers</h2>
          <StatusPill label={String(routers.length)} tone={routers.length > 0 ? "mint" : "neutral"} />
        </div>
        {routers.length === 0 ? (
          <p className="side-empty">Registra un Mikrotik para habilitar VPN, firewall, IPAM y monitoreo real.</p>
        ) : (
          <div className="grid gap-2">
            {routers.map((router) => (
              <button
                className={`side-router-row ${selectedRouter?.id === router.id ? "side-router-row-active" : ""}`}
                key={router.id}
                onClick={() => onSelectRouter(router.id)}
                type="button"
              >
                <span className="side-router-icon">
                  <Router size={15} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <strong>{router.alias}</strong>
                  <small>{router.host}:{router.apiPort}</small>
                </span>
                <RouterStatus status={router.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function RouterStatus({ status }) {
  const config = statusMap[status] || statusMap.pending_connection;
  const Icon = config.icon;

  return (
    <span className={`router-status router-status-${config.tone}`}>
      <Icon size={13} />
    </span>
  );
}

export default Sidebar;
