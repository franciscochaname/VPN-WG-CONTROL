import {
  CheckCircle2,
  GitBranch,
  KeyRound,
  Network,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listWireGuardKeys } from "../../shared/api/wireGuardKeyStore.js";
import { listWireGuardTunnels, orchestrateWireGuardVpn } from "../../shared/api/wireGuardStore.js";
import ConfirmDialog from "../../shared/ui/ConfirmDialog.jsx";

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
    shortLabel: "Usuario o equipo",
    detail: "Peer individual para soporte, usuario, notebook o equipo final.",
    fields: ["Nombre", "Interfaz", "Llave", "IP del peer"],
    automation: ["Peer", "Puerto UDP", "Forward seguro", "Verificacion"]
  },
  {
    id: "site-to-site",
    label: "Sitio a sitio",
    shortLabel: "Red contra red",
    detail: "Une dos redes con ruta hacia el segmento remoto.",
    fields: ["Nombre", "Interfaz", "Llave", "Red local", "Red remota"],
    automation: ["Peer", "Firewall", "Ruta remota", "Verificacion"]
  },
  {
    id: "branch-nat",
    label: "Sede con NAT",
    shortLabel: "Sucursal simple",
    detail: "Conecta una sede remota usando masquerade por el tunel.",
    fields: ["Nombre", "Interfaz", "Llave", "Red local", "Red remota"],
    automation: ["Peer", "Firewall", "Ruta", "NAT", "Verificacion"]
  },
  {
    id: "trunk",
    label: "Troncal",
    shortLabel: "Transporte",
    detail: "Enlace de transporte para segmentos o VLANs entre sedes.",
    fields: ["Nombre", "Interfaz", "Llave", "Segmento remoto"],
    automation: ["Peer", "Firewall", "Ruta troncal", "Verificacion"]
  }
];

