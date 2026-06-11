import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  generateWireGuardKey,
  listWireGuardKeys,
  removeWireGuardKey
} from "../../shared/api/wireGuardKeyStore.js";

function WireGuardKeys({ routers }) {
  const [keys, setKeys] = useState([]);
  const [form, setForm] = useState({ label: "", assignedRouterId: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [actionState, setActionState] = useState({ type: "idle", message: "" });

  async function refreshKeys() {
    setIsLoading(true);
    try {
      setKeys(await listWireGuardKeys());
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setActionState({ type: "idle", message: "" });

    try {
      await generateWireGuardKey({
        label: form.label,
        assignedRouterId: form.assignedRouterId || null
      });
      setForm({ label: "", assignedRouterId: "" });
      await refreshKeys();
      setActionState({ type: "success", message: "Llave WireGuard generada y privada cifrada localmente." });
    } catch (error) {
      setActionState({ type: "error", message: error.message || "No se pudo generar la llave." });
    }
  }

  async function handleRemove(keyId) {
    await removeWireGuardKey(keyId);
    await refreshKeys();
  }

  async function copyPublicKey(publicKey) {
    await navigator.clipboard.writeText(publicKey);
    setActionState({ type: "success", message: "Llave publica copiada." });
  }

  useEffect(() => {
    refreshKeys();
  }, []);

  return (
    <section className="rounded-lg border border-warm-line bg-warm-panel p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-copper">Criptografo local</p>
          <h2 className="mt-1 text-xl font-semibold">Llaves WireGuard</h2>
          <p className="mt-1 text-sm text-warm-muted">
            La clave privada se cifra localmente y no se muestra de nuevo en pantalla.
          </p>
        </div>
        <button className="action-button" onClick={refreshKeys} type="button">
          <RefreshCw size={16} />
          <span>Actualizar</span>
        </button>
      </div>

      <form className="mb-5 rounded-lg border border-warm-line bg-[#fff9ef] p-4" onSubmit={handleGenerate}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="field-label">
            Etiqueta
            <input
              className="field-input"
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Ej. Cliente soporte Lima"
              value={form.label}
            />
          </label>
          <label className="field-label">
            Router asociado
            <select
              className="field-input"
              onChange={(event) => setForm((current) => ({ ...current, assignedRouterId: event.target.value }))}
              value={form.assignedRouterId}
            >
              <option value="">Sin asignar</option>
              {routers.map((router) => (
                <option key={router.id} value={router.id}>
                  {router.alias}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button self-end" type="submit">
            <Plus size={16} />
            Generar
          </button>
        </div>
      </form>

      {actionState.message && (
        <div className={`form-message ${actionState.type === "error" ? "form-message-error" : "form-message-success"} mb-4`}>
          {actionState.message}
        </div>
      )}

      {isLoading ? (
        <div className="empty-panel">Cargando llaves locales.</div>
      ) : keys.length === 0 ? (
        <div className="empty-panel">
          <KeyRound size={24} />
          <h3>Sin llaves WireGuard generadas</h3>
          <p>
            Genera una llave para preparar peers. La privada se guarda cifrada localmente; la publica puede copiarse para RouterOS.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {keys.map((key) => (
            <article className="key-card" key={key.id}>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
                    <KeyRound size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{key.label}</p>
                    <p className="text-xs text-warm-muted">
                      {key.assignedRouterAlias ? `Router: ${key.assignedRouterAlias}` : "Sin router asignado"}
                    </p>
                  </div>
                </div>
                <code className="key-public">{key.publicKey}</code>
                <p className="mt-2 flex items-center gap-1 text-xs text-warm-muted">
                  <ShieldCheck size={13} />
                  Privada cifrada en SQLite. Creada: {formatDate(key.createdAt)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button className="icon-text-button" onClick={() => copyPublicKey(key.publicKey)} type="button">
                  <Copy size={16} />
                  Copiar
                </button>
                <button className="icon-text-button icon-text-danger" onClick={() => handleRemove(key.id)} type="button">
                  <Trash2 size={16} />
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export default WireGuardKeys;
