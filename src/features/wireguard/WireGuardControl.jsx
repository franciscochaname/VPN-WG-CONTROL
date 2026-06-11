import { GitBranch, Network, Plus, RefreshCw, Route, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listWireGuardKeys } from "../../shared/api/wireGuardKeyStore.js";
import { listWireGuardTunnels, orchestrateWireGuardVpn } from "../../shared/api/wireGuardStore.js";

const initialPeerForm = {
  vpnType: "remote-access",
  label: "",
  interfaceName: "",
  keyId: "",
  publicKey: "",
  allowedAddress: "",
  localSubnet: "",
  remoteSubnet: "",
  listenPort: "13231",
  routeDistance: "1",
  endpointAddress: "",
  endpointPort: "",
  persistentKeepalive: "25s",
  comment: "",
  enableFirewall: true,
  enableNat: false,
  disabled: false
};

const vpnTypes = [
  {
    id: "remote-access",
    label: "Acceso remoto",
    detail: "Un peer individual para soporte, usuario o equipo final."
  },
  {
    id: "site-to-site",
    label: "Sitio a sitio",
    detail: "Une dos redes con ruta hacia el segmento remoto."
  },
  {
    id: "branch-nat",
    label: "Sede con NAT",
    detail: "Sede remota con salida traducida por el tunel."
  },
  {
    id: "trunk",
    label: "Troncal",
    detail: "Enlace de transporte para segmentos o VLANs entre sedes."
  }
];

function WireGuardControl({ routers, selectedRouter, onSyncWireGuard }) {
  const [tunnels, setTunnels] = useState([]);
  const [keys, setKeys] = useState([]);
  const [peerForm, setPeerForm] = useState(initialPeerForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isPeerSaving, setIsPeerSaving] = useState(false);
  const [actionState, setActionState] = useState({ type: "idle", message: "" });
  const [lastRunSteps, setLastRunSteps] = useState([]);

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
      const result = await orchestrateWireGuardVpn({
        routerId: selectedRouter.id,
        ...peerForm
      });
      setPeerForm(initialPeerForm);
      setLastRunSteps(result.steps || []);
      await refreshTunnels();
      setActionState({ type: "success", message: "VPN orquestada y verificada con lectura actualizada." });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo completar la orquestacion VPN." });
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
            <h3 className="font-semibold">Crear VPN guiada</h3>
            <p className="mt-1 text-sm text-warm-muted">
              Crea peer, reglas, rutas, NAT y verificacion final segun el tipo de despliegue.
            </p>
          </div>
          <span className="rounded-full bg-[#f4ead9] px-3 py-1 text-xs font-bold text-warm-muted">
            {selectedRouter ? selectedRouter.alias : "Sin router"}
          </span>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
          {vpnTypes.map((type) => (
            <button
              className={peerForm.vpnType === type.id ? "vpn-type-card vpn-type-card-active" : "vpn-type-card"}
              key={type.id}
              onClick={() => updatePeerField("vpnType", type.id)}
              type="button"
            >
              <GitBranch size={17} />
              <strong>{type.label}</strong>
              <span>{type.detail}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <label className="field-label">
            Nombre del despliegue
            <input
              className="field-input"
              onChange={(event) => updatePeerField("label", event.target.value)}
              placeholder="Ej. sede-lima, soporte-remoto"
              value={peerForm.label}
            />
          </label>
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
          {peerForm.vpnType !== "remote-access" && (
            <label className="field-label">
              Red remota
              <input
                className="field-input"
                onChange={(event) => updatePeerField("remoteSubnet", event.target.value)}
                placeholder="Ej. 10.80.0.0/24"
                required={peerForm.vpnType !== "remote-access"}
                value={peerForm.remoteSubnet}
              />
            </label>
          )}
          <label className="field-label">
            Red local
            <input
              className="field-input"
              onChange={(event) => updatePeerField("localSubnet", event.target.value)}
              placeholder="Ej. 192.168.20.0/24"
              value={peerForm.localSubnet}
            />
          </label>
          <label className="field-label">
            Puerto publico WireGuard
            <input
              className="field-input"
              max="65535"
              min="1"
              onChange={(event) => updatePeerField("listenPort", event.target.value)}
              type="number"
              value={peerForm.listenPort}
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
          {peerForm.vpnType !== "remote-access" && (
            <label className="field-label">
              Distancia de ruta
              <input
                className="field-input"
                max="255"
                min="1"
                onChange={(event) => updatePeerField("routeDistance", event.target.value)}
                type="number"
                value={peerForm.routeDistance}
              />
            </label>
          )}
          <label className="toggle-row">
            <input
              checked={peerForm.enableFirewall}
              onChange={(event) => updatePeerField("enableFirewall", event.target.checked)}
              type="checkbox"
            />
            <span>Aplicar reglas firewall necesarias</span>
          </label>
          <label className="toggle-row">
            <input
              checked={peerForm.enableNat || peerForm.vpnType === "branch-nat"}
              disabled={peerForm.vpnType === "branch-nat"}
              onChange={(event) => updatePeerField("enableNat", event.target.checked)}
              type="checkbox"
            />
            <span>Aplicar NAT/Masquerade para el tunel</span>
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
            {isPeerSaving ? "Orquestando VPN" : "Crear VPN completa"}
          </button>
        </div>
      </form>

      {actionState.message && (
        <div className={`form-message ${actionState.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {actionState.message}
        </div>
      )}

      {lastRunSteps.length > 0 && (
        <section className="mb-5 rounded-lg border border-warm-line bg-[#fff9ef] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Route size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Ultima verificacion de orquestacion</h3>
          </div>
          <div className="grid gap-2">
            {lastRunSteps.map((step) => (
              <div className="orchestration-step" key={`${step.key}-${step.label}`}>
                <span className={step.status === "ok" ? "step-dot step-dot-ok" : "step-dot step-dot-error"} />
                <strong>{step.label}</strong>
                <small>{step.status === "ok" ? "correcto" : step.detail}</small>
              </div>
            ))}
          </div>
        </section>
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
