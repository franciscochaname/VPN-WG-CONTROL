import {
  AlertTriangle,
  GitBranch,
  Gauge,
  LocateFixed,
  LockKeyhole,
  Network,
  Plus,
  RefreshCw,
  Route,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  analyzeIpam,
  createIpSegment,
  releaseIpReservation,
  removeIpSegment,
  reserveIpAddress,
  suggestIpAddress,
  syncIpInventory
} from "../../shared/api/ipamStore.js";
import ConfirmDialog from "../../shared/ui/ConfirmDialog.jsx";

const initialForm = {
  label: "",
  cidr: "",
  gateway: "",
  interfaceName: "",
  purpose: "lan",
  vlanId: "",
  trunkName: ""
};

const initialReservationForm = {
  segmentId: "",
  ipAddress: "",
  label: "",
  assignmentType: "manual"
};

const emptyAnalysis = {
  summary: {
    totalSegments: 0,
    totalReservations: 0,
    totalTunnels: 0,
    usableIps: 0,
    usedIps: 0,
    reservedIps: 0,
    freeEstimate: 0,
    utilization: 0,
    overlaps: 0,
    conflicts: 0
  },
  segments: [],
  reservations: [],
  overlaps: [],
  conflicts: [],
  findings: []
};

const purposeLabels = {
  lan: "LAN",
  wan: "WAN",
  vpn: "VPN",
  trunk: "Troncal",
  unknown: "Sin clasificar"
};

const assignmentLabels = {
  manual: "Manual",
  wireguard: "WireGuard",
  routeros: "RouterOS",
  dhcp: "DHCP/IPAM"
};

const sourceLabels = {
  routeros: "RouterOS",
  wireguard: "WireGuard",
  reservation: "Reserva",
  manual: "Plan"
};

