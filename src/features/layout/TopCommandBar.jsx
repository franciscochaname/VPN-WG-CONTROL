import { CheckCircle2, DatabaseZap, GitBranch, Network, ShieldCheck, Wand2 } from "lucide-react";

function TopCommandBar({
  continuousMonitor,
  selectedRouter,
  onNavigate
}) {
  const hasRouter = Boolean(selectedRouter);
  const stages = [
    { label: "Backup", detail: "antes de cambios", icon: DatabaseZap },
    { label: "Inyeccion", detail: "solo por asistente", icon: Wand2 },
    { label: "Verificacion", detail: "lectura RouterOS", icon: CheckCircle2 },
    { label: "Monitoreo", detail: continuousMonitor?.enabled ? "continuo activo" : "en espera", icon: ShieldCheck }
  ];

  return (
    <section className="command-ribbon">
      <div className="command-ribbon-main">
        <div className="command-ribbon-icon">
          <Wand2 size={20} />
        </div>
        <div className="min-w-0">
          <p>Operacion segura RouterOS</p>
          <h2>{hasRouter ? selectedRouter.alias : "Sin router seleccionado"}</h2>
          <span>
            VPN, firewall, rutas y NAT se ejecutan desde asistentes con respaldo, logs y verificacion final.
          </span>
        </div>
      </div>

      <div className="command-ribbon-actions">
        <button className="primary-button" onClick={() => onNavigate(hasRouter ? "wireguard" : "routers")} type="button">
          <Network size={16} />
          {hasRouter ? "Crear VPN" : "Registrar router"}
        </button>
        <button className="action-button" onClick={() => onNavigate("firewall")} type="button">
          <ShieldCheck size={16} />
          Firewall
        </button>
        <button className="action-button" onClick={() => onNavigate("ipam")} type="button">
          <GitBranch size={16} />
          IPAM
        </button>
      </div>

      <div className="command-flow">
        {stages.map((stage) => (
          <StatusMetric detail={stage.detail} icon={stage.icon} key={stage.label} label={stage.label} />
        ))}
      </div>
    </section>
  );
}

function StatusMetric({ detail, icon: Icon, label }) {
  return (
    <article className="command-status-tile">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{detail}</strong>
    </article>
  );
}

export default TopCommandBar;
