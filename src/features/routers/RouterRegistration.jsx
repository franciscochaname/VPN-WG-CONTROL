import { CheckCircle2, Clipboard, KeyRound, Router, Save, ServerCog, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
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
  monitorWireGuard: true,
  allowedManagementIp: "",
  wireGuardPort: "13231",
  enableSyslogGuide: true,
  enableWebfigGuide: true
};

const steps = [
  { id: "identity", label: "Equipo", icon: Router },
  { id: "access", label: "Acceso", icon: KeyRound },
  { id: "guide", label: "Guia RouterOS", icon: ServerCog }
];

function RouterRegistration({ onRouterCreated, onNotify }) {
  const [form, setForm] = useState(initialForm);
  const [activeStep, setActiveStep] = useState("identity");
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);
  const validation = useMemo(() => validateForm(form), [form]);
  const commands = useMemo(() => buildRouterOsCommands(form), [form]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validation.canSave) {
      const message = validation.errors[0] || "Revisa los datos del router.";
      setStatus({ type: "error", message });
      onNotify?.({
        type: "warning",
        title: "Router incompleto",
        detail: message
      });
      return;
    }

    setIsSaving(true);
    setStatus({ type: "idle", message: "" });

    try {
      const router = await createRouter(form);
      setForm(initialForm);
      setActiveStep("identity");
      setStatus({ type: "success", message: `${router.alias} registrado. Valida conexion y servicios desde el panel lateral.` });
      onNotify?.({
        type: "success",
        title: "Router registrado",
        detail: `${router.alias} ya esta en el inventario local.`
      });
      await onRouterCreated?.();
    } catch (error) {
      const message = error.message || "No se pudo registrar el router.";
      setStatus({ type: "error", message });
      onNotify?.({
        type: "error",
        title: "Registro detenido",
        detail: message
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function copyCommands() {
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setStatus({ type: "success", message: "Comandos copiados. Revisa antes de pegarlos en RouterOS." });
      onNotify?.({
        type: "success",
        title: "Guia copiada",
        detail: "Los comandos RouterOS quedaron en el portapapeles."
      });
    } catch (error) {
      const message = error.message || "No se pudo copiar la guia RouterOS.";
      setStatus({ type: "error", message });
      onNotify?.({
        type: "error",
        title: "Copia fallida",
        detail: message
      });
    }
  }

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Registro Mikrotik</p>
          <h2 className="mt-1 text-xl font-semibold">Asistente de router y monitoreo</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Registra el equipo, valida acceso y genera una guia RouterOS coherente para API, eventos y WireGuard.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
          <Router size={24} />
        </div>
      </div>

      <form className="router-wizard" onSubmit={handleSubmit}>
        <div className="router-stepper">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                className={activeStep === step.id ? "router-step-tab router-step-tab-active" : "router-step-tab"}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <Icon size={16} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </div>

        {activeStep === "identity" && (
          <section className="router-step-panel">
            <div className="wizard-step-head">
              <span>1</span>
              <div>
                <h4>Identidad del equipo</h4>
                <p>Solo datos necesarios para localizar el router y su WebFig.</p>
              </div>
            </div>

            <div className="smart-field-grid">
              <ValidatedField error={validation.fieldErrors.alias} label="Nombre visible">
                <input
                  className="field-input"
                  onChange={(event) => updateField("alias", event.target.value)}
                  placeholder="Ej. Router sede central"
                  value={form.alias}
                />
              </ValidatedField>
              <ValidatedField error={validation.fieldErrors.host} label="IP o dominio">
                <input
                  className="field-input"
                  onChange={(event) => updateField("host", event.target.value)}
                  placeholder="Ej. 192.168.88.1"
                  value={form.host}
                />
              </ValidatedField>
              <ValidatedField error={validation.fieldErrors.apiPort} label="Puerto API">
                <input
                  className="field-input"
                  max="65535"
                  min="1"
                  onChange={(event) => updateField("apiPort", event.target.value)}
                  type="number"
                  value={form.apiPort}
                />
              </ValidatedField>
              <ValidatedField error={validation.fieldErrors.webfigPort} label="Puerto WebFig">
                <input
                  className="field-input"
                  max="65535"
                  min="1"
                  onChange={(event) => updateField("webfigPort", event.target.value)}
                  type="number"
                  value={form.webfigPort}
                />
              </ValidatedField>
            </div>
          </section>
        )}

        {activeStep === "access" && (
          <section className="router-step-panel">
            <div className="wizard-step-head">
              <span>2</span>
              <div>
                <h4>Acceso seguro</h4>
                <p>Las credenciales se cifran localmente y no vuelven al frontend.</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
              <label className="field-label">
                Tipo
                <select className="field-input" onChange={(event) => updateField("authType", event.target.value)} value={form.authType}>
                  <option value="token">Token API</option>
                  <option value="password">Clave</option>
                </select>
              </label>
              <ValidatedField error={validation.fieldErrors.secret} label={form.authType === "token" ? "Token API" : "Clave de acceso"}>
                <input
                  className="field-input"
                  autoComplete="current-password"
                  onChange={(event) => updateField("secret", event.target.value)}
                  placeholder="Se cifra localmente en el equipo"
                  type="password"
                  value={form.secret}
                />
              </ValidatedField>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <ValidatedField error={validation.fieldErrors.username} label="Usuario API">
                <input
                  className="field-input"
                  autoComplete="username"
                  onChange={(event) => updateField("username", event.target.value)}
                  placeholder="Usuario autorizado"
                  value={form.username}
                />
              </ValidatedField>
              <ValidatedField error={validation.fieldErrors.allowedManagementIp} label="IP autorizada de esta estacion">
                <input
                  className="field-input"
                  onChange={(event) => updateField("allowedManagementIp", event.target.value)}
                  placeholder="Opcional. Ej. 192.168.216.13"
                  value={form.allowedManagementIp}
                />
              </ValidatedField>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
              <label className="toggle-row">
                <input checked={form.useTls} onChange={(event) => updateField("useTls", event.target.checked)} type="checkbox" />
                <span>Usar API TLS si el router lo tiene habilitado</span>
              </label>
              <label className="toggle-row">
                <input checked={form.webfigTls} onChange={(event) => updateField("webfigTls", event.target.checked)} type="checkbox" />
                <span>WebFig usa HTTPS</span>
              </label>
              <label className="toggle-row">
                <input checked={form.monitorWireGuard} onChange={(event) => updateField("monitorWireGuard", event.target.checked)} type="checkbox" />
                <span>Activar monitoreo WireGuard continuo</span>
              </label>
            </div>
          </section>
        )}

        {activeStep === "guide" && (
          <section className="router-step-panel">
            <div className="wizard-step-head">
              <span>3</span>
              <div>
                <h4>Guia de configuracion RouterOS</h4>
                <p>Comandos generados desde este formulario. Revisa y aplica solo si coinciden con tu politica.</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
              <div className="router-command-box">
                {commands.map((command) => (
                  <code key={command}>{command}</code>
                ))}
              </div>
              <div className="grid gap-3">
                <ValidatedField error={validation.fieldErrors.wireGuardPort} label="Puerto WireGuard UDP">
                  <input
                    className="field-input"
                    max="65535"
                    min="1"
                    onChange={(event) => updateField("wireGuardPort", event.target.value)}
                    type="number"
                    value={form.wireGuardPort}
                  />
                </ValidatedField>
                <label className="toggle-row">
                  <input checked={form.enableWebfigGuide} onChange={(event) => updateField("enableWebfigGuide", event.target.checked)} type="checkbox" />
                  <span>Incluir WebFig</span>
                </label>
                <label className="toggle-row">
                  <input checked={form.enableSyslogGuide} onChange={(event) => updateField("enableSyslogGuide", event.target.checked)} type="checkbox" />
                  <span>Incluir Syslog/Webhook</span>
                </label>
                <button className="icon-text-button" onClick={copyCommands} type="button">
                  <Clipboard size={15} />
                  Copiar guia
                </button>
              </div>
            </div>
          </section>
        )}

        {!isElectronPersistenceAvailable() && (
          <div className="rounded-lg border border-warm-line bg-[#fff9ef] p-3 text-sm text-warm-muted">
            Modo temporal: los registros viven solo en memoria. La persistencia real guarda el secreto cifrado localmente.
          </div>
        )}

        {status.message && (
          <div className={`form-message ${status.type === "error" ? "form-message-error" : "form-message-success"}`}>
            {status.message}
          </div>
        )}

        <div className="router-validation-strip">
          <div className="grid gap-1 text-sm text-warm-muted">
            {validation.errors.length === 0 ? (
              <span className="inline-flex items-center gap-2 font-bold text-[#3d7c66]">
                <CheckCircle2 size={16} />
                Datos minimos listos para guardar.
              </span>
            ) : (
              validation.errors.slice(0, 2).map((error) => <span key={error}>{error}</span>)
            )}
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={16} />
              El secreto no se muestra ni se devuelve al frontend.
            </span>
          </div>
          <button className="primary-button" disabled={isSaving || !validation.canSave} type="submit">
            <Save size={16} />
            {isSaving ? "Guardando" : "Guardar router"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ValidatedField({ children, error, label }) {
  return (
    <label className="field-label">
      {label}
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function validateForm(form) {
  const fieldErrors = {};
  const errors = [];

  if (!form.alias.trim()) {
    fieldErrors.alias = "Nombre requerido.";
  }

  if (!isHostLike(form.host)) {
    fieldErrors.host = "Ingresa una IPv4 o dominio valido.";
  }

  if (!isPort(form.apiPort)) {
    fieldErrors.apiPort = "Puerto API invalido.";
  }

  if (!isPort(form.webfigPort)) {
    fieldErrors.webfigPort = "Puerto WebFig invalido.";
  }

  if (!form.username.trim()) {
    fieldErrors.username = "Usuario requerido.";
  }

  if (!form.secret.trim()) {
    fieldErrors.secret = "Token o clave requerido.";
  }

  if (form.allowedManagementIp && !isIpv4(form.allowedManagementIp)) {
    fieldErrors.allowedManagementIp = "Usa una IPv4 para whitelist.";
  }

  if (!isPort(form.wireGuardPort)) {
    fieldErrors.wireGuardPort = "Puerto WireGuard invalido.";
  }

  for (const error of Object.values(fieldErrors)) {
    errors.push(error);
  }

  return {
    canSave: errors.length === 0,
    errors,
    fieldErrors
  };
}

function buildRouterOsCommands(form) {
  const service = form.useTls ? "api-ssl" : "api";
  const webfigService = form.webfigTls ? "www-ssl" : "www";
  const addressLimit = form.allowedManagementIp ? ` address=${form.allowedManagementIp}/32` : "";
  const srcAddress = form.allowedManagementIp ? ` src-address=${form.allowedManagementIp}/32` : "";
  const commands = [
    `/ip service set ${service} disabled=no port=${form.apiPort || 8728}${addressLimit}`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=${form.apiPort || 8728}${srcAddress} comment="Allow API VPN WG CONTROL"`
  ];

  if (form.enableWebfigGuide) {
    commands.push(`/ip service set ${webfigService} disabled=no port=${form.webfigPort || 8443}${addressLimit}`);
    commands.push(`/ip firewall filter add chain=input action=accept protocol=tcp dst-port=${form.webfigPort || 8443}${srcAddress} comment="Allow WebFig VPN WG CONTROL"`);
  }

  if (form.monitorWireGuard) {
    commands.push(`/ip firewall filter add chain=input action=accept protocol=udp dst-port=${form.wireGuardPort || 13231} comment="Allow WireGuard VPN WG CONTROL"`);
  }

  if (form.enableSyslogGuide) {
    const remote = form.allowedManagementIp || "IP_DE_ESTA_APP";
    commands.push(`/system logging action add name=vpn-wg-control target=remote remote=${remote} remote-port=5514`);
    commands.push('/system logging add topics=wireguard,firewall,info action=vpn-wg-control');
  }

  return commands;
}

function isPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isHostLike(value) {
  const text = String(value || "").trim();
  return isIpv4(text) || /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(text);
}

function isIpv4(value) {
  const parts = String(value || "").trim().split(".");

  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

export default RouterRegistration;