function IpamCenter({ selectedRouter, onWorkspaceRefresh, onNotify }) {
  const [analysis, setAnalysis] = useState(emptyAnalysis);
  const [form, setForm] = useState(initialForm);
  const [reservationForm, setReservationForm] = useState(initialReservationForm);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [segmentToRemove, setSegmentToRemove] = useState(null);
  const [reservationToRelease, setReservationToRelease] = useState(null);
  const selectedRouterId = selectedRouter?.id || null;
  const segments = analysis.segments || [];
  const reservations = analysis.reservations || [];
  const summaryCards = useMemo(() => buildSummaryCards(analysis.summary), [analysis.summary]);
  const selectedSegment = segments.find((segment) => segment.id === reservationForm.segmentId) || null;

  async function refreshIpam() {
    setIsLoading(true);
    try {
      const nextAnalysis = await analyzeIpam(selectedRouterId);
      setAnalysis(nextAnalysis || emptyAnalysis);
      setReservationForm((current) => {
        const segmentStillExists = nextAnalysis?.segments?.some((segment) => segment.id === current.segmentId);
        const firstSegment = nextAnalysis?.segments?.[0]?.id || "";
        return {
          ...current,
          segmentId: segmentStillExists ? current.segmentId : firstSegment
        };
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSync() {
    if (!selectedRouter) {
      setMessage({ type: "error", text: "Selecciona un router para sincronizar segmentos reales." });
      return;
    }

    setBusyAction("sync");
    setMessage({ type: "idle", text: "" });

    try {
      const result = await syncIpInventory(selectedRouter.id);
      await refreshIpam();
      setMessage({
        type: "success",
        text: `Segmentos sincronizados. Interfaces: ${result.interfaces}, VLANs: ${result.vlans}, rutas: ${result.routes}.`
      });
      await onWorkspaceRefresh?.({ silent: true });
      onNotify?.({
        type: "success",
        title: "IPAM sincronizado",
        detail: `${result.segments?.length || 0} segmento(s) reales quedaron disponibles para planificar VPN.`
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo sincronizar segmentacion." });
      onNotify?.({
        type: "error",
        title: "IPAM no sincronizado",
        detail: error.message || "No se pudo sincronizar segmentacion."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setBusyAction("create");
    setMessage({ type: "idle", text: "" });

    try {
      await createIpSegment({
        routerId: selectedRouter?.id || null,
        ...form
      });
      setForm(initialForm);
      await refreshIpam();
      await onWorkspaceRefresh?.({ silent: true });
      setMessage({ type: "success", text: "Segmento guardado y analizado por IPAM." });
      onNotify?.({
        type: "success",
        title: "Segmento guardado",
        detail: `${form.cidr} queda disponible para reservas, VPN y deteccion de solapes.`
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo guardar el segmento." });
      onNotify?.({
        type: "error",
        title: "Segmento no guardado",
        detail: error.message || "No se pudo guardar el segmento."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSuggestIp() {
    if (!reservationForm.segmentId) {
      setMessage({ type: "error", text: "Selecciona un segmento para sugerir IP." });
      return;
    }

    setBusyAction("suggest");
    setMessage({ type: "idle", text: "" });

    try {
      const suggestion = await suggestIpAddress({ segmentId: reservationForm.segmentId });
      setReservationForm((current) => ({ ...current, ipAddress: suggestion.ipAddress }));
      setMessage({ type: "success", text: `IP sugerida: ${suggestion.ipAddress}.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo sugerir una IP." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReserve(event) {
    event.preventDefault();
    setBusyAction("reserve");
    setMessage({ type: "idle", text: "" });

    try {
      await reserveIpAddress(reservationForm);
      setReservationForm((current) => ({
        ...initialReservationForm,
        segmentId: current.segmentId
      }));
      await refreshIpam();
      await onWorkspaceRefresh?.({ silent: true });
      setMessage({ type: "success", text: "IP reservada y bloqueada para futuras asignaciones." });
      onNotify?.({
        type: "success",
        title: "Reserva IP creada",
        detail: "La IP queda protegida contra asignaciones duplicadas."
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo reservar la IP." });
      onNotify?.({
        type: "error",
        title: "Reserva no creada",
        detail: error.message || "No se pudo reservar la IP."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function executeRemoveSegment() {
    if (!segmentToRemove) {
      return;
    }

    await removeIpSegment(segmentToRemove.id);
    const removedSegment = segmentToRemove;
    setSegmentToRemove(null);
    await refreshIpam();
    await onWorkspaceRefresh?.({ silent: true });
    onNotify?.({
      type: "info",
      title: "Segmento eliminado",
      detail: `${removedSegment.cidr} fue retirado de la planificacion.`
    });
  }

  async function executeReleaseReservation() {
    if (!reservationToRelease) {
      return;
    }

    await releaseIpReservation(reservationToRelease.id);
    const released = reservationToRelease;
    setReservationToRelease(null);
    await refreshIpam();
    await onWorkspaceRefresh?.({ silent: true });
    onNotify?.({
      type: "info",
      title: "Reserva liberada",
      detail: `${released.ipAddress} vuelve al espacio disponible.`
    });
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateReservationForm(field, value) {
    setReservationForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    refreshIpam();
  }, [selectedRouterId]);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Segmentacion</p>
          <h2 className="mt-1 text-xl font-semibold">IPAM inteligente, VLANs y troncales</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Planifica IPs reales y reservas antes de crear VPN, detectando solapes, duplicados y capacidad disponible.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="action-button" disabled={isLoading} onClick={refreshIpam} type="button">
            <Gauge size={16} />
            <span>Analizar</span>
          </button>
          <button className="action-button" disabled={busyAction === "sync"} onClick={handleSync} type="button">
            <RefreshCw size={16} />
            <span>{busyAction === "sync" ? "Sincronizando" : "Sincronizar IP"}</span>
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`form-message ${message.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {message.text}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-6">
        {summaryCards.map((item) => (
          <article className={`segment-summary ${item.tone ? `segment-summary-${item.tone}` : ""}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <form className="ipam-tool-panel" onSubmit={handleCreate}>
          <div className="mb-3 flex items-center gap-2">
            <Plus size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Registrar segmento planificado</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <label className="field-label">
              Etiqueta
              <input className="field-input" onChange={(event) => updateForm("label", event.target.value)} placeholder="Ej. LAN Lima" value={form.label} />
            </label>
            <label className="field-label">
              CIDR
              <input className="field-input" onChange={(event) => updateForm("cidr", event.target.value)} placeholder="Ej. 192.168.20.0/24" required value={form.cidr} />
            </label>
            <label className="field-label">
              Tipo
              <select className="field-input" onChange={(event) => updateForm("purpose", event.target.value)} value={form.purpose}>
                {Object.entries(purposeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Gateway
              <input className="field-input" onChange={(event) => updateForm("gateway", event.target.value)} placeholder="Opcional" value={form.gateway} />
            </label>
            <label className="field-label">
              Interfaz
              <input className="field-input" onChange={(event) => updateForm("interfaceName", event.target.value)} placeholder="bridge, vlan20, wg1" value={form.interfaceName} />
            </label>
            <label className="field-label">
              VLAN / troncal
              <input className="field-input" onChange={(event) => updateForm("vlanId", event.target.value)} placeholder="Ej. 20" value={form.vlanId} />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="primary-button" disabled={busyAction === "create"} type="submit">
              <Plus size={16} />
              Guardar segmento
            </button>
          </div>
        </form>

        <aside className="ipam-brain-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm-copper">Motor IPAM</p>
              <h3 className="font-semibold">Salud del direccionamiento</h3>
            </div>
            <span className={`ipam-score ${analysis.summary.conflicts > 0 ? "ipam-score-error" : analysis.summary.overlaps > 0 ? "ipam-score-warn" : "ipam-score-ok"}`}>
              {analysis.summary.utilization}%
            </span>
          </div>
          <div className="mt-4">
            <div className="ipam-utilization-track">
              <span style={{ width: `${Math.min(100, analysis.summary.utilization || 0)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-bold text-warm-muted">
              <span>{analysis.summary.usedIps} usadas</span>
              <span>{analysis.summary.freeEstimate} libres estimadas</span>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {analysis.findings.length === 0 ? (
              <div className="ipam-finding ipam-finding-ok">
                <p>Sin conflictos visibles</p>
                <span>Los segmentos analizados no muestran IPs duplicadas ni solapes.</span>
              </div>
            ) : (
              analysis.findings.slice(0, 4).map((finding, index) => (
                <div className={`ipam-finding ipam-finding-${finding.severity}`} key={`${finding.title}-${index}`}>
                  <p>{finding.title}</p>
                  <span>{finding.detail}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <form className="ipam-tool-panel" onSubmit={handleReserve}>
          <div className="mb-3 flex items-center gap-2">
            <LockKeyhole size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Reserva guiada de IP</h3>
          </div>
          <div className="grid gap-4">
            <label className="field-label">
              Segmento
              <select className="field-input" onChange={(event) => updateReservationForm("segmentId", event.target.value)} required value={reservationForm.segmentId}>
                <option value="">Seleccionar segmento</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.label} - {segment.networkCidr || segment.cidr}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="field-label">
                IP
                <input className="field-input" onChange={(event) => updateReservationForm("ipAddress", event.target.value)} placeholder={selectedSegment?.nextAvailableIp || "Ej. 10.10.10.2"} required value={reservationForm.ipAddress} />
              </label>
              <button className="icon-text-button self-end" disabled={!reservationForm.segmentId || busyAction === "suggest"} onClick={handleSuggestIp} type="button">
                <LocateFixed size={15} />
                Sugerir IP
              </button>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="field-label">
                Etiqueta
                <input className="field-input" onChange={(event) => updateReservationForm("label", event.target.value)} placeholder="Ej. Peer sucursal 01" value={reservationForm.label} />
              </label>
              <label className="field-label">
                Uso
                <select className="field-input" onChange={(event) => updateReservationForm("assignmentType", event.target.value)} value={reservationForm.assignmentType}>
                  {Object.entries(assignmentLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-between gap-3">
            <span className="ipam-help-text">
              {selectedSegment?.nextAvailableIp ? `Disponible sugerida: ${selectedSegment.nextAvailableIp}` : "El sistema evita gateway, reservas e IPs WireGuard ya detectadas."}
            </span>
            <button className="primary-button" disabled={busyAction === "reserve"} type="submit">
              <LockKeyhole size={16} />
              Reservar
            </button>
          </div>
        </form>

        <div className="ipam-tool-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Route size={18} className="text-warm-copper" />
              <h3 className="font-semibold">Reservas y rutas observadas</h3>
            </div>
            <span className="segment-source">{reservations.length} reservas</span>
          </div>
          {reservations.length === 0 ? (
            <div className="ipam-mini-empty">Aun no hay reservas manuales. Las IPs usadas por WireGuard se muestran dentro de cada segmento.</div>
          ) : (
            <div className="grid gap-2">
              {reservations.slice(0, 8).map((reservation) => (
                <article className="reservation-row" key={reservation.id}>
                  <div>
                    <p>{reservation.ipAddress}</p>
                    <span>{reservation.label} - {reservation.segmentLabel}</span>
                  </div>
                  <span className="segment-source">{assignmentLabels[reservation.assignmentType] || reservation.assignmentType}</span>
                  <button className="icon-text-button icon-text-danger" onClick={() => setReservationToRelease(reservation)} type="button">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="empty-panel">Analizando IPAM.</div>
      ) : segments.length === 0 ? (
        <div className="empty-panel">
          <Network size={24} />
          <h3>Sin segmentos registrados</h3>
          <p>Sincroniza un router o registra redes planificadas para controlar IP totales, VPN y troncales.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {segments.map((segment) => (
            <article className="segment-row segment-row-smart" key={segment.id}>
              <div className="segment-icon">
                <GitBranch size={18} />
              </div>
              <div className="min-w-0">
                <p>{segment.label}</p>
                <span>{segment.networkCidr || segment.cidr} - {segment.interfaceName || "sin interfaz"} - {segment.routerAlias || "global"}</span>
                <div className="segment-progress">
                  <span style={{ width: `${Math.min(100, segment.utilization || 0)}%` }} />
                </div>
              </div>
              <div className="segment-capacity">
                <strong>{segment.utilization || 0}%</strong>
                <span>{segment.usedCount}/{segment.usableIps} IPs</span>
              </div>
              <span className={`segment-badge segment-badge-${segment.purpose}`}>{purposeLabels[segment.purpose] || segment.purpose}</span>
              <span className="segment-source">{segment.source === "routeros" ? "real" : "plan"}</span>
              <div className="segment-next">
                <span>Proxima</span>
                <strong>{segment.nextAvailableIp || "sin cupo"}</strong>
              </div>
              <button className="icon-text-button icon-text-danger" onClick={() => setSegmentToRemove(segment)} type="button">
                <Trash2 size={15} />
              </button>
              {(segment.usedIps.length > 0 || segment.routedBlocks.length > 0) && (
                <div className="segment-detail-grid">
                  {segment.usedIps.slice(0, 5).map((entry) => (
                    <span className={`ipam-chip ipam-chip-${entry.source}`} key={`${segment.id}-${entry.source}-${entry.ipAddress}-${entry.label}`}>
                      {entry.ipAddress} - {sourceLabels[entry.source] || entry.source}
                    </span>
                  ))}
                  {segment.routedBlocks.slice(0, 3).map((route) => (
                    <span className="ipam-chip ipam-chip-wireguard" key={`${segment.id}-${route.cidr}-${route.label}`}>
                      {route.cidr} - ruta WG
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {analysis.overlaps.length > 0 && (
        <div className="mt-5 grid gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-warm-ink">
            <AlertTriangle size={17} className="text-warm-copper" />
            Solapes detectados
          </div>
          {analysis.overlaps.slice(0, 5).map((overlap, index) => (
            <div className={`ipam-finding ipam-finding-${overlap.severity}`} key={`${overlap.segmentA.id}-${overlap.segmentB.id}-${index}`}>
              <p>{overlap.segmentA.label} cruza con {overlap.segmentB.label}</p>
              <span>{overlap.segmentA.networkCidr} / {overlap.segmentB.networkCidr}. {overlap.detail}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Eliminar segmento"
        detail={`${segmentToRemove?.cidr || ""} se quitara de la planificacion local. No se eliminara del router.`}
        isOpen={Boolean(segmentToRemove)}
        onCancel={() => setSegmentToRemove(null)}
        onConfirm={executeRemoveSegment}
        title="Eliminar segmento planificado"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel="Liberar reserva"
        detail={`${reservationToRelease?.ipAddress || ""} volvera a estar disponible para sugerencias IPAM.`}
        isOpen={Boolean(reservationToRelease)}
        onCancel={() => setReservationToRelease(null)}
        onConfirm={executeReleaseReservation}
        title="Liberar reserva IP"
        tone="danger"
      />
    </section>
  );
}

function buildSummaryCards(summary) {
  return [
    { label: "Segmentos", value: summary.totalSegments },
    { label: "Usadas", value: summary.usedIps },
    { label: "Reservas", value: summary.totalReservations },
    { label: "Libres", value: summary.freeEstimate },
    { label: "Solapes", value: summary.overlaps, tone: summary.overlaps > 0 ? "warn" : "ok" },
    { label: "Conflictos", value: summary.conflicts, tone: summary.conflicts > 0 ? "danger" : "ok" }
  ];
}

export default IpamCenter;
