import { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "../features/dashboard/Dashboard.jsx";
import FirewallCenter from "../features/firewall/FirewallCenter.jsx";
import IpamCenter from "../features/ipam/IpamCenter.jsx";
import WireGuardKeys from "../features/keys/WireGuardKeys.jsx";
import Header from "../features/layout/Header.jsx";
import OperationsPanel from "../features/layout/OperationsPanel.jsx";
import Sidebar from "../features/layout/Sidebar.jsx";
import RouterRegistration from "../features/routers/RouterRegistration.jsx";
import SecurityCenter from "../features/security/SecurityCenter.jsx";
import WireGuardControl from "../features/wireguard/WireGuardControl.jsx";
import {
  diagnoseRouterServices,
  getDashboardSnapshot,
  removeRouter,
  syncWireGuard,
  testRouterConnection
} from "../shared/api/routerStore.js";

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [routers, setRouters] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [metrics, setMetrics] = useState({
    routers: 0,
    tunnels: 0,
    events: 0,
    pendingConnections: 0,
    onlineRouters: 0,
    offlineRouters: 0,
    totalRxBytes: 0,
    totalTxBytes: 0,
    throughputBps: 0,
    handshakeMissing: 0,
    ipSegments: 0
  });
  const [monitoring, setMonitoring] = useState({
    mode: "training",
    confidence: 0,
    sampleCount: 0,
    totalRxBytes: 0,
    totalTxBytes: 0,
    throughputBps: 0,
    handshakeMissing: 0,
    activeTunnels: 0,
    eventServer: {},
    findings: []
  });
  const [selectedRouterId, setSelectedRouterId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedRouter = useMemo(
    () => routers.find((router) => router.id === selectedRouterId) || routers[0] || null,
    [routers, selectedRouterId]
  );

  const refreshWorkspace = useCallback(async function refreshWorkspace(options = {}) {
    if (!options.silent) {
      setIsLoading(true);
    }

    try {
      const snapshot = await getDashboardSnapshot();
      setRouters(snapshot.routers);
      setTunnels(snapshot.tunnels || []);
      setMetrics(snapshot.metrics);
      setMonitoring(snapshot.monitoring || {
        mode: "training",
        confidence: 0,
        sampleCount: 0,
        totalRxBytes: 0,
        totalTxBytes: 0,
        throughputBps: 0,
        handshakeMissing: 0,
        activeTunnels: 0,
        eventServer: {},
        findings: []
      });
      setSelectedRouterId((currentId) => {
        if (snapshot.routers.some((router) => router.id === currentId)) {
          return currentId;
        }

        return snapshot.routers[0]?.id || null;
      });
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }, []);

  async function handleRemoveRouter(routerId) {
    await removeRouter(routerId);
    await refreshWorkspace();
  }

  async function handleTestRouter(routerId) {
    const router = await testRouterConnection(routerId);
    await refreshWorkspace();
    return router;
  }

  async function handleSyncWireGuard(routerId) {
    const snapshot = await syncWireGuard(routerId);
    setRouters(snapshot.routers);
    setTunnels(snapshot.tunnels || []);
    setMetrics(snapshot.metrics);
    setMonitoring(snapshot.monitoring || monitoring);
    return snapshot;
  }

  async function handleDiagnoseRouter(routerId) {
    const result = await diagnoseRouterServices(routerId);
    await refreshWorkspace();
    return result;
  }

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshWorkspace({ silent: true });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [refreshWorkspace]);

  return (
    <main className="min-h-screen overflow-hidden bg-warm-canvas text-warm-ink">
      <div className="pointer-events-none fixed inset-0 soft-grid" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-5 lg:px-8">
        <Header routerCount={metrics.routers} />

        <div className="grid flex-1 grid-cols-1 gap-5 py-5 lg:grid-cols-[260px_minmax(0,1fr)_310px]">
          <Sidebar activeView={activeView} onNavigate={setActiveView} />
          <ContentView
            activeView={activeView}
            isLoading={isLoading}
            metrics={metrics}
            monitoring={monitoring}
            routers={routers}
            tunnels={tunnels}
            selectedRouter={selectedRouter}
            onOpenRouterRegistration={() => setActiveView("routers")}
            onRouterCreated={refreshWorkspace}
            onSyncWireGuard={handleSyncWireGuard}
          />
          <OperationsPanel
            routers={routers}
            selectedRouter={selectedRouter}
            onSelectRouter={setSelectedRouterId}
            onRemoveRouter={handleRemoveRouter}
            onTestRouter={handleTestRouter}
            onSyncWireGuard={handleSyncWireGuard}
            onDiagnoseRouter={handleDiagnoseRouter}
            onOpenRouterRegistration={() => setActiveView("routers")}
          />
        </div>
      </section>
    </main>
  );
}

function ContentView({
  activeView,
  isLoading,
  metrics,
  monitoring,
  routers,
  tunnels,
  selectedRouter,
  onOpenRouterRegistration,
  onRouterCreated,
  onSyncWireGuard
}) {
  if (activeView === "routers") {
    return <RouterRegistration onRouterCreated={onRouterCreated} />;
  }

  if (activeView === "wireguard") {
    return <WireGuardControl routers={routers} selectedRouter={selectedRouter} onSyncWireGuard={onSyncWireGuard} />;
  }

  if (activeView === "security") {
    return <SecurityCenter />;
  }

  if (activeView === "firewall") {
    return <FirewallCenter selectedRouter={selectedRouter} />;
  }

  if (activeView === "keys") {
    return <WireGuardKeys routers={routers} />;
  }

  if (activeView === "ipam") {
    return <IpamCenter selectedRouter={selectedRouter} />;
  }

  return (
    <Dashboard
      isLoading={isLoading}
      metrics={metrics}
      monitoring={monitoring}
      routers={routers}
      tunnels={tunnels}
      selectedRouter={selectedRouter}
      onSyncSelectedRouter={selectedRouter ? () => onSyncWireGuard(selectedRouter.id) : null}
      onOpenRouterRegistration={onOpenRouterRegistration}
    />
  );
}

export default App;
