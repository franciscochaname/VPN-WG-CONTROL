import { Activity, BrainCircuit, Clock3, DatabaseZap, Gauge, Network, Plus, RefreshCw, Router } from "lucide-react";
import { useState } from "react";
import MetricCard from "../../shared/ui/MetricCard.jsx";
import TopologyMap from "./TopologyMap.jsx";

function buildStats(metrics) {
  return [
    {
      label: "Routers registrados",
      value: String(metrics.routers),
      trend: metrics.onlineRouters > 0 ? `${metrics.onlineRouters} online` : "sin online",
      icon: Router
    },
    { label: "Tuneles detectados", value: String(metrics.tunnels), trend: "lectura real", icon: Network },
    {
      label: "Trafico total",
      value: formatBytes((metrics.totalRxBytes || 0) + (metrics.totalTxBytes || 0)),
      trend: `${formatRate(metrics.throughputBps || 0)}/s`,
      icon: Gauge
    },
    {
      label: "Pendientes/offline",
      value: String(metrics.pendingConnections + metrics.offlineRouters),
      trend: "por revisar",
      icon: Clock3
    }
  ];
}

function Dashboard({
  isLoading,
  metrics,
  monitoring,
  routers,
  tunnels,
  selectedRouter,
  onOpenRouterRegistration,
  onSyncSelectedRouter
}) {
  const stats = buildStats(metrics);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSyncSelectedRouter() {
    if (!onSyncSelectedRouter) {
      setSyncMessage("Selecciona o registra un router para leer telemetria real.");
      return;
    }

    setIsSyncing(true);
    setSyncMessage("");

    try {
      await onSyncSelectedRouter();
      setSyncMessage("Lectura WireGuard guardada como nueva muestra real.");
    } catch (error) {
      setSyncMessage(error.message || "No se pudo leer WireGuard desde el router.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <MetricCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Monitoreo vivo</p>
              <h2 className="mt-1 text-lg font-semibold">Telemetria WireGuard</h2>
              <p className="mt-1 text-sm text-warm-muted">
                Actualizacion local cada 10 segundos; cada sincronizacion guarda muestras reales para baseline.
              </p>
            </div>
            <button className="action-button" disabled={isSyncing || !selectedRouter} onClick={handleSyncSelectedRouter} type="button">
              <RefreshCw className={isSyncing ? "animate-spin" : ""} size={16} />
              <span>{isSyncing ? "Leyendo" : "Leer router"}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TelemetryTile icon={DatabaseZap} label="RX real" value={formatBytes(monitoring.totalRxBytes || 0)} />
            <TelemetryTile icon={Activity} label="TX real" value={formatBytes(monitoring.totalTxBytes || 0)} />
            <TelemetryTile icon={Gauge} label="Tasa estimada" value={`${formatRate(monitoring.throughputBps || 0)}/s`} />
            <TelemetryTile icon={Clock3} label="Muestras" value={String(monitoring.sampleCount || 0)} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="monitor-strip">
              <span>Peers con handshake</span>
              <strong>
                {monitoring.activeTunnels || 0}/{tunnels.length}
              </strong>
            </div>
            <div className="monitor-strip">
              <span>Ultima muestra</span>
              <strong>{formatDateTime(monitoring.latestSampleAt)}</strong>
            </div>
          </div>

          {syncMessage && <div className="mt-4 rounded-lg bg-[#fff9ef] px-3 py-2 text-sm font-semibold text-warm-muted">{syncMessage}</div>}
        </section>

        <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Motor inteligente local</p>
              <h2 className="mt-1 text-lg font-semibold">Baseline y anomalias</h2>
            </div>
            <span className={`ai-mode ai-mode-${monitoring.mode || "training"}`}>
              <BrainCircuit size={15} />
              {monitoring.mode === "baseline" ? "baseline" : "entrenando"}
            </span>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-warm-muted">
              <span>Confianza local</span>
              <span>{monitoring.confidence || 0}%</span>
            </div>
            <div className="confidence-track">
              <span style={{ width: `${Math.max(0, Math.min(100, monitoring.confidence || 0))}%` }} />
            </div>
          </div>

          <div className="grid gap-3">
            {(monitoring.findings || []).slice(0, 4).map((finding) => (
              <InsightRow finding={finding} key={`${finding.title}-${finding.detail}`} />
            ))}
          </div>
        </section>
      </div>

      <div className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Monitor de topologia</h2>
            <p className="text-sm text-warm-muted">
              {routers.length > 0
                ? "Lienzo de red basado en routers y peers WireGuard reales."
                : "Registra un router Mikrotik para iniciar el monitoreo."}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="action-button" onClick={onOpenRouterRegistration} type="button">
              <Plus size={16} />
              <span>Registrar router</span>
            </button>
          </div>
        </div>
        <TopologyMap isLoading={isLoading} routers={routers} tunnels={tunnels} selectedRouter={selectedRouter} />
      </div>
    </section>
  );
}

function TelemetryTile({ icon: Icon, label, value }) {
  return (
    <article className="telemetry-tile">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InsightRow({ finding }) {
  return (
    <article className={`insight-row insight-row-${finding.severity}`}>
      <div>
        <p>{finding.title}</p>
        <span>{finding.detail}</span>
      </div>
    </article>
  );
}

function formatBytes(value) {
  const number = Number(value || 0);

  if (number < 1024) {
    return `${number} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let current = number / 1024;
  let index = 0;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatRate(value) {
  return formatBytes(value);
}

function formatDateTime(value) {
  if (!value) {
    return "Sin muestra";
  }

  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export default Dashboard;
