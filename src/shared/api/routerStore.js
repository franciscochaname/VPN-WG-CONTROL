let browserRouters = [];

const electronApi = () => window.vpnWgControl;

export async function listRouters() {
  if (electronApi()?.routers) {
    return electronApi().routers.list();
  }

  return browserRouters;
}

export async function createRouter(payload) {
  if (electronApi()?.routers) {
    return electronApi().routers.create(payload);
  }

  const now = new Date().toISOString();
  const router = {
    id: crypto.randomUUID(),
    alias: payload.alias.trim(),
    host: payload.host.trim(),
    apiPort: Number(payload.apiPort || 8728),
    webfigPort: Number(payload.webfigPort || 8443),
    username: payload.username.trim(),
    authType: payload.authType,
    useTls: Boolean(payload.useTls),
    webfigTls: payload.webfigTls !== false,
    monitorWireGuard: payload.monitorWireGuard !== false,
    status: "pending_connection",
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
    tunnelCount: 0,
    diagnostics: []
  };

  browserRouters = [router, ...browserRouters];
  return router;
}

export async function removeRouter(routerId) {
  if (electronApi()?.routers) {
    return electronApi().routers.remove(routerId);
  }

  browserRouters = browserRouters.filter((router) => router.id !== routerId);
  return { ok: true };
}

export async function testRouterConnection(routerId) {
  if (electronApi()?.routers) {
    return electronApi().routers.testConnection(routerId);
  }

  throw new Error("La prueba de conexion solo esta disponible dentro de Electron.");
}

export async function syncWireGuard(routerId) {
  if (electronApi()?.routers) {
    return electronApi().routers.syncWireGuard(routerId);
  }

  throw new Error("La sincronizacion WireGuard solo esta disponible dentro de Electron.");
}

export async function diagnoseRouterServices(routerId) {
  if (electronApi()?.routers) {
    return electronApi().routers.diagnoseServices(routerId);
  }

  throw new Error("El diagnostico de servicios solo esta disponible dentro de Electron.");
}

export async function getDashboardSnapshot() {
  if (electronApi()?.dashboard) {
    return electronApi().dashboard.snapshot();
  }

  return {
    routers: browserRouters,
    tunnels: [],
    monitoring: {
      mode: "training",
      confidence: 0,
      sampleCount: 0,
      latestSampleAt: null,
      totalRxBytes: 0,
      totalTxBytes: 0,
      throughputBps: 0,
      handshakeMissing: 0,
      activeTunnels: 0,
      findings: [
        {
          severity: "info",
          title: "Vista navegador",
          detail: "El monitoreo real se activa en la app de escritorio con acceso a Electron y RouterOS."
        }
      ]
    },
    metrics: {
      routers: browserRouters.length,
      tunnels: 0,
      events: 0,
      pendingConnections: browserRouters.filter((router) => router.status === "pending_connection").length,
      onlineRouters: 0,
      offlineRouters: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
      throughputBps: 0,
      handshakeMissing: 0
    }
  };
}

export function isElectronPersistenceAvailable() {
  return Boolean(electronApi()?.routers);
}
