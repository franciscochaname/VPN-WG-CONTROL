import { ShieldCheck, TerminalSquare } from "lucide-react";
import { alerts } from "../dashboard/dashboardData.js";
import StatusPill from "../../shared/ui/StatusPill.jsx";

function OperationsPanel() {
  return (
    <aside className="space-y-5">
      <div className="rounded-lg border border-warm-line bg-warm-panel p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Estado</h2>
          <StatusPill label="Calido" tone="amber" />
        </div>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article key={alert.title} className="rounded-lg border border-warm-line bg-[#fff9ef] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{alert.title}</p>
                <span className="text-xs font-semibold text-warm-copper">{alert.severity}</span>
              </div>
              <p className="mt-1 text-sm leading-5 text-warm-muted">{alert.detail}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-warm-line bg-warm-ink p-4 text-warm-panel shadow-soft">
        <div className="flex items-center gap-2">
          <TerminalSquare size={18} className="text-warm-amber" />
          <h2 className="text-lg font-semibold">Siguiente modulo</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#f5ead9]">
          Preparado para conectar SQLite con migraciones y un servicio IPC seguro entre Electron y React.
        </p>
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-warm-amber px-3 py-2.5 text-sm font-semibold text-warm-ink transition hover:bg-[#efb65a]" type="button">
          <ShieldCheck size={16} />
          Ver arquitectura
        </button>
      </div>
    </aside>
  );
}

export default OperationsPanel;