function WireGuardControl({ routers, selectedRouter, onSyncWireGuard, onWorkspaceRefresh, onNotify }) {
  const [tunnels, setTunnels] = useState([]);
  const [keys, setKeys] = useState([]);
  const [peerForm, setPeerForm] = useState(initialPeerForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isPeerSaving, setIsPeerSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [actionState, setActionState] = useState({ type: "idle", message: "" });
  const [lastRunSteps, setLastRunSteps] = useState([]);

  const selectedRouterId = selectedRouter?.id || null;
  const selectedType = useMemo(
    () => vpnTypes.find((type) => type.id === peerForm.vpnType) || vpnTypes[0],
    [peerForm.vpnType]
  );
  const validation = useMemo(() => validatePeerForm(peerForm), [peerForm]);
  const totalTraffic = useMemo(
    () => tunnels.reduce((sum, tunnel) => sum + tunnel.rxBytes + tunnel.txBytes, 0),
    [tunnels]
  );
  const readiness = useMemo(() => buildReadiness(peerForm), [peerForm]);

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
      onNotify?.({
        type: "warning",
        title: "Router requerido",
        detail: "Registra o selecciona un router antes de sincronizar WireGuard."
      });
      return;
    }

    setActionState({ type: "idle", message: "" });
    try {
      await onSyncWireGuard(selectedRouter.id);
      await refreshTunnels();
      setActionState({ type: "success", message: "Lectura WireGuard finalizada con datos reales del router." });
      onNotify?.({
        type: "success",
        title: "WireGuard sincronizado",
        detail: "La lectura real actualizo tuneles, trafico y monitoreo."
      });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo sincronizar WireGuard." });
      onNotify?.({
        type: "error",
        title: "Sincronizacion fallida",
        detail: error.message || "No se pudo sincronizar WireGuard."
      });
    }
  }

  async function handleCreatePeer(event) {
    event.preventDefault();

    if (!selectedRouter) {
      setActionState({ type: "error", message: "Selecciona un router antes de crear la VPN." });
      onNotify?.({
        type: "warning",
        title: "Router requerido",
        detail: "Selecciona un router en el panel lateral para continuar."
      });
      return;
    }

    if (!validation.canSubmit) {
      setActionState({ type: "error", message: validation.errors[0] || "Revisa los datos de la VPN." });
      onNotify?.({
        type: "warning",
        title: "Datos incompletos",
        detail: validation.errors[0] || "Revisa los datos de la VPN."
      });
      return;
    }

    setConfirmCreateOpen(true);
  }

  async function executeCreatePeer() {
    if (!selectedRouter) {
      return;
    }

    setIsPeerSaving(true);
    setConfirmCreateOpen(false);
    setActionState({ type: "idle", message: "" });

    try {
      const result = await orchestrateWireGuardVpn({
        routerId: selectedRouter.id,
        ...peerForm
      });
      setPeerForm(initialPeerForm);
      setShowAdvanced(false);
      setLastRunSteps(result.steps || []);
      await refreshTunnels();
      await onWorkspaceRefresh?.({ silent: true });
      setActionState({ type: "success", message: "VPN orquestada y verificada con lectura actualizada." });
      onNotify?.({
        type: "success",
        title: "VPN creada",
        detail: `${selectedType.label}: peer, reglas y verificacion quedaron integrados al monitoreo.`
      });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo completar la orquestacion VPN." });
      onNotify?.({
        type: "error",
        title: "Orquestacion detenida",
        detail: error.message || "No se pudo completar la VPN."
      });
    } finally {
      setIsPeerSaving(false);
    }
  }

  function updatePeerField(field, value) {
    setPeerForm((current) => ({ ...current, [field]: value }));
  }

  function selectVpnType(vpnType) {
    setPeerForm((current) => ({
      ...current,
      vpnType,
      enableNat: vpnType === "branch-nat" ? true : current.enableNat
    }));
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
            Creacion guiada por tipo de conexion, con automatizacion de peer, reglas, rutas y verificacion.
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
            <h3 className="font-semibold">Asistente de nueva VPN</h3>
            <p className="mt-1 text-sm text-warm-muted">
              Elige el tipo y completa solo los datos necesarios para ese escenario.
            </p>
          </div>
          <span className="rounded-full bg-[#f4ead9] px-3 py-1 text-xs font-bold text-warm-muted">
            {selectedRouter ? selectedRouter.alias : "Sin router"}
          </span>
        </div>

        <div className="wizard-layout">
          <section className="wizard-main">
            <div className="wizard-step">
              <div className="wizard-step-head">
                <span>1</span>
                <div>
                  <h4>Tipo de conexion</h4>
                  <p>La pantalla cambia segun el escenario elegido.</p>
                </div>
              </div>
              <div className="vpn-type-grid">
                {vpnTypes.map((type) => (
                  <button
                    className={peerForm.vpnType === type.id ? "vpn-type-card vpn-type-card-active" : "vpn-type-card"}
                    key={type.id}
                    onClick={() => selectVpnType(type.id)}
                    type="button"
                  >
                    <GitBranch size={17} />
                    <strong>{type.label}</strong>
                    <small>{type.shortLabel}</small>
                    <span>{type.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="wizard-step">
              <div className="wizard-step-head">
                <span>2</span>
                <div>
                  <h4>Datos principales</h4>
                  <p>{selectedType.fields.join(" - ")}</p>
                </div>
              </div>

              <div className="smart-field-grid">
                <label className="field-label">
                  Nombre
                  <input
                    className="field-input"
                    onChange={(event) => updatePeerField("label", event.target.value)}
                    placeholder="Ej. soporte-remoto"
                    value={peerForm.label}
                  />
                  {validation.fieldErrors.label && <span className="field-error">{validation.fieldErrors.label}</span>}
                </label>
                <label className="field-label">
                  Interfaz
                  <input
                    className="field-input"
                    onChange={(event) => updatePeerField("interfaceName", event.target.value)}
                    placeholder="Ej. wireguard1"
                    required
                    value={peerForm.interfaceName}
                  />
                  {validation.fieldErrors.interfaceName && <span className="field-error">{validation.fieldErrors.interfaceName}</span>}
                </label>
                <label className="field-label">
                  IP del peer
                  <input
                    className="field-input"
                    onChange={(event) => updatePeerField("allowedAddress", event.target.value)}
                    placeholder="Ej. 10.70.8.10/32"
                    required
                    value={peerForm.allowedAddress}
                  />
                  {validation.fieldErrors.allowedAddress && <span className="field-error">{validation.fieldErrors.allowedAddress}</span>}
                </label>
                {peerForm.vpnType !== "remote-access" && (
                  <label className="field-label">
                    Red remota
                    <input
                      className="field-input"
                      onChange={(event) => updatePeerField("remoteSubnet", event.target.value)}
                      placeholder="Ej. 10.80.0.0/24"
                      required
                      value={peerForm.remoteSubnet}
                    />
                    {validation.fieldErrors.remoteSubnet && <span className="field-error">{validation.fieldErrors.remoteSubnet}</span>}
                  </label>
                )}
                {peerForm.vpnType !== "remote-access" && (
                  <label className="field-label">
                    Red local
                    <input
                      className="field-input"
                      onChange={(event) => updatePeerField("localSubnet", event.target.value)}
                      placeholder="Ej. 192.168.20.0/24"
                      value={peerForm.localSubnet}
                    />
                    {validation.fieldErrors.localSubnet && <span className="field-error">{validation.fieldErrors.localSubnet}</span>}
                  </label>
                )}
              </div>
            </div>

            <div className="wizard-step">
              <div className="wizard-step-head">
                <span>3</span>
                <div>
                  <h4>Llave publica</h4>
                  <p>Usa una llave guardada o pega la publica del cliente.</p>
                </div>
              </div>

              <div className="key-choice">
                <label className="field-label">
                  Boveda de llaves
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
                  <label className="field-label">
                    Llave publica manual
                    <input
                      className="field-input"
                      onChange={(event) => updatePeerField("publicKey", event.target.value)}
                      placeholder="Base64 de 32 bytes"
                      required
                      value={peerForm.publicKey}
                    />
                    {validation.fieldErrors.publicKey && <span className="field-error">{validation.fieldErrors.publicKey}</span>}
                  </label>
                )}
              </div>
            </div>

            <button className="advanced-toggle" onClick={() => setShowAdvanced((current) => !current)} type="button">
              <SlidersHorizontal size={16} />
              <span>{showAdvanced ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}</span>
            </button>

            {showAdvanced && (
              <div className="advanced-panel">
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
                  {validation.fieldErrors.listenPort && <span className="field-error">{validation.fieldErrors.listenPort}</span>}
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
                  {validation.fieldErrors.endpointPort && <span className="field-error">{validation.fieldErrors.endpointPort}</span>}
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
                    {validation.fieldErrors.routeDistance && <span className="field-error">{validation.fieldErrors.routeDistance}</span>}
                  </label>
                )}
                <label className="field-label">
                  Comentario
                  <input
                    className="field-input"
                    onChange={(event) => updatePeerField("comment", event.target.value)}
                    placeholder="Opcional"
                    value={peerForm.comment}
                  />
                </label>
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
                  <span>Aplicar NAT/Masquerade</span>
                </label>
                <label className="toggle-row">
                  <input
                    checked={peerForm.disabled}
                    onChange={(event) => updatePeerField("disabled", event.target.checked)}
                    type="checkbox"
                  />
                  <span>Crear peer deshabilitado</span>
                </label>
              </div>
            )}
          </section>

          <aside className="wizard-preview">
            <div className="preview-card">
              <div className="preview-icon">
                <Wand2 size={20} />
              </div>
              <h4>{selectedType.label}</h4>
              <p>{selectedType.detail}</p>
            </div>

            <div className="readiness-list">
              {readiness.map((item) => (
                <div className={item.ready ? "readiness-item readiness-item-ready" : "readiness-item"} key={item.label}>
                  <CheckCircle2 size={15} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="automation-box">
              <p>Se ejecutara</p>
              {selectedType.automation.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            {validation.errors.length > 0 && (
              <div className="readiness-list">
                {validation.errors.slice(0, 3).map((error) => (
                  <div className="readiness-item" key={error}>
                    <CheckCircle2 size={15} />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="primary-button w-full" disabled={isPeerSaving || !selectedRouter || !validation.canSubmit} type="submit">
              <Plus size={16} />
              {isPeerSaving ? "Orquestando VPN" : "Crear VPN completa"}
            </button>
          </aside>
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

      <ConfirmDialog
        confirmLabel="Crear VPN"
        detail={`Se ejecutara la orquestacion ${selectedType.label} sobre ${selectedRouter?.alias || "el router seleccionado"}: ${selectedType.automation.join(", ")}.`}
        isBusy={isPeerSaving}
        isOpen={confirmCreateOpen}
        onCancel={() => setConfirmCreateOpen(false)}
        onConfirm={executeCreatePeer}
        title="Revisar antes de aplicar"
      />

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

function buildReadiness(form) {
  const items = [
    { label: "Tipo elegido", ready: Boolean(form.vpnType) },
    { label: "Interfaz", ready: Boolean(form.interfaceName) },
    { label: "IP del peer", ready: Boolean(form.allowedAddress) },
    { label: "Llave publica", ready: Boolean(form.keyId || form.publicKey) }
  ];

  if (form.vpnType !== "remote-access") {
    items.push({ label: "Red remota", ready: Boolean(form.remoteSubnet) });
  }

  return items;
}

function validatePeerForm(form) {
  const fieldErrors = {};
  const errors = [];

  if (!form.interfaceName.trim()) {
    fieldErrors.interfaceName = "Interfaz requerida.";
  }

  if (!isCidr(form.allowedAddress)) {
    fieldErrors.allowedAddress = "Usa CIDR IPv4. Ej. 10.70.8.10/32.";
  }

  if (!form.keyId && !isWireGuardPublicKey(form.publicKey)) {
    fieldErrors.publicKey = "Llave publica WireGuard invalida.";
  }

  if (["site-to-site", "branch-nat", "trunk"].includes(form.vpnType) && !isCidr(form.remoteSubnet)) {
    fieldErrors.remoteSubnet = "Red remota CIDR requerida.";
  }

  if (form.localSubnet && !isCidr(form.localSubnet)) {
    fieldErrors.localSubnet = "Red local CIDR invalida.";
  }

  if (!isPort(form.listenPort)) {
    fieldErrors.listenPort = "Puerto WireGuard invalido.";
  }

  if (form.endpointPort && !isPort(form.endpointPort)) {
    fieldErrors.endpointPort = "Puerto endpoint invalido.";
  }

  const routeDistance = Number(form.routeDistance || 1);
  if (!Number.isInteger(routeDistance) || routeDistance < 1 || routeDistance > 255) {
    fieldErrors.routeDistance = "Distancia entre 1 y 255.";
  }

  for (const error of Object.values(fieldErrors)) {
    errors.push(error);
  }

  return {
    canSubmit: errors.length === 0,
    errors,
    fieldErrors
  };
}

function isWireGuardPublicKey(value) {
  return /^[A-Za-z0-9+/]{43}=$/.test(value || "");
}

function isCidr(value) {
  const [ip, prefixText] = String(value || "").trim().split("/");
  const prefix = Number(prefixText);

  return isIpv4(ip) && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

function isIpv4(value) {
  const parts = String(value || "").trim().split(".");

  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

function isPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
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
