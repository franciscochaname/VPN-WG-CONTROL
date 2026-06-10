import { Network, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listWireGuardTunnels } from "../../shared/api/wireGuardStore.js";

function WireGuardControl({ routers, selectedRouter, onSyncWireGuard }) {
  const [tunnels, setTunnels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionState, setActionState] = useState({ type: "idle", message: "" });

  const selectedRouterId = selectedRouter?.id || null;
  const totalTraffic = useMemo(
    () => tunnels.reduce((sum, tunnel) => sum + tunnel.rxBytes + tunnel.txBytes, 0),
    [tunnels]
  );

  async function refreshTunnels() {
    setIsLoading(true);
    try {
      setTunnels(await listWireGuardTunnels(selectedRouterId));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSync() {
    if (!selectedRouter) {
      setActionState({ type: "error", message: "Registra y selecciona un router antes de sincronizar WireGuard." });
      return;
    }

    setActionState({ type: "idle", message: "" });
    try {
      await onSyncWireGuard(selectedRouter.id);
      await refreshTunnels();
      setActionState({ type: "success", message: "Lectura WireGuard finalizada con datos reales del router." });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo sincronizar WireGuard." });
    }
  }

  useEffect(() => {
    refreshTunnels();
  }, [selectedRouterId]);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">WireGuard</p>
          <h2 className="mt-1 text-xl font-semibold">Tuneles y peers</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Solo se muestran interfaces y peers sincronizados desde RouterOS.
          </p>
        </div>
        <button className="action-button" onClick={handleSync} type="button">
          <RefreshCw size={16} />
          <span>Sincronizar</span>
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile label="Routers" value={String(routers.length)} />
        <SummaryTile label="Tuneles/peers" value={String(tunnels.length)} />
        <SummaryTile label="Trafico registrado" value={formatBytes(totalTraffic)} />
      </div>

      {actionState.message && (
        <div className={`form-message ${actionState.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {actionState.message}
        </div>
      )}

      {isLoading ? (
        <div className="empty-panel">Cargando tuneles guardados.</div>
      ) : tunnels.length === 0 ? (
        <div className="empty-panel">
          <Network size={24} />
          <h3>Sin tuneles WireGuard sincronizados</h3>
          <p>
            Cuando la API RouterOS este accesible, usa sincronizar para leer interfaces y peers reales. No se crean registros ficticios.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-warm-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Router</th>
                <th>Interfaz</th>
                <th>Allowed address</th>
                <th>Endpoint</th>
                <th>Handshake</th>
                <th>RX/TX</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {tunnels.map((tunnel) => (
                <tr key={tunnel.id}>
                  <td>
                    <b>{tunnel.routerAlias}</b>
                    <span>{tunnel.routerHost}</span>
                  </td>
                  <td>{tunnel.interfaceName}</td>
                  <td>{tunnel.allowedAddress || "Sin dato"}</td>
                  <td>{tunnel.endpoint || "Sin endpoint"}</td>
                  <td>{tunnel.lastHandshakeAt || "Sin handshake"}</td>
                  <td>{formatBytes(tunnel.rxBytes)} / {formatBytes(tunnel.txBytes)}</td>
                  <td>
                    <span className="inline-status">
                      <ShieldCheck size={13} />
                      {tunnel.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
      <p className="text-sm text-warm-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatBytes(value) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default WireGuardControl;
