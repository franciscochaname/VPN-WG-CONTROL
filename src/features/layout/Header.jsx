import { Bell, ShieldCheck } from "lucide-react";
import StatusPill from "../../shared/ui/StatusPill.jsx";

function Header({ routerCount }) {
  return (
    <header className="flex items-center justify-between border-b border-warm-line/80 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warm-ink text-warm-panel shadow-soft">
          <ShieldCheck size={23} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-copper">
            Orquestador WireGuard
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">VPN WG CONTROL</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusPill label={`${routerCount} routers`} tone={routerCount > 0 ? "mint" : "neutral"} />
        <StatusPill label="Base local" tone="amber" />
        <button className="icon-button" aria-label="Notificaciones">
          <Bell size={20} />
        </button>
      </div>
    </header>
  );
}

export default Header;
