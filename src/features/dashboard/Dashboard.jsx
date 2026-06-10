import { Bell, Clock3, Network, Plus, Router } from "lucide-react";
import MetricCard from "../../shared/ui/MetricCard.jsx";
import TopologyMap from "./TopologyMap.jsx";

function buildStats(metrics) {
  return [
    { label: "Routers registrados", value: String(metrics.routers), trend: metrics.routers > 0 ? "local" : "sin registros", icon: Router },
    { label: "Tuneles detectados", value: String(metrics.tunnels), trend: "WireGuard", icon: Network },
    { label: "Eventos guardados", value: String(metrics.events), trend: "syslog/webhook", icon: Bell },
    { label: "Conexiones pendientes", value: String(metrics.pendingConnections), trend: "por validar", icon: Clock3 }
  ];
}

function Dashboard({ isLoading, metrics, routers, selectedRouter, onOpenRouterRegistration }) {
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
            <h2 className="text-lg font-semibold">Mapa operativo</h2>
            <p className="text-sm text-warm-muted">
              {routers.length > 0
                ? "Visualizacion basada solo en routers registrados."
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
        <TopologyMap isLoading={isLoading} routers={routers} selectedRouter={selectedRouter} />
      </div>
    </section>
  );
}

export default Dashboard;
