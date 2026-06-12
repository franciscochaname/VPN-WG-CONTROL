import { Archive, Flame, GitBranch, KeyRound, LayoutDashboard, Network, Router, ShieldCheck } from "lucide-react";

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

function Sidebar({ activeView, onNavigate }) {
  return (
    <aside className="rounded-lg border border-warm-line bg-warm-panel/82 p-3 shadow-soft backdrop-blur">
      <div className="mb-4 rounded-lg bg-[#f3eadc] p-3">
        <p className="text-sm font-semibold">Despliegue por fases</p>
        <p className="mt-1 text-xs leading-5 text-warm-muted">
          Registro real de routers primero. Monitoreo, tuneles y eventos se activan sobre datos guardados por el usuario.
        </p>
      </div>
      <nav className="space-y-1">
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
    </aside>
  );
}

export default Sidebar;
