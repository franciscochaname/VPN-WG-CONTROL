import { LockKeyhole, Router, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { createRouter, isElectronPersistenceAvailable } from "../../shared/api/routerStore.js";

const initialForm = {
  alias: "",
  host: "",
  apiPort: "8728",
  webfigPort: "8443",
  username: "",
  authType: "token",
  secret: "",
  useTls: false,
  webfigTls: true,
  monitorWireGuard: true
};

function RouterRegistration({ onRouterCreated }) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: "idle", message: "" });

    try {
      await createRouter(form);
      setForm(initialForm);
      setStatus({ type: "success", message: "Router registrado. La conexion queda pendiente de validacion." });
      await onRouterCreated();
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo registrar el router." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Registro Mikrotik</p>
          <h2 className="mt-1 text-xl font-semibold">Agregar router para monitoreo</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Guarda datos reales del equipo. Los tuneles apareceran cuando se conecte la lectura WireGuard.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
          <Router size={24} />
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <label className="field-label">
            Nombre visible
            <input
              className="field-input"
              onChange={(event) => updateField("alias", event.target.value)}
              placeholder="Ej. Router sede central"
              required
              value={form.alias}
            />
          </label>

          <label className="field-label">
            IP o dominio
            <input
              className="field-input"
              onChange={(event) => updateField("host", event.target.value)}
              placeholder="Ej. 192.168.88.1"
              required
              value={form.host}
            />
          </label>

          <label className="field-label">
            Puerto API
            <input
              className="field-input"
              max="65535"
              min="1"
              onChange={(event) => updateField("apiPort", event.target.value)}
              required
              type="number"
              value={form.apiPort}
            />
          </label>

          <label className="field-label">
            Puerto WebFig
            <input
              className="field-input"
              max="65535"
              min="1"
              onChange={(event) => updateField("webfigPort", event.target.value)}
              required
              type="number"
              value={form.webfigPort}
            />
          </label>

          <label className="field-label">
            Usuario API
            <input
              className="field-input"
              autoComplete="username"
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="Usuario autorizado"
              required
              value={form.username}
            />
          </label>
        </div>

        <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-4">
          <div className="mb-4 flex items-center gap-2">
            <LockKeyhole size={18} className="text-warm-copper" />
            <h3 className="font-semibold">Acceso del router</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
            <label className="field-label">
              Tipo
              <select
                className="field-input"
                onChange={(event) => updateField("authType", event.target.value)}
                value={form.authType}
              >
                <option value="token">Token API</option>
                <option value="password">Clave</option>
              </select>
            </label>

            <label className="field-label">
              {form.authType === "token" ? "Token API" : "Clave de acceso"}
              <input
                className="field-input"
                autoComplete="current-password"
                onChange={(event) => updateField("secret", event.target.value)}
                placeholder="Se cifra localmente en el equipo"
                required
                type="password"
                value={form.secret}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <label className="toggle-row">
            <input
              checked={form.useTls}
              onChange={(event) => updateField("useTls", event.target.checked)}
              type="checkbox"
            />
            <span>Usar API TLS si el router lo tiene habilitado</span>
          </label>

          <label className="toggle-row">
            <input
              checked={form.webfigTls}
              onChange={(event) => updateField("webfigTls", event.target.checked)}
              type="checkbox"
            />
            <span>WebFig usa HTTPS</span>
          </label>

          <label className="toggle-row">
            <input
              checked={form.monitorWireGuard}
              onChange={(event) => updateField("monitorWireGuard", event.target.checked)}
              type="checkbox"
            />
            <span>Preparar monitoreo WireGuard para este router</span>
          </label>
        </div>

        {!isElectronPersistenceAvailable() && (
          <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-3 text-sm text-warm-muted">
            Vista web de desarrollo: los registros viven solo en memoria. En Electron se guardan en SQLite con secreto cifrado.
          </div>
        )}

        {status.message && (
          <div className={`form-message ${status.type === "error" ? "form-message-error" : "form-message-success"}`}>
            {status.message}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-warm-line pt-4">
          <div className="flex items-center gap-2 text-sm text-warm-muted">
            <ShieldCheck size={16} />
            <span>El secreto no se muestra ni se devuelve al frontend.</span>
          </div>
          <button className="primary-button" disabled={isSaving} type="submit">
            <Save size={16} />
            {isSaving ? "Guardando" : "Guardar router"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default RouterRegistration;
