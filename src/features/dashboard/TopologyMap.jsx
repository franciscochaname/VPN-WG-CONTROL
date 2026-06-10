import { Activity, Database, HardDrive, MousePointer2, Network, Router, ShieldCheck, Wifi } from "lucide-react";

const nodeSlots = [
  { x: 50, y: 45 },
  { x: 24, y: 30 },
  { x: 27, y: 72 },
  { x: 76, y: 30 },
  { x: 73, y: 72 },
  { x: 50, y: 18 }
];

const peerSlots = [
  { x: 18, y: 20 },
  { x: 82, y: 22 },
  { x: 18, y: 78 },
  { x: 82, y: 78 },
  { x: 50, y: 12 },
  { x: 50, y: 86 },
  { x: 10, y: 50 },
  { x: 90, y: 50 }
];

function TopologyMap({ isLoading, routers, tunnels, selectedRouter }) {
  const routerNodes = routers.map((router, index) => ({
    id: router.id,
    label: router.alias,
    status: router.status,
    kind: "router",
    x: nodeSlots[index % nodeSlots.length].x,
    y: nodeSlots[index % nodeSlots.length].y,
    host: router.host,
    apiPort: router.apiPort,
    tunnelCount: router.tunnelCount,
    diagnostics: router.diagnostics || [],
    isSelected: router.id === selectedRouter?.id
  }));
  const peerNodes = tunnels.map((tunnel, index) => ({
    id: tunnel.id,
    label: tunnel.allowedAddress || tunnel.interfaceName,
    status: tunnel.status,
    kind: "peer",
    x: peerSlots[index % peerSlots.length].x,
    y: peerSlots[index % peerSlots.length].y,
    routerId: tunnel.routerId,
    interfaceName: tunnel.interfaceName,
    endpoint: tunnel.endpoint,
    handshake: tunnel.lastHandshakeAt
  }));
  const nodes = [...routerNodes, ...peerNodes];
  const links = peerNodes
    .map((peer) => ({
      id: `${peer.routerId}-${peer.id}`,
      from: routerNodes.find((router) => router.id === peer.routerId),
      to: peer
    }))
    .filter((link) => link.from && link.to);

  if (isLoading) {
    return (
      <div className="network-canvas flex h-[500px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-warm-muted">
          <Database size={18} />
          Cargando base local
        </div>
      </div>
    );
  }

  if (routerNodes.length === 0) {
    return (
      <div className="network-canvas flex h-[500px] flex-col items-center justify-center px-8 text-center">
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
    <div className="network-canvas">
      <div className="canvas-toolbar">
        <div className="canvas-tool canvas-tool-active" title="Seleccionar">
          <MousePointer2 size={16} />
        </div>
        <div className="canvas-tool" title="Routers">
          <Router size={16} />
        </div>
        <div className="canvas-tool" title="WireGuard">
          <Network size={16} />
        </div>
        <div className="canvas-tool" title="Servicios">
          <HardDrive size={16} />
        </div>
      </div>

      <svg className="canvas-links" viewBox="0 0 100 100" preserveAspectRatio="none">
        {links.map((link) => (
          <g key={link.id}>
            <line
              className="canvas-link-base"
              x1={link.from.x}
              x2={link.to.x}
              y1={link.from.y}
              y2={link.to.y}
            />
            <line
              className="canvas-link-flow"
              x1={link.from.x}
              x2={link.to.x}
              y1={link.from.y}
              y2={link.to.y}
            />
          </g>
        ))}
      </svg>

      {routerNodes.map((node) => (
        <NetworkNode key={node.id} node={node} />
      ))}

      {peerNodes.map((node) => (
        <NetworkNode key={node.id} node={node} />
      ))}

      <div className="canvas-statusbar">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-warm-mint" />
          <span>{routerNodes.length} routers</span>
        </div>
        <div className="flex items-center gap-2">
          <Wifi size={15} className="text-warm-copper" />
          <span>{peerNodes.length} peers</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-warm-amber" />
          <span>{links.length} enlaces WG</span>
        </div>
        <span className="ml-auto truncate">
          {selectedRouter ? `Seleccionado: ${selectedRouter.host}:${selectedRouter.apiPort}` : "Base local lista"}
        </span>
      </div>
    </div>
  );
}

function NetworkNode({ node }) {
  const isRouter = node.kind === "router";
  const Icon = isRouter ? Router : Wifi;
  const servicesOpen = (node.diagnostics || []).filter((item) => item.status === "open").length;

  return (
    <button
      className={`canvas-node ${isRouter ? "canvas-node-router" : "canvas-node-peer"} ${node.isSelected ? "canvas-node-selected" : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      title={isRouter ? `${node.host}:${node.apiPort}` : node.endpoint || node.interfaceName}
      type="button"
    >
      <span className={`canvas-led canvas-led-${node.status}`} />
      <span className="canvas-node-icon">
        <Icon size={20} />
      </span>
      <span className="canvas-node-label">{node.label}</span>
      <span className="canvas-node-meta">
        {isRouter ? `${node.tunnelCount || 0} peers · ${servicesOpen} svc` : node.interfaceName}
      </span>
    </button>
  );
}

export default TopologyMap;
