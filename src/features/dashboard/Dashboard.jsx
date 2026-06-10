import { Bell, Clock3, Network, Plus, Router } from "lucide-react";
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
    { label: "Eventos guardados", value: String(metrics.events), trend: "syslog/webhook", icon: Bell },
    {
      label: "Pendientes/offline",
      value: String(metrics.pendingConnections + metrics.offlineRouters),
      trend: "por revisar",
      icon: Clock3
    }
  ];
}

function Dashboard({ isLoading, metrics, routers, tunnels, selectedRouter, onOpenRouterRegistration }) {
  const stats = buildStats(metrics);

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <MetricCard key={stat.label} {...stat} />
        ))}
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

export default Dashboard;
