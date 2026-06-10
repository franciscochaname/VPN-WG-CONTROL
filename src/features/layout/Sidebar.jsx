import { navigationItems } from "../dashboard/dashboardData.js";

function Sidebar() {
  return (
    <aside className="rounded-lg border border-warm-line bg-warm-panel/82 p-3 shadow-soft backdrop-blur">
      <div className="mb-4 rounded-lg bg-[#f3eadc] p-3">
        <p className="text-sm font-semibold">Despliegue por fases</p>
        <p className="mt-1 text-xs leading-5 text-warm-muted">
          Base visual lista para conectar SQLite, API Mikrotik y escucha pasiva sin reordenar el proyecto.
        </p>
      </div>
      <nav className="space-y-1">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            className={`nav-item ${item.active ? "nav-item-active" : ""}`}
            type="button"
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
