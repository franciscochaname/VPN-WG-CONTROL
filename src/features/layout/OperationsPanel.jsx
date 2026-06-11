import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Network,
  Plus,
  RefreshCw,
  Router,
  ShieldCheck,
  Trash2,
  Unplug
} from "lucide-react";
import StatusPill from "../../shared/ui/StatusPill.jsx";
import { useState } from "react";

const statusMap = {
  online: { label: "Online", tone: "mint", icon: CircleCheck },
  offline: { label: "Offline", tone: "danger", icon: CircleAlert },
  pending_connection: { label: "Pendiente", tone: "amber", icon: Clock3 }
};

function OperationsPanel({
  routers,
  selectedRouter,
  onSelectRouter,
  onRemoveRouter,
  onTestRouter,
  onSyncWireGuard,
  onDiagnoseRouter,
  onOpenRouterRegistration
}) {
  const [actionState, setActionState] = useState({ type: "idle", message: "" });
  const [busyAction, setBusyAction] = useState(null);

  async function runRouterAction(actionName, callback) {
    if (!selectedRouter) {
      return;
    }

    setBusyAction(actionName);
    setActionState({ type: "idle", message: "" });

    try {
      await callback(selectedRouter.id);
      setActionState({
        type: "success",
        message: actionName === "sync"
          ? "Sincronizacion WireGuard finalizada."
          : actionName === "diagnose"
            ? "Diagnostico de servicios finalizado."
            : "Conexion validada correctamente."
      });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo completar la accion." });
    } finally {
      setBusyAction(null);
    }
  }

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
                  <span className="block truncate text-xs text-warm-muted">API {router.host}:{router.apiPort}</span>
                </span>
                <RouterStatus status={router.status} />
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
            <p>API: {selectedRouter.host}:{selectedRouter.apiPort}</p>
            <p>WebFig: {selectedRouter.webfigTls ? "https" : "http"}://{selectedRouter.host}:{selectedRouter.webfigPort}</p>
            <p>Estado: {statusMap[selectedRouter.status]?.label || selectedRouter.status}</p>
            {selectedRouter.routerIdentity && <p>Identidad: {selectedRouter.routerIdentity}</p>}
            {selectedRouter.routerVersion && <p>RouterOS: {selectedRouter.routerVersion}</p>}
            {selectedRouter.lastSeenAt && <p>Ultimo contacto: {formatDate(selectedRouter.lastSeenAt)}</p>}
            {selectedRouter.lastSyncAt && <p>Ultima lectura WG: {formatDate(selectedRouter.lastSyncAt)}</p>}
            {selectedRouter.lastError && <p className="text-[#ffd1c3]">Error: {selectedRouter.lastError}</p>}
            <div className="grid grid-cols-1 gap-2">
              <button
                className="secondary-dark-button"
                disabled={Boolean(busyAction)}
                onClick={() => runRouterAction("diagnose", onDiagnoseRouter)}
                type="button"
              >
                <Network size={16} />
                {busyAction === "diagnose" ? "Diagnosticando" : "Diagnosticar servicios"}
              </button>
              <button
                className="secondary-dark-button"
                disabled={Boolean(busyAction)}
                onClick={() => runRouterAction("test", onTestRouter)}
                type="button"
              >
                <Unplug size={16} />
                {busyAction === "test" ? "Probando" : "Probar conexion"}
              </button>
              <button
                className="secondary-dark-button"
                disabled={Boolean(busyAction)}
                onClick={() => runRouterAction("sync", onSyncWireGuard)}
                type="button"
              >
                <RefreshCw size={16} />
                {busyAction === "sync" ? "Sincronizando" : "Sincronizar WireGuard"}
              </button>
            </div>
            {actionState.message && (
              <div className={`dark-message ${actionState.type === "error" ? "dark-message-error" : "dark-message-success"}`}>
                {actionState.message}
              </div>
            )}
            {selectedRouter.diagnostics?.length > 0 && (
              <div className="service-diagnostics">
                {selectedRouter.diagnostics.map((item) => (
                  <div className="service-row" key={item.key}>
                    <span className={`service-dot service-dot-${item.status}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.label}</span>
                      <span className="block truncate text-xs text-[#d8c8b5]">{item.protocol} {item.port} · {item.status}</span>
                    </span>
                    <span className="text-xs text-[#d8c8b5]">{item.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            )}
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
            Sin credenciales guardadas. El secreto solo se almacena cifrado localmente.
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

function RouterStatus({ status }) {
  const config = statusMap[status] || statusMap.pending_connection;
  const Icon = config.icon;

  return (
    <span className={`router-status router-status-${config.tone}`}>
      <Icon size={13} />
    </span>
  );
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export default OperationsPanel;
