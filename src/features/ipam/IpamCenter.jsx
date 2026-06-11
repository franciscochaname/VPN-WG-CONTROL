import { GitBranch, Network, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createIpSegment, listIpSegments, removeIpSegment, syncIpInventory } from "../../shared/api/ipamStore.js";

const initialForm = {
  label: "",
  cidr: "",
  gateway: "",
  interfaceName: "",
  purpose: "lan",
  vlanId: "",
  trunkName: ""
};

const purposeLabels = {
  lan: "LAN",
  wan: "WAN",
  vpn: "VPN",
  trunk: "Troncal",
  unknown: "Sin clasificar"
};

function IpamCenter({ selectedRouter }) {
  const [segments, setSegments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const selectedRouterId = selectedRouter?.id || null;
  const summary = useMemo(() => buildSummary(segments), [segments]);

  async function refreshSegments() {
    setIsLoading(true);
    try {
      setSegments(await listIpSegments(selectedRouterId));
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
      setSegments(result.segments || []);
      setMessage({
        type: "success",
        text: `Segmentos sincronizados. Interfaces: ${result.interfaces}, VLANs: ${result.vlans}, rutas: ${result.routes}.`
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo sincronizar segmentacion." });
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
      await refreshSegments();
      setMessage({ type: "success", text: "Segmento guardado en la planificacion local." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo guardar el segmento." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemove(segmentId) {
    await removeIpSegment(segmentId);
    await refreshSegments();
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    refreshSegments();
  }, [selectedRouterId]);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Segmentacion</p>
          <h2 className="mt-1 text-xl font-semibold">IPAM, VLANs y troncales</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Inventario de redes totales por router, origen real o planificado, para evitar solapes antes de crear VPN.
          </p>
        </div>
        <button className="action-button" disabled={busyAction === "sync"} onClick={handleSync} type="button">
          <RefreshCw size={16} />
          <span>{busyAction === "sync" ? "Sincronizando" : "Sincronizar IP"}</span>
        </button>
      </div>

      {message.text && (
        <div className={`form-message ${message.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {message.text}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {summary.map((item) => (
          <article className="segment-summary" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <form className="mb-5 rounded-lg border border-warm-line bg-[#fff9ef] p-4" onSubmit={handleCreate}>
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

      {isLoading ? (
        <div className="empty-panel">Cargando segmentos.</div>
      ) : segments.length === 0 ? (
        <div className="empty-panel">
          <Network size={24} />
          <h3>Sin segmentos registrados</h3>
          <p>Sincroniza un router o registra redes planificadas para controlar IP totales, VPN y troncales.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {segments.map((segment) => (
            <article className="segment-row" key={segment.id}>
              <div className="segment-icon">
                <GitBranch size={18} />
              </div>
              <div className="min-w-0">
                <p>{segment.label}</p>
                <span>{segment.cidr} · {segment.interfaceName || "sin interfaz"} · {segment.routerAlias || "global"}</span>
              </div>
              <span className={`segment-badge segment-badge-${segment.purpose}`}>{purposeLabels[segment.purpose] || segment.purpose}</span>
              <span className="segment-source">{segment.source === "routeros" ? "real" : "plan"}</span>
              <button className="icon-text-button icon-text-danger" onClick={() => handleRemove(segment.id)} type="button">
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function buildSummary(segments) {
  return [
    { label: "Total", value: segments.length },
    { label: "LAN", value: segments.filter((item) => item.purpose === "lan").length },
    { label: "VPN", value: segments.filter((item) => item.purpose === "vpn").length },
    { label: "Troncales", value: segments.filter((item) => item.purpose === "trunk").length },
    { label: "WAN", value: segments.filter((item) => item.purpose === "wan").length }
  ];
}

export default IpamCenter;
