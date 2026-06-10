import { Sparkles } from "lucide-react";
import { nodes, tunnels } from "./dashboardData.js";
import NodeMarker from "./NodeMarker.jsx";

function TopologyMap() {
  const findNode = (id) => nodes.find((node) => node.id === id);

  return (
    <div className="relative h-[430px] overflow-hidden rounded-lg border border-warm-line bg-[#fff9ef]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {tunnels.map((tunnel) => {
          const from = findNode(tunnel.from);
          const to = findNode(tunnel.to);

          return (
            <g key={`${tunnel.from}-${tunnel.to}`}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="topology-line" />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="topology-flow" />
            </g>
          );
        })}
      </svg>

      {nodes.map((node) => (
        <NodeMarker key={node.id} node={node} />
      ))}

      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-warm-line bg-white/80 px-3 py-2 text-sm shadow-soft backdrop-blur">
        <Sparkles size={16} className="text-warm-amber" />
        <span>Animacion de trafico activa</span>
      </div>
    </div>
  );
}

export default TopologyMap;
