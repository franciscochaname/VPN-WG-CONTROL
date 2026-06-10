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
    username: payload.username.trim(),
    authType: payload.authType,
    useTls: Boolean(payload.useTls),
    monitorWireGuard: payload.monitorWireGuard !== false,
    status: "pending_connection",
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
    tunnelCount: 0
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

export async function getDashboardSnapshot() {
  if (electronApi()?.dashboard) {
    return electronApi().dashboard.snapshot();
  }

  return {
    routers: browserRouters,
    metrics: {
      routers: browserRouters.length,
      tunnels: 0,
      events: 0,
      pendingConnections: browserRouters.filter((router) => router.status === "pending_connection").length
    }
  };
}

export function isElectronPersistenceAvailable() {
  return Boolean(electronApi()?.routers);
}
