const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vpnWgControl", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  routers: {
    list: () => ipcRenderer.invoke("routers:list"),
    create: (payload) => ipcRenderer.invoke("routers:create", payload),
    remove: (routerId) => ipcRenderer.invoke("routers:remove", routerId),
    testConnection: (routerId) => ipcRenderer.invoke("routers:test-connection", routerId),
    syncWireGuard: (routerId) => ipcRenderer.invoke("routers:sync-wireguard", routerId),
    diagnoseServices: (routerId) => ipcRenderer.invoke("routers:diagnose-services", routerId)
  },
  dashboard: {
    snapshot: () => ipcRenderer.invoke("dashboard:snapshot")
  },
  security: {
    health: () => ipcRenderer.invoke("security:health")
  },
  wireguard: {
    listTunnels: (routerId) => ipcRenderer.invoke("wireguard:list-tunnels", routerId),
    addPeer: (payload) => ipcRenderer.invoke("wireguard:add-peer", payload),
    orchestrate: (payload) => ipcRenderer.invoke("wireguard:orchestrate", payload)
  },
  wireguardKeys: {
    list: () => ipcRenderer.invoke("wireguard-keys:list"),
    generate: (payload) => ipcRenderer.invoke("wireguard-keys:generate", payload),
    remove: (keyId) => ipcRenderer.invoke("wireguard-keys:remove", keyId)
  },
  firewall: {
    list: (routerId) => ipcRenderer.invoke("firewall:list", routerId),
    sync: (routerId) => ipcRenderer.invoke("firewall:sync", routerId),
    applyPreset: (payload) => ipcRenderer.invoke("firewall:apply-preset", payload)
  },
  events: {
    status: () => ipcRenderer.invoke("events:status"),
    list: (limit) => ipcRenderer.invoke("events:list", limit)
  },
  monitor: {
    status: () => ipcRenderer.invoke("monitor:status"),
    runOnce: () => ipcRenderer.invoke("monitor:run-once")
  },
  ipam: {
    list: (routerId) => ipcRenderer.invoke("ipam:list", routerId),
    sync: (routerId) => ipcRenderer.invoke("ipam:sync", routerId),
    create: (payload) => ipcRenderer.invoke("ipam:create", payload),
    remove: (segmentId) => ipcRenderer.invoke("ipam:remove", segmentId),
    analysis: (routerId) => ipcRenderer.invoke("ipam:analysis", routerId),
    suggest: (payload) => ipcRenderer.invoke("ipam:suggest", payload),
    reserve: (payload) => ipcRenderer.invoke("ipam:reserve", payload),
    release: (reservationId) => ipcRenderer.invoke("ipam:release", reservationId)
  },
  backups: {
    list: (routerId) => ipcRenderer.invoke("backups:list", routerId),
    create: (payload) => ipcRenderer.invoke("backups:create", payload),
    rollback: (backupId) => ipcRenderer.invoke("backups:rollback", backupId)
  }
});
