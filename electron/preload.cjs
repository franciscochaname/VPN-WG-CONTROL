const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vpnWgControl", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  routers: {
    list: () => ipcRenderer.invoke("routers:list"),
    create: (payload) => ipcRenderer.invoke("routers:create", payload),
    remove: (routerId) => ipcRenderer.invoke("routers:remove", routerId)
  },
  dashboard: {
    snapshot: () => ipcRenderer.invoke("dashboard:snapshot")
  }
});
