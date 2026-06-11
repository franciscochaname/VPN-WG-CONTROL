const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { initializeDatabase, ingestLiveEvent, registerRouterHandlers } = require("./database.cjs");
const { startEventServer, stopEventServer } = require("./eventServer.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#fbf7ef",
    title: "VPN WG CONTROL",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  initializeDatabase(app.getPath("userData"));
  startEventServer({ onEvent: ingestLiveEvent });
  registerRouterHandlers(ipcMain);
  ipcMain.handle("app:get-version", () => app.getVersion());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopEventServer();
    app.quit();
  }
});
