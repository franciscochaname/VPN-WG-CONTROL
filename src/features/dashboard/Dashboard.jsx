import { KeyRound, Plus, TerminalSquare } from "lucide-react";
import MetricCard from "../../shared/ui/MetricCard.jsx";
import { stats } from "./dashboardData.js";
import TopologyMap from "./TopologyMap.jsx";

const actions = [
  { label: "Nuevo tunel", icon: Plus },
  { label: "Generar llaves", icon: KeyRound },
  { label: "Escuchar eventos", icon: TerminalSquare }
];

function Dashboard() {
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
            <p className="text-sm text-warm-muted">Trafico simulado listo para sustituir por telemetria real.</p>
          </div>
          <div className="flex gap-2">
            {actions.map((action) => (
              <button className="action-button" key={action.label} type="button">
                <action.icon size={16} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
        <TopologyMap />
      </div>
    </section>
  );
}

export default Dashboard;
