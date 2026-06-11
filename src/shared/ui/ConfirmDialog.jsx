import { AlertTriangle, X } from "lucide-react";

function ConfirmDialog({
  isOpen,
  title,
  detail,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "warning",
  isBusy = false,
  onCancel,
  onConfirm
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`confirm-icon confirm-icon-${tone}`}>
          <AlertTriangle size={22} />
        </div>
        <button className="confirm-close" onClick={onCancel} title="Cerrar" type="button">
          <X size={16} />
        </button>
        <h3 id="confirm-title">{title}</h3>
        {detail && <p>{detail}</p>}
        <div className="confirm-actions">
          <button className="icon-text-button" disabled={isBusy} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className={tone === "danger" ? "confirm-danger" : "primary-button"} disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? "Procesando" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialog;
