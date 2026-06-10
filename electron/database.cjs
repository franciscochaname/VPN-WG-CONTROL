const { safeStorage } = require("electron");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { fetchWireGuardState, testRouterConnection } = require("./routerosClient.cjs");

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
      last_error TEXT,
      router_identity TEXT,
      router_version TEXT,
      last_sync_at TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_tuneles_router_id ON tb_tuneles(router_id);
    CREATE INDEX IF NOT EXISTS idx_logs_router_id ON tb_logs_eventos(router_id);
  `);
  runMigrations();
}

function registerRouterHandlers(ipcMain) {
  ipcMain.handle("routers:list", () => listRouters());
  ipcMain.handle("routers:create", (_event, payload) => createRouter(payload));
  ipcMain.handle("routers:remove", (_event, routerId) => removeRouter(routerId));
  ipcMain.handle("routers:test-connection", (_event, routerId) => testConnection(routerId));
  ipcMain.handle("routers:sync-wireguard", (_event, routerId) => syncWireGuard(routerId));
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
        r.last_error AS lastError,
        r.router_identity AS routerIdentity,
        r.router_version AS routerVersion,
        r.last_sync_at AS lastSyncAt,
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

async function testConnection(routerId) {
  assertDatabase();
  const router = getRouterWithSecret(routerId);

  try {
    const result = await testRouterConnection(toConnectionConfig(router));
    const now = new Date().toISOString();
    const identity = result.identity?.name || null;
    const version = result.resource?.version || null;

    db.prepare(`
      UPDATE tb_config_router
      SET status = 'online',
          last_seen_at = ?,
          last_error = NULL,
          router_identity = ?,
          router_version = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, identity, version, now, routerId);

    insertLog(routerId, "routeros-api", "info", "Conexion API validada correctamente.");
    return listRouters().find((item) => item.id === routerId);
  } catch (error) {
    markRouterOffline(routerId, error.message);
    throw error;
  }
}

async function syncWireGuard(routerId) {
  assertDatabase();
  const router = getRouterWithSecret(routerId);

  if (!router.monitorWireGuard) {
    throw new Error("El monitoreo WireGuard no esta habilitado para este router.");
  }

  try {
    const state = await fetchWireGuardState(toConnectionConfig(router));
    const now = new Date().toISOString();

    replaceWireGuardTunnels(routerId, state, now);

    db.prepare(`
      UPDATE tb_config_router
      SET status = 'online',
          last_seen_at = ?,
          last_error = NULL,
          last_sync_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, now, routerId);

    insertLog(routerId, "wireguard-sync", "info", `Sincronizacion WireGuard finalizada: ${state.peers.length} peers leidos.`);
    return getDashboardSnapshot();
  } catch (error) {
    markRouterOffline(routerId, error.message);
    throw error;
  }
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
      pendingConnections: routers.filter((router) => router.status === "pending_connection").length,
      onlineRouters: routers.filter((router) => router.status === "online").length,
      offlineRouters: routers.filter((router) => router.status === "offline").length
    }
  };
}

function getRouterWithSecret(routerId) {
  if (!routerId || typeof routerId !== "string") {
    throw new Error("Router invalido.");
  }

  const router = db
    .prepare(`
      SELECT
        id,
        alias,
        host,
        api_port AS apiPort,
        username,
        auth_type AS authType,
        secret_encrypted AS secretEncrypted,
        use_tls AS useTls,
        monitor_wireguard AS monitorWireGuard,
        status
      FROM tb_config_router
      WHERE id = ?
    `)
    .get(routerId);

  if (!router) {
    throw new Error("Router no encontrado.");
  }

  return {
    ...router,
    useTls: Boolean(router.useTls),
    monitorWireGuard: Boolean(router.monitorWireGuard),
    secret: decryptSecret(router.secretEncrypted)
  };
}

function toConnectionConfig(router) {
  return {
    host: router.host,
    port: router.apiPort,
    username: router.username,
    password: router.secret,
    useTls: router.useTls
  };
}

function replaceWireGuardTunnels(routerId, state, now) {
  const interfaceNames = new Set(state.interfaces.map((item) => item.name).filter(Boolean));
  const rows = state.peers.map((peer) => {
    const interfaceName = peer.interface || peer["interface-name"] || "wireguard";
    return {
      id: createTunnelId(routerId, interfaceName, peer["public-key"] || "", peer["allowed-address"] || ""),
      routerId,
      interfaceName,
      peerPublicKey: peer["public-key"] || null,
      allowedAddress: peer["allowed-address"] || null,
      endpoint: buildEndpoint(peer),
      lastHandshakeAt: peer["last-handshake"] || null,
      rxBytes: toInteger(peer.rx),
      txBytes: toInteger(peer.tx),
      status: peer.disabled === "true" ? "disabled" : "known",
      createdAt: now,
      updatedAt: now
    };
  });

  if (rows.length === 0 && interfaceNames.size > 0) {
    for (const interfaceName of interfaceNames) {
      rows.push({
        id: createTunnelId(routerId, interfaceName, "", ""),
        routerId,
        interfaceName,
        peerPublicKey: null,
        allowedAddress: null,
        endpoint: null,
        lastHandshakeAt: null,
        rxBytes: 0,
        txBytes: 0,
        status: "interface_only",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const deleteStatement = db.prepare("DELETE FROM tb_tuneles WHERE router_id = ?");
  const insertStatement = db.prepare(`
    INSERT INTO tb_tuneles (
      id,
      router_id,
      interface_name,
      peer_public_key,
      allowed_address,
      endpoint,
      last_handshake_at,
      rx_bytes,
      tx_bytes,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    deleteStatement.run(routerId);
    for (const row of rows) {
      insertStatement.run(
        row.id,
        row.routerId,
        row.interfaceName,
        row.peerPublicKey,
        row.allowedAddress,
        row.endpoint,
        row.lastHandshakeAt,
        row.rxBytes,
        row.txBytes,
        row.status,
        row.createdAt,
        row.updatedAt
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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

function decryptSecret(secretEncrypted) {
  return safeStorage.decryptString(Buffer.from(secretEncrypted, "base64"));
}

function markRouterOffline(routerId, message) {
  const now = new Date().toISOString();
  const cleanMessage = message || "Conexion fallida.";

  db.prepare(`
    UPDATE tb_config_router
    SET status = 'offline',
        last_error = ?,
        updated_at = ?
    WHERE id = ?
  `).run(cleanMessage, now, routerId);

  insertLog(routerId, "routeros-api", "error", cleanMessage);
}

function insertLog(routerId, source, level, message) {
  db.prepare(`
    INSERT INTO tb_logs_eventos (id, router_id, source, level, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), routerId, source, level, message, new Date().toISOString());
}

function buildEndpoint(peer) {
  const address = peer["endpoint-address"];
  const port = peer["endpoint-port"];

  if (address && port) {
    return `${address}:${port}`;
  }

  return address || null;
}

function createTunnelId(routerId, interfaceName, publicKey, allowedAddress) {
  return createHash("sha256")
    .update(`${routerId}:${interfaceName}:${publicKey}:${allowedAddress}`)
    .digest("hex");
}

function toInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
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
    lastError: row.lastError,
    routerIdentity: row.routerIdentity,
    routerVersion: row.routerVersion,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tunnelCount: Number(row.tunnelCount || 0)
  };
}

function runMigrations() {
  ensureColumn("tb_config_router", "last_error", "TEXT");
  ensureColumn("tb_config_router", "router_identity", "TEXT");
  ensureColumn("tb_config_router", "router_version", "TEXT");
  ensureColumn("tb_config_router", "last_sync_at", "TEXT");
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
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
