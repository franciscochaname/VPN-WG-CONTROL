const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vpnWgControl", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  routers: {
    list: () => ipcRenderer.invoke("routers:list"),
    create: (payload) => ipcRenderer.invoke("routers:create", payload),
    remove: (routerId) => ipcRenderer.invoke("routers:remove", routerId),
    testConnection: (routerId) => ipcRenderer.invoke("routers:test-connection", routerId),
    syncWireGuard: (routerId) => ipcRenderer.invoke("routers:sync-wireguard", routerId)
  },
  dashboard: {
    snapshot: () => ipcRenderer.invoke("dashboard:snapshot")
  }
});
