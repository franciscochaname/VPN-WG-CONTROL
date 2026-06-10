import { Database, Router } from "lucide-react";
import NodeMarker from "./NodeMarker.jsx";

const nodeSlots = [
  { x: 50, y: 45 },
  { x: 24, y: 30 },
  { x: 27, y: 72 },
  { x: 76, y: 30 },
  { x: 73, y: 72 },
  { x: 50, y: 18 }
];

function TopologyMap({ isLoading, routers, selectedRouter }) {
  const nodes = routers.map((router, index) => ({
    id: router.id,
    label: router.alias,
    status: router.status,
    type: "router",
    x: nodeSlots[index % nodeSlots.length].x,
    y: nodeSlots[index % nodeSlots.length].y,
    host: router.host,
    isSelected: router.id === selectedRouter?.id
  }));

  if (isLoading) {
    return (
      <div className="flex h-[430px] items-center justify-center rounded-lg border border-warm-line bg-[#fff9ef]">
        <div className="flex items-center gap-3 text-sm text-warm-muted">
          <Database size={18} />
          Cargando base local
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[430px] flex-col items-center justify-center rounded-lg border border-dashed border-warm-line bg-[#fff9ef] px-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#f4ead9] text-warm-copper">
          <Router size={24} />
        </div>
        <h3 className="text-lg font-semibold">Sin routers registrados</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-warm-muted">
          La topologia aparecera cuando agregues un router real. No se muestran nodos, tuneles ni alertas inventadas.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[430px] overflow-hidden rounded-lg border border-warm-line bg-[#fff9ef]">
      {nodes.map((node) => (
        <NodeMarker key={node.id} node={node} />
      ))}

      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-warm-line bg-white/80 px-3 py-2 text-sm shadow-soft backdrop-blur">
        <Database size={16} className="text-warm-amber" />
        <span>{selectedRouter ? `${selectedRouter.host}:${selectedRouter.apiPort}` : "Base local lista"}</span>
      </div>
    </div>
  );
}

export default TopologyMap;
