import { AlertTriangle, Flame, Gauge, ListFilter, RefreshCw, ShieldAlert, ShieldCheck, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyFirewallPreset, listFirewall, syncFirewall } from "../../shared/api/firewallStore.js";
import ConfirmDialog from "../../shared/ui/ConfirmDialog.jsx";

const initialPreset = {
  preset: "allow-api",
  srcAddress: "",
  wireGuardPort: "13231"
};

const presetLabels = {
  "allow-api": "Permitir API de gestion",
  "allow-webfig": "Permitir WebFig",
  "allow-wireguard": "Permitir WireGuard UDP",
  "allow-forward-peer": "Permitir forward de peer",
  "allow-forward-established": "Permitir forward establecido"
};

const chainFilters = ["todo", "input", "forward", "nat"];

function FirewallCenter({ selectedRouter, onNotify }) {
  const [rules, setRules] = useState([]);
  const [findings, setFindings] = useState([]);
  const [presetForm, setPresetForm] = useState(initialPreset);
  const [chainFilter, setChainFilter] = useState("todo");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [confirmPresetOpen, setConfirmPresetOpen] = useState(false);

  const selectedRouterId = selectedRouter?.id || null;
  const visibleRules = useMemo(() => rules.filter((rule) => rule.tableName === "filter"), [rules]);
  const natRules = useMemo(() => rules.filter((rule) => rule.tableName === "nat"), [rules]);
  const displayedRules = useMemo(() => {
    if (chainFilter === "todo") {
      return rules;
    }

    if (chainFilter === "nat") {
      return rules.filter((rule) => rule.tableName === "nat");
    }

    return rules.filter((rule) => rule.chain === chainFilter);
  }, [chainFilter, rules]);
  const firewallInsight = useMemo(() => buildFirewallInsight(rules, findings), [rules, findings]);

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
      onNotify?.({
        type: "success",
        title: "Firewall sincronizado",
        detail: "Reglas filter/NAT y hallazgos quedaron actualizados."
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo sincronizar firewall." });
      onNotify?.({
        type: "error",
        title: "Firewall no sincronizado",
        detail: error.message || "No se pudo sincronizar firewall."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyPreset(event) {
    event.preventDefault();

    if (!selectedRouter) {
      setMessage({ type: "error", text: "Selecciona o registra un router antes de aplicar reglas." });
      onNotify?.({
        type: "warning",
        title: "Router requerido",
        detail: "Selecciona un router antes de aplicar una regla."
      });
      return;
    }

    setConfirmPresetOpen(true);
  }

  async function executeApplyPreset() {
    if (!selectedRouter) {
      return;
    }

    setBusyAction("preset");
    setConfirmPresetOpen(false);
    setMessage({ type: "idle", text: "" });

    try {
      const result = await applyFirewallPreset({
        routerId: selectedRouter.id,
        ...presetForm
      });
      setRules(result.rules);
      setFindings(result.findings);
      setMessage({ type: "success", text: "Regla aplicada y firewall sincronizado." });
      onNotify?.({
        type: "success",
        title: "Regla aplicada",
        detail: `${presetLabels[presetForm.preset]} quedo sincronizada con el router.`
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "No se pudo aplicar la regla." });
      onNotify?.({
        type: "error",
        title: "No se pudo aplicar firewall",
        detail: error.message || "La regla no fue aplicada."
      });
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
                placeholder={presetForm.preset === "allow-forward-peer" ? "Allowed address del peer" : "Opcional, ej. 192.168.216.13/32"}
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

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <section className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Gauge size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Riesgo firewall</h3>
          </div>
          <div className={`risk-meter risk-meter-${firewallInsight.level}`}>
            <strong>{firewallInsight.score}</strong>
            <span>{firewallInsight.label}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-warm-muted">{firewallInsight.summary}</p>
        </section>

        <section className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wand2 size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Acciones sugeridas</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {firewallInsight.actions.map((action) => (
              <article className="recommendation-card" key={action.title}>
                <AlertTriangle size={16} />
                <div>
                  <p>{action.title}</p>
                  <span>{action.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile label="Filter" value={String(visibleRules.length)} />
        <SummaryTile label="NAT" value={String(natRules.length)} />
        <SummaryTile label="Hallazgos" value={String(findings.length)} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {firewallInsight.chains.map((chain) => (
          <ChainTile chain={chain} key={chain.label} />
        ))}
      </div>

      {rules.length === 0 ? (
        <div className="empty-panel">
          <Flame size={24} />
          <h3>Sin reglas firewall sincronizadas</h3>
          <p>Cuando la API RouterOS este accesible, sincroniza para analizar reglas input, forward y NAT reales.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-warm-line">
          <div className="table-toolbar">
            <div className="flex items-center gap-2 text-sm font-semibold text-warm-muted">
              <ListFilter size={16} />
              Reglas visibles
            </div>
            <div className="filter-tabs">
              {chainFilters.map((filter) => (
                <button
                  className={chainFilter === filter ? "filter-tab filter-tab-active" : "filter-tab"}
                  key={filter}
                  onClick={() => setChainFilter(filter)}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tabla</th>
                <th>#</th>
                <th>Chain</th>
                <th>Action</th>
                <th>Proto/Port/State</th>
                <th>Origen/Destino</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {displayedRules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.tableName}</td>
                  <td>{rule.orderIndex + 1}</td>
                  <td>{rule.chain || "Sin dato"}</td>
                  <td>
                    <span className={`inline-status ${rule.action === "drop" || rule.action === "reject" ? "inline-status-warn" : ""}`}>
                      {rule.disabled ? "disabled" : rule.action || "Sin dato"}
                    </span>
                  </td>
                  <td>{[rule.protocol, rule.dstPort, rule.connectionState].filter(Boolean).join(" / ") || "Sin dato"}</td>
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

      <ConfirmDialog
        confirmLabel="Aplicar regla"
        detail={`${presetLabels[presetForm.preset]} se enviara al router ${selectedRouter?.alias || "seleccionado"} y luego se sincronizara el firewall.`}
        isBusy={busyAction === "preset"}
        isOpen={confirmPresetOpen}
        onCancel={() => setConfirmPresetOpen(false)}
        onConfirm={executeApplyPreset}
        title="Confirmar cambio de firewall"
      />
    </section>
  );
}

function buildFirewallInsight(rules, findings) {
  const activeRules = rules.filter((rule) => !rule.disabled);
  const dropRules = activeRules.filter((rule) => rule.action === "drop" || rule.action === "reject");
  const warningFindings = findings.filter((finding) => finding.severity === "warning" || finding.severity === "error");
  const score = Math.min(100, warningFindings.length * 28 + dropRules.length * 4 + rules.filter((rule) => rule.disabled).length * 2);
  const level = score >= 70 ? "high" : score >= 35 ? "medium" : "low";
  const chains = ["input", "forward", "output", "nat"].map((chain) => {
    const chainRules = chain === "nat" ? rules.filter((rule) => rule.tableName === "nat") : rules.filter((rule) => rule.chain === chain);

    return {
      label: chain,
      total: chainRules.length,
      accept: chainRules.filter((rule) => rule.action === "accept").length,
      drop: chainRules.filter((rule) => rule.action === "drop" || rule.action === "reject").length,
      disabled: chainRules.filter((rule) => rule.disabled).length
    };
  });
  const actions = warningFindings.length > 0
    ? warningFindings.map((finding) => ({
        title: finding.title,
        detail: finding.detail
      }))
    : [
        {
          title: "Mantener orden de reglas",
          detail: "Las reglas allow para API, WireGuard y forward deben quedar antes de drops generales."
        },
        {
          title: "Sincronizar despues de cambios",
          detail: "Cada preset aplicado vuelve a leer RouterOS para verificar el estado real."
        }
      ];

  return {
    score,
    level,
    label: level === "high" ? "alto" : level === "medium" ? "medio" : "bajo",
    summary:
      rules.length === 0
        ? "Sin reglas reales sincronizadas todavia. La puntuacion se calculara despues de leer RouterOS."
        : `${dropRules.length} regla(s) drop/reject activas y ${warningFindings.length} hallazgo(s) pueden afectar administracion o tuneles.`,
    actions: actions.slice(0, 4),
    chains
  };
}

function ChainTile({ chain }) {
  return (
    <article className="chain-tile">
      <div className="flex items-center justify-between gap-2">
        <p>{chain.label}</p>
        <strong>{chain.total}</strong>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
        <span className="chain-pill chain-pill-ok">{chain.accept} allow</span>
        <span className="chain-pill chain-pill-warn">{chain.drop} drop</span>
        <span className="chain-pill">{chain.disabled} off</span>
      </div>
    </article>
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
