import { Activity, Router, Wifi } from "lucide-react";

function NodeMarker({ node }) {
  const Icon = node.type === "router" ? Router : node.type === "site" ? Wifi : Activity;
  const isWarning = node.status === "warning";

  return (
    <button
      className={`node-marker ${node.type === "router" ? "node-router" : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      type="button"
    >
      <span className={`node-pulse ${isWarning ? "bg-warm-amber" : "bg-warm-mint"}`} />
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-warm-ink shadow-soft">
        <Icon size={20} />
      </span>
      <span className="mt-2 rounded-full bg-white/85 px-2.5 py-1 text-xs font-semibold shadow-sm">
        {node.label}
      </span>
    </button>
  );
}

export default NodeMarker;
