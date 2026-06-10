import { Database, EyeOff, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getSecurityHealth } from "../../shared/api/securityStore.js";

function SecurityCenter() {
  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshHealth() {
    setIsLoading(true);
    try {
      setHealth(await getSecurityHealth());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Seguridad local</p>
          <h2 className="mt-1 text-xl font-semibold">Cifrado y arquitectura</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Verificacion ejecutada desde Electron sobre la base local y el puente IPC.
          </p>
        </div>
        <button className="action-button" disabled={isLoading} onClick={refreshHealth} type="button">
          <RefreshCw size={16} />
          <span>{isLoading ? "Verificando" : "Verificar"}</span>
        </button>
      </div>

      {!health ? (
        <div className="empty-panel">Cargando verificacion de seguridad.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SecurityCard
            icon={LockKeyhole}
            label="Cifrado del sistema"
            status={health.encryptionAvailable && health.canEncryptDecrypt ? "Correcto" : "Revisar"}
            detail={health.encryptionError || "safeStorage cifra y descifra correctamente una muestra temporal."}
            ok={health.encryptionAvailable && health.canEncryptDecrypt}
          />
          <SecurityCard
            icon={EyeOff}
            label="Exposicion de secretos"
            status={health.secretsExposedToRenderer ? "Revisar" : "Protegido"}
            detail="El frontend recibe metadatos del router, no recibe token, clave ni secreto cifrado."
            ok={!health.secretsExposedToRenderer}
          />
          <SecurityCard
            icon={Database}
            label="Credenciales persistidas"
            status={`${health.encryptedCredentialCount}/${health.credentialCount}`}
            detail="Registros con campo de credencial cifrada en SQLite."
            ok={health.credentialCount === health.encryptedCredentialCount}
          />
          <SecurityCard
            icon={ShieldCheck}
            label="Aislamiento Electron"
            status={health.contextIsolation && !health.nodeIntegration ? "Activo" : "Revisar"}
            detail="contextIsolation activo y nodeIntegration deshabilitado en el renderer."
            ok={health.contextIsolation && !health.nodeIntegration}
          />
          <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-4 xl:col-span-2">
            <p className="text-sm font-semibold">Base local</p>
            <p className="mt-2 break-all text-sm text-warm-muted">{health.databasePath}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function SecurityCard({ icon: Icon, label, status, detail, ok }) {
  return (
    <article className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
            <Icon size={18} />
          </span>
          <p className="font-semibold">{label}</p>
        </div>
        <span className={`security-badge ${ok ? "security-badge-ok" : "security-badge-warn"}`}>{status}</span>
      </div>
      <p className="text-sm leading-6 text-warm-muted">{detail}</p>
    </article>
  );
}

export default SecurityCenter;
