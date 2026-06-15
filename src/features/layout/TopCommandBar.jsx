import { CheckCircle2, DatabaseZap, RotateCcw, ShieldCheck, Wand2 } from "lucide-react";

function TopCommandBar({
  selectedRouter
}) {
  const hasRouter = Boolean(selectedRouter);
  const stages = [
    { label: "Backup", detail: "antes de cambios", icon: DatabaseZap },
    { label: "Aplicacion", detail: "asistida", icon: Wand2 },
    { label: "Verificacion", detail: "lectura RouterOS", icon: CheckCircle2 },
    { label: "Rollback", detail: "si falla", icon: RotateCcw }
  ];

  return (
    <section className="command-ribbon">
      <div className="command-ribbon-main">
        <div className="command-ribbon-icon">
          <ShieldCheck size={20} />
        </div>
        <div className="min-w-0">
          <p>Operacion segura RouterOS</p>
          <h2>Flujo protegido de cambios</h2>
          <span>
            {hasRouter
              ? `${selectedRouter.alias}: VPN, firewall, rutas y NAT se aplican con respaldo y verificacion.`
              : "Selecciona o registra un router para habilitar orquestacion controlada."}
          </span>
        </div>
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
