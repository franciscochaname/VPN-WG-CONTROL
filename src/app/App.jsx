import { useCallback, useEffect, useMemo, useState } from "react";
import BackupCenter from "../features/backups/BackupCenter.jsx";
import Dashboard from "../features/dashboard/Dashboard.jsx";
import FirewallCenter from "../features/firewall/FirewallCenter.jsx";
import IpamCenter from "../features/ipam/IpamCenter.jsx";
import WireGuardKeys from "../features/keys/WireGuardKeys.jsx";
import Header from "../features/layout/Header.jsx";
import Sidebar from "../features/layout/Sidebar.jsx";
import TopCommandBar from "../features/layout/TopCommandBar.jsx";
import RouterRegistration from "../features/routers/RouterRegistration.jsx";
import SecurityCenter from "../features/security/SecurityCenter.jsx";
import WireGuardControl from "../features/wireguard/WireGuardControl.jsx";
import NotificationCenter from "../shared/ui/NotificationCenter.jsx";
import {
  diagnoseRouterServices,
  getDashboardSnapshot,
  syncWireGuard,
} from "../shared/api/routerStore.js";

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [notifications, setNotifications] = useState([]);
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
  const [continuousMonitor, setContinuousMonitor] = useState({
    enabled: false,
    running: false,
    intervalMs: 30000,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
    lastSummary: {
      checkedRouters: 0,
      syncedRouters: 0,
      failedRouters: 0,
      skippedRouters: 0
    }
  });
  const [selectedRouterId, setSelectedRouterId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");

  const selectedRouter = useMemo(
    () => routers.find((router) => router.id === selectedRouterId) || routers[0] || null,
    [routers, selectedRouterId]
  );

  const notify = useCallback(function notify(notification) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((current) => [{ id, type: "info", ...notification }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== id));
    }, notification.timeout || 5200);
  }, []);

  function dismissNotification(notificationId) {
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  }

  const refreshWorkspace = useCallback(async function refreshWorkspace(options = {}) {
    if (!options.silent) {
      setIsLoading(true);
    }

    try {
      const snapshot = await getDashboardSnapshot();
      setWorkspaceError("");
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
      setContinuousMonitor(snapshot.continuousMonitor || {
        enabled: false,
        running: false,
        intervalMs: 30000,
        lastStartedAt: null,
        lastCompletedAt: null,
        lastError: null,
        lastSummary: {
          checkedRouters: 0,
          syncedRouters: 0,
          failedRouters: 0,
          skippedRouters: 0
        }
      });
      setSelectedRouterId((currentId) => {
        if (snapshot.routers.some((router) => router.id === currentId)) {
          return currentId;
        }

        return snapshot.routers[0]?.id || null;
      });
    } catch (error) {
      const message = error.message || "No se pudo cargar el estado local del sistema.";
      setWorkspaceError(message);

      if (!options.silent) {
        notify({
          type: "error",
          title: "Estado local no disponible",
          detail: message
        });
      }
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }, [notify]);

  async function handleSyncWireGuard(routerId) {
    const snapshot = await syncWireGuard(routerId);
    setRouters(snapshot.routers);
    setTunnels(snapshot.tunnels || []);
    setMetrics(snapshot.metrics);
    setMonitoring(snapshot.monitoring || monitoring);
    setContinuousMonitor(snapshot.continuousMonitor || continuousMonitor);
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
      <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-5 lg:px-8">
        <Header
          activeView={activeView}
          continuousMonitor={continuousMonitor}
          metrics={metrics}
          monitoring={monitoring}
          notificationCount={notifications.length}
          selectedRouter={selectedRouter}
          onNavigate={setActiveView}
        />

        <TopCommandBar
          continuousMonitor={continuousMonitor}
          selectedRouter={selectedRouter}
          onNavigate={setActiveView}
        />

        {workspaceError && (
          <div className="workspace-alert">
            <strong>No se pudo actualizar el estado local</strong>
            <span>{workspaceError}</span>
            <button onClick={() => refreshWorkspace()} type="button">Reintentar</button>
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-5 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Sidebar
            activeView={activeView}
            routers={routers}
            selectedRouter={selectedRouter}
            onDiagnoseRouter={handleDiagnoseRouter}
            onNavigate={setActiveView}
            onOpenFirewall={() => setActiveView("firewall")}
            onOpenIpam={() => setActiveView("ipam")}
            onOpenRouterRegistration={() => setActiveView("routers")}
            onOpenWireGuard={() => setActiveView("wireguard")}
            onSelectRouter={setSelectedRouterId}
            onSyncWireGuard={handleSyncWireGuard}
          />
          <ContentView
            activeView={activeView}
            isLoading={isLoading}
            metrics={metrics}
            monitoring={monitoring}
            continuousMonitor={continuousMonitor}
            routers={routers}
            tunnels={tunnels}
            selectedRouter={selectedRouter}
            onOpenRouterRegistration={() => setActiveView("routers")}
            onRouterCreated={refreshWorkspace}
            onSyncWireGuard={handleSyncWireGuard}
            onWorkspaceRefresh={refreshWorkspace}
            onNotify={notify}
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
  continuousMonitor,
  routers,
  tunnels,
  selectedRouter,
  onOpenRouterRegistration,
  onRouterCreated,
  onSyncWireGuard,
  onWorkspaceRefresh,
  onNotify
}) {
  if (activeView === "routers") {
    return <RouterRegistration onRouterCreated={onRouterCreated} onNotify={onNotify} />;
  }

  if (activeView === "wireguard") {
    return (
      <WireGuardControl
        routers={routers}
        selectedRouter={selectedRouter}
        onSyncWireGuard={onSyncWireGuard}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onNotify={onNotify}
      />
    );
  }

  if (activeView === "security") {
    return <SecurityCenter onNotify={onNotify} />;
  }

  if (activeView === "firewall") {
    return <FirewallCenter selectedRouter={selectedRouter} onNotify={onNotify} />;
  }

  if (activeView === "keys") {
    return <WireGuardKeys routers={routers} />;
  }

  if (activeView === "ipam") {
    return <IpamCenter selectedRouter={selectedRouter} onWorkspaceRefresh={onWorkspaceRefresh} onNotify={onNotify} />;
  }

  if (activeView === "backups") {
    return <BackupCenter selectedRouter={selectedRouter} onWorkspaceRefresh={onWorkspaceRefresh} onNotify={onNotify} />;
  }

  return (
    <Dashboard
      isLoading={isLoading}
      metrics={metrics}
      monitoring={monitoring}
      continuousMonitor={continuousMonitor}
      routers={routers}
      tunnels={tunnels}
      selectedRouter={selectedRouter}
      onSyncSelectedRouter={selectedRouter ? () => onSyncWireGuard(selectedRouter.id) : null}
      onOpenRouterRegistration={onOpenRouterRegistration}
    />
  );
}

export default App;
