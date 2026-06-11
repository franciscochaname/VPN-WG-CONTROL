import { Flame, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyFirewallPreset, listFirewall, syncFirewall } from "../../shared/api/firewallStore.js";

const initialPreset = {
  preset: "allow-api",
  srcAddress: "",
  wireGuardPort: "13231"
};

const presetLabels = {
  "allow-api": "Permitir API de gestion",
  "allow-wireguard": "Permitir WireGuard UDP",
  "allow-forward-established": "Permitir forward establecido"
};

function FirewallCenter({ selectedRouter }) {
  const [rules, setRules] = useState([]);
  const [findings, setFindings] = useState([]);
  const [presetForm, setPresetForm] = useState(initialPreset);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [message, setMessage] = useState({ type: "idle", text: "" });

  const selectedRouterId = selectedRouter?.id || null;
  const visibleRules = useMemo(() => rules.filter((rule) => rule.tableName === "filter"), [rules]);
  const natRules = useMemo(() => rules.filter((rule) => rule.tableName === "nat"), [rules]);

  async function refreshLocalFirewall() {
    setIsLoading(true);
    try {
      const result = await listFirewall(selectedRouterId);
      setRules(result.rules);
      setFindings(result.findings);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSync() {
    if (!selectedRouter) {
      setMessage({ type: "error", text: "Selecciona o registra un router antes de sincronizar firewall." });
      return;
    }

    setBusyAction("sync");
    setMessage({ type: "idle", text: "" });

    try {
      const result = await syncFirewall(selectedRouter.id);
      setRules(result.rules);
      setFindings(result.findings);
      setMessage({ type: "success", text: "Firewall sincronizado desde RouterOS." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo sincronizar firewall." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyPreset(event) {
    event.preventDefault();

    if (!selectedRouter) {
      setMessage({ type: "error", text: "Selecciona o registra un router antes de aplicar reglas." });
      return;
    }

    setBusyAction("preset");
    setMessage({ type: "idle", text: "" });

    try {
      const result = await applyFirewallPreset({
        routerId: selectedRouter.id,
        ...presetForm
      });
      setRules(result.rules);
      setFindings(result.findings);
      setMessage({ type: "success", text: "Regla aplicada y firewall sincronizado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo aplicar la regla." });
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    refreshLocalFirewall();
  }, [selectedRouterId]);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Firewall Mikrotik</p>
          <h2 className="mt-1 text-xl font-semibold">Reglas y bloqueo de tuneles</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Sincroniza reglas reales y revisa si input/forward/NAT puede limitar la VPN.
          </p>
        </div>
        <button className="action-button" disabled={busyAction === "sync"} onClick={handleSync} type="button">
          <RefreshCw size={16} />
          <span>{busyAction === "sync" ? "Sincronizando" : "Sincronizar"}</span>
        </button>
      </div>

      {message.text && (
        <div className={`form-message ${message.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {message.text}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Diagnostico de interferencias</h3>
          </div>
          {isLoading ? (
            <p className="text-sm text-warm-muted">Cargando reglas guardadas.</p>
          ) : findings.length === 0 ? (
            <p className="text-sm text-warm-muted">Sin reglas sincronizadas. Usa sincronizar para leer el firewall real.</p>
          ) : (
            <div className="grid gap-3">
              {findings.map((finding) => (
                <FindingCard finding={finding} key={`${finding.title}-${finding.detail}`} />
              ))}
            </div>
          )}
        </div>

        <form className="rounded-lg border border-warm-line bg-[#fff9ef] p-4" onSubmit={handleApplyPreset}>
          <div className="mb-3 flex items-center gap-2">
            <Flame size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Aplicar regla facil</h3>
          </div>
          <div className="space-y-3">
            <label className="field-label">
              Preset
              <select
                className="field-input"
                onChange={(event) => setPresetForm((current) => ({ ...current, preset: event.target.value }))}
                value={presetForm.preset}
              >
                {Object.entries(presetLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Origen permitido
              <input
                className="field-input"
                onChange={(event) => setPresetForm((current) => ({ ...current, srcAddress: event.target.value }))}
                placeholder="Opcional, ej. 192.168.216.13/32"
                value={presetForm.srcAddress}
              />
            </label>
            {presetForm.preset === "allow-wireguard" && (
              <label className="field-label">
                Puerto WireGuard UDP
                <input
                  className="field-input"
                  max="65535"
                  min="1"
                  onChange={(event) => setPresetForm((current) => ({ ...current, wireGuardPort: event.target.value }))}
                  type="number"
                  value={presetForm.wireGuardPort}
                />
              </label>
            )}
            <button className="primary-button w-full" disabled={busyAction === "preset"} type="submit">
              <ShieldCheck size={16} />
              {busyAction === "preset" ? "Aplicando" : "Aplicar regla"}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile label="Filter" value={String(visibleRules.length)} />
        <SummaryTile label="NAT" value={String(natRules.length)} />
        <SummaryTile label="Hallazgos" value={String(findings.length)} />
      </div>

      {rules.length === 0 ? (
        <div className="empty-panel">
          <Flame size={24} />
          <h3>Sin reglas firewall sincronizadas</h3>
          <p>Cuando la API RouterOS este accesible, sincroniza para analizar reglas input, forward y NAT reales.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-warm-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tabla</th>
                <th>#</th>
                <th>Chain</th>
                <th>Action</th>
                <th>Proto/Port</th>
                <th>Origen/Destino</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.tableName}</td>
                  <td>{rule.orderIndex + 1}</td>
                  <td>{rule.chain || "Sin dato"}</td>
                  <td>
                    <span className={`inline-status ${rule.action === "drop" || rule.action === "reject" ? "inline-status-warn" : ""}`}>
                      {rule.disabled ? "disabled" : rule.action || "Sin dato"}
                    </span>
                  </td>
                  <td>{[rule.protocol, rule.dstPort].filter(Boolean).join(" / ") || "Sin dato"}</td>
                  <td>
                    <b>{rule.srcAddress || "any"}</b>
                    <span>{rule.dstAddress || "any"}</span>
                  </td>
                  <td>{rule.comment || "Sin comentario"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FindingCard({ finding }) {
  return (
    <article className={`finding-card finding-card-${finding.severity}`}>
      <p className="font-semibold">{finding.title}</p>
      <p className="mt-1 text-sm leading-6">{finding.detail}</p>
    </article>
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

export default FirewallCenter;
