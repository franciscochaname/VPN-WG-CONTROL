import { Archive, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBackup, listBackups, rollbackBackup } from "../../shared/api/backupStore.js";
import ConfirmDialog from "../../shared/ui/ConfirmDialog.jsx";

const statusLabels = {
  ready: "listo",
  rolled_back: "revertido",
  failed: "fallido"
};

function BackupCenter({ selectedRouter, onWorkspaceRefresh, onNotify }) {
  const [backups, setBackups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const selectedRouterId = selectedRouter?.id || null;
  const summary = useMemo(() => buildSummary(backups), [backups]);

  async function refreshBackups() {
    setIsLoading(true);
    try {
      setBackups(await listBackups(selectedRouterId));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateBackup() {
    if (!selectedRouter) {
      onNotify?.({
        type: "warning",
        title: "Router requerido",
        detail: "Selecciona un router para crear un respaldo."
      });
      return;
    }

    setBusyAction("backup");

    try {
      await createBackup({
        routerId: selectedRouter.id,
        reason: "Respaldo manual antes de cambios"
      });
      await refreshBackups();
      onNotify?.({
        type: "success",
        title: "Respaldo creado",
        detail: "WireGuard, firewall, NAT y rutas quedaron guardados como snapshot."
      });
    } catch (error) {
      onNotify?.({
        type: "error",
        title: "No se pudo crear respaldo",
        detail: error.message || "El router no permitio leer el estado actual."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function executeRollback() {
    if (!rollbackTarget) {
      return;
    }

    setBusyAction("rollback");

    try {
      const result = await rollbackBackup(rollbackTarget.id);
      setRollbackTarget(null);
      await refreshBackups();
      await onWorkspaceRefresh?.({ silent: true });
      onNotify?.({
        type: "success",
        title: "Rollback aplicado",
        detail: formatRollbackSummary(result.summary)
      });
    } catch (error) {
      onNotify?.({
        type: "error",
        title: "Rollback fallido",
        detail: error.message || "No se pudo revertir el respaldo."
      });
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    refreshBackups();
  }, [selectedRouterId]);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Respaldos</p>
          <h2 className="mt-1 text-xl font-semibold">Backup y rollback</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Guarda snapshots antes de cambios y revierte objetos creados por la app: peers, reglas, NAT y rutas.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="action-button" onClick={refreshBackups} type="button">
            <RefreshCw size={16} />
            <span>Actualizar</span>
          </button>
          <button className="primary-button" disabled={busyAction === "backup" || !selectedRouter} onClick={handleCreateBackup} type="button">
            <Archive size={16} />
            {busyAction === "backup" ? "Creando" : "Crear respaldo"}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile label="Respaldos" value={String(summary.total)} />
        <SummaryTile label="Listos" value={String(summary.ready)} />
        <SummaryTile label="Revertidos" value={String(summary.rolledBack)} />
      </div>

      {isLoading ? (
        <div className="empty-panel">Cargando respaldos.</div>
      ) : backups.length === 0 ? (
        <div className="empty-panel">
          <Archive size={24} />
          <h3>Sin respaldos guardados</h3>
          <p>La app creara respaldos automaticamente antes de orquestar VPN o aplicar firewall. Tambien puedes crear uno manual.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {backups.map((backup) => (
            <article className="backup-row" key={backup.id}>
              <div className="backup-icon">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p>{backup.reason}</p>
                <span>{backup.routerAlias} - {formatDateTime(backup.createdAt)} - {backup.operationKey}</span>
              </div>
              <span className={`backup-status backup-status-${backup.status}`}>{statusLabels[backup.status] || backup.status}</span>
              <button
                className="icon-text-button"
                disabled={backup.status !== "ready"}
                onClick={() => setRollbackTarget(backup)}
                type="button"
              >
                <RotateCcw size={15} />
                Revertir
              </button>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Ejecutar rollback"
        detail={`Se quitaran del router los objetos nuevos creados por la app despues del respaldo "${rollbackTarget?.reason || ""}". No restaura configuracion binaria completa.`}
        isBusy={busyAction === "rollback"}
        isOpen={Boolean(rollbackTarget)}
        onCancel={() => setRollbackTarget(null)}
        onConfirm={executeRollback}
        title="Confirmar rollback selectivo"
        tone="danger"
      />
    </section>
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

function buildSummary(backups) {
  return {
    total: backups.length,
    ready: backups.filter((backup) => backup.status === "ready").length,
    rolledBack: backups.filter((backup) => backup.status === "rolled_back").length
  };
}

function formatRollbackSummary(summary = {}) {
  const total =
    Number(summary.firewallFilterRemoved || 0) +
    Number(summary.firewallNatRemoved || 0) +
    Number(summary.wireGuardPeersRemoved || 0) +
    Number(summary.routesRemoved || 0);

  return `${total} objeto(s) revertidos: peers ${summary.wireGuardPeersRemoved || 0}, firewall ${summary.firewallFilterRemoved || 0}, NAT ${summary.firewallNatRemoved || 0}, rutas ${summary.routesRemoved || 0}.`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default BackupCenter;
