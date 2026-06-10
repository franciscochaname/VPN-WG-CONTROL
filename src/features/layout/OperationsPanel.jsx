import { Plus, Router, ShieldCheck, Trash2 } from "lucide-react";
import StatusPill from "../../shared/ui/StatusPill.jsx";

function OperationsPanel({ routers, selectedRouter, onSelectRouter, onRemoveRouter, onOpenRouterRegistration }) {
  return (
    <aside className="space-y-5">
      <div className="rounded-lg border border-warm-line bg-warm-panel p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Routers</h2>
          <StatusPill label={String(routers.length)} tone={routers.length > 0 ? "mint" : "neutral"} />
        </div>
        {routers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-warm-line bg-[#fff9ef] p-4 text-sm leading-6 text-warm-muted">
            No hay routers guardados. El monitoreo se habilitara cuando registres un equipo real.
          </div>
        ) : (
          <div className="space-y-3">
            {routers.map((router) => (
              <button
                className={`router-list-item ${selectedRouter?.id === router.id ? "router-list-item-active" : ""}`}
                key={router.id}
                onClick={() => onSelectRouter(router.id)}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
                  <Router size={17} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold">{router.alias}</span>
                  <span className="block truncate text-xs text-warm-muted">{router.host}:{router.apiPort}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-warm-line bg-warm-ink p-4 text-warm-panel shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-warm-amber" />
          <h2 className="text-lg font-semibold">Acceso</h2>
        </div>
        {selectedRouter ? (
          <div className="mt-3 space-y-3 text-sm text-[#f5ead9]">
            <p className="font-semibold text-white">{selectedRouter.alias}</p>
            <p>{selectedRouter.authType === "token" ? "Token API cifrado localmente." : "Clave cifrada localmente."}</p>
            <p>Estado: pendiente de validar conexion.</p>
            <button
              className="danger-button"
              onClick={() => onRemoveRouter(selectedRouter.id)}
              type="button"
            >
              <Trash2 size={16} />
              Quitar router
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#f5ead9]">
            Sin credenciales guardadas. El secreto solo se almacena cifrado desde Electron.
          </p>
        )}
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-warm-amber px-3 py-2.5 text-sm font-semibold text-warm-ink transition hover:bg-[#efb65a]" onClick={onOpenRouterRegistration} type="button">
          <Plus size={16} />
          Registrar router
        </button>
      </div>
    </aside>
  );
}

export default OperationsPanel;
