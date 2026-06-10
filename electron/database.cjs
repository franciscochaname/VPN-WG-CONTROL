const { safeStorage } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

let db;

function initializeDatabase(userDataPath) {
  const databaseDir = path.join(userDataPath, "data");
  fs.mkdirSync(databaseDir, { recursive: true });

  db = new DatabaseSync(path.join(databaseDir, "vpn-wg-control.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tb_config_router (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      host TEXT NOT NULL,
      api_port INTEGER NOT NULL DEFAULT 8728,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'token',
      secret_encrypted TEXT NOT NULL,
      use_tls INTEGER NOT NULL DEFAULT 0,
      monitor_wireguard INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending_connection',
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tb_tuneles (
      id TEXT PRIMARY KEY,
      router_id TEXT NOT NULL,
      interface_name TEXT NOT NULL,
      peer_public_key TEXT,
      allowed_address TEXT,
      endpoint TEXT,
      last_handshake_at TEXT,
      rx_bytes INTEGER NOT NULL DEFAULT 0,
      tx_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tb_logs_eventos (
      id TEXT PRIMARY KEY,
      router_id TEXT,
      source TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE SET NULL
    );
  `);
}

function registerRouterHandlers(ipcMain) {
  ipcMain.handle("routers:list", () => listRouters());
  ipcMain.handle("routers:create", (_event, payload) => createRouter(payload));
  ipcMain.handle("routers:remove", (_event, routerId) => removeRouter(routerId));
  ipcMain.handle("dashboard:snapshot", () => getDashboardSnapshot());
}

function listRouters() {
  assertDatabase();

  return db
    .prepare(`
      SELECT
        r.id,
        r.alias,
        r.host,
        r.api_port AS apiPort,
        r.username,
        r.auth_type AS authType,
        r.use_tls AS useTls,
        r.monitor_wireguard AS monitorWireGuard,
        r.status,
        r.last_seen_at AS lastSeenAt,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt,
        COUNT(t.id) AS tunnelCount
      FROM tb_config_router r
      LEFT JOIN tb_tuneles t ON t.router_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `)
    .all()
    .map(normalizeRouterRow);
}

function createRouter(payload) {
  assertDatabase();
  const data = validateRouterPayload(payload);
  const now = new Date().toISOString();
  const router = {
    id: randomUUID(),
    ...data,
    secretEncrypted: encryptSecret(data.secret),
    status: "pending_connection",
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO tb_config_router (
      id,
      alias,
      host,
      api_port,
      username,
      auth_type,
      secret_encrypted,
      use_tls,
      monitor_wireguard,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    router.id,
    router.alias,
    router.host,
    router.apiPort,
    router.username,
    router.authType,
    router.secretEncrypted,
    router.useTls ? 1 : 0,
    router.monitorWireGuard ? 1 : 0,
    router.status,
    router.createdAt,
    router.updatedAt
  );

  return listRouters().find((item) => item.id === router.id);
}

function removeRouter(routerId) {
  assertDatabase();

  if (!routerId || typeof routerId !== "string") {
    throw new Error("Router invalido.");
  }

  db.prepare("DELETE FROM tb_config_router WHERE id = ?").run(routerId);
  return { ok: true };
}

function getDashboardSnapshot() {
  assertDatabase();
  const routers = listRouters();
  const tunnelCount = db.prepare("SELECT COUNT(*) AS total FROM tb_tuneles").get().total;
  const eventCount = db.prepare("SELECT COUNT(*) AS total FROM tb_logs_eventos").get().total;

  return {
    routers,
    metrics: {
      routers: routers.length,
      tunnels: tunnelCount,
      events: eventCount,
      pendingConnections: routers.filter((router) => router.status === "pending_connection").length
    }
  };
}

function validateRouterPayload(payload = {}) {
  const alias = cleanText(payload.alias);
  const host = cleanText(payload.host);
  const username = cleanText(payload.username);
  const secret = typeof payload.secret === "string" ? payload.secret.trim() : "";
  const apiPort = Number(payload.apiPort || 8728);
  const authType = payload.authType === "password" ? "password" : "token";

  if (!alias) {
    throw new Error("Ingresa un nombre para identificar el router.");
  }

  if (!host) {
    throw new Error("Ingresa la IP o dominio del router.");
  }

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("El puerto API debe estar entre 1 y 65535.");
  }

  if (!username) {
    throw new Error("Ingresa el usuario API del router.");
  }

  if (!secret) {
    throw new Error("Ingresa el token o clave de acceso del router.");
  }

  return {
    alias,
    host,
    apiPort,
    username,
    secret,
    authType,
    useTls: Boolean(payload.useTls),
    monitorWireGuard: payload.monitorWireGuard !== false
  };
}

function encryptSecret(secret) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("El cifrado seguro del sistema no esta disponible en este equipo.");
  }

  return safeStorage.encryptString(secret).toString("base64");
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRouterRow(row) {
  return {
    id: row.id,
    alias: row.alias,
    host: row.host,
    apiPort: row.apiPort,
    username: row.username,
    authType: row.authType,
    useTls: Boolean(row.useTls),
    monitorWireGuard: Boolean(row.monitorWireGuard),
    status: row.status,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tunnelCount: Number(row.tunnelCount || 0)
  };
}

function assertDatabase() {
  if (!db) {
    throw new Error("La base de datos local aun no esta inicializada.");
  }
}

module.exports = {
  initializeDatabase,
  registerRouterHandlers
};
