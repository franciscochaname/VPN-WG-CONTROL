const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vpnWgControl", {
  getVersion: () => ipcRenderer.invoke("app:get-version")
});
