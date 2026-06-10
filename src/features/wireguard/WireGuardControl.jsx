import { Network, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listWireGuardKeys } from "../../shared/api/wireGuardKeyStore.js";
import { addWireGuardPeer, listWireGuardTunnels } from "../../shared/api/wireGuardStore.js";

const initialPeerForm = {
  interfaceName: "",
  keyId: "",
  publicKey: "",
  allowedAddress: "",
  endpointAddress: "",
  endpointPort: "",
  persistentKeepalive: "25s",
  comment: "",
  disabled: false
};

function WireGuardControl({ routers, selectedRouter, onSyncWireGuard }) {
  const [tunnels, setTunnels] = useState([]);
  const [keys, setKeys] = useState([]);
  const [peerForm, setPeerForm] = useState(initialPeerForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isPeerSaving, setIsPeerSaving] = useState(false);
  const [actionState, setActionState] = useState({ type: "idle", message: "" });

  const selectedRouterId = selectedRouter?.id || null;
  const totalTraffic = useMemo(
    () => tunnels.reduce((sum, tunnel) => sum + tunnel.rxBytes + tunnel.txBytes, 0),
    [tunnels]
  );

  async function refreshTunnels() {
    setIsLoading(true);
    try {
      const [nextTunnels, nextKeys] = await Promise.all([
        listWireGuardTunnels(selectedRouterId),
        listWireGuardKeys()
      ]);
      setTunnels(nextTunnels);
      setKeys(nextKeys);
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

  async function handleCreatePeer(event) {
    event.preventDefault();

    if (!selectedRouter) {
      setActionState({ type: "error", message: "Selecciona un router antes de crear el peer." });
      return;
    }

    setIsPeerSaving(true);
    setActionState({ type: "idle", message: "" });

    try {
      await addWireGuardPeer({
        routerId: selectedRouter.id,
        ...peerForm
      });
      setPeerForm(initialPeerForm);
      await refreshTunnels();
      setActionState({ type: "success", message: "Peer creado en RouterOS y lectura WireGuard actualizada." });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo crear el peer en RouterOS." });
    } finally {
      setIsPeerSaving(false);
    }
  }

  function updatePeerField(field, value) {
    setPeerForm((current) => ({ ...current, [field]: value }));
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

      <form className="mb-5 rounded-lg border border-warm-line bg-[#fff9ef] p-4" onSubmit={handleCreatePeer}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Crear peer en RouterOS</h3>
            <p className="mt-1 text-sm text-warm-muted">
              Ejecuta `/interface/wireguard/peers/add` sobre el router seleccionado.
            </p>
          </div>
          <span className="rounded-full bg-[#f4ead9] px-3 py-1 text-xs font-bold text-warm-muted">
            {selectedRouter ? selectedRouter.alias : "Sin router"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <label className="field-label">
            Interfaz WireGuard
            <input
              className="field-input"
              onChange={(event) => updatePeerField("interfaceName", event.target.value)}
              placeholder="Ej. wireguard1"
              required
              value={peerForm.interfaceName}
            />
          </label>
          <label className="field-label">
            Llave de la boveda
            <select
              className="field-input"
              onChange={(event) => updatePeerField("keyId", event.target.value)}
              value={peerForm.keyId}
            >
              <option value="">Usar llave publica manual</option>
              {keys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.label}
                </option>
              ))}
            </select>
          </label>
          {!peerForm.keyId && (
            <label className="field-label xl:col-span-2">
              Llave publica manual
              <input
                className="field-input"
                onChange={(event) => updatePeerField("publicKey", event.target.value)}
                placeholder="Base64 de 32 bytes"
                required={!peerForm.keyId}
                value={peerForm.publicKey}
              />
            </label>
          )}
          <label className="field-label">
            Allowed address
            <input
              className="field-input"
              onChange={(event) => updatePeerField("allowedAddress", event.target.value)}
              placeholder="Ej. 10.70.8.10/32"
              required
              value={peerForm.allowedAddress}
            />
          </label>
          <label className="field-label">
            Comentario
            <input
              className="field-input"
              onChange={(event) => updatePeerField("comment", event.target.value)}
              placeholder="Ej. soporte-lima"
              value={peerForm.comment}
            />
          </label>
          <label className="field-label">
            Endpoint address
            <input
              className="field-input"
              onChange={(event) => updatePeerField("endpointAddress", event.target.value)}
              placeholder="Opcional"
              value={peerForm.endpointAddress}
            />
          </label>
          <label className="field-label">
            Endpoint port
            <input
              className="field-input"
              max="65535"
              min="1"
              onChange={(event) => updatePeerField("endpointPort", event.target.value)}
              placeholder="Opcional"
              type="number"
              value={peerForm.endpointPort}
            />
          </label>
          <label className="field-label">
            Persistent keepalive
            <input
              className="field-input"
              onChange={(event) => updatePeerField("persistentKeepalive", event.target.value)}
              placeholder="Ej. 25s"
              value={peerForm.persistentKeepalive}
            />
          </label>
          <label className="toggle-row self-end">
            <input
              checked={peerForm.disabled}
              onChange={(event) => updatePeerField("disabled", event.target.checked)}
              type="checkbox"
            />
            <span>Crear peer deshabilitado</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="primary-button" disabled={isPeerSaving} type="submit">
            <Plus size={16} />
            {isPeerSaving ? "Creando peer" : "Crear peer"}
          </button>
        </div>
      </form>

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
