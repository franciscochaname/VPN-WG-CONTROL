const { safeStorage } = require("electron");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { fetchWireGuardState, testRouterConnection } = require("./routerosClient.cjs");
const { diagnoseRouterServices } = require("./serviceDiagnostics.cjs");

let db;
let databaseFilePath;

function initializeDatabase(userDataPath) {
  const databaseDir = path.join(userDataPath, "data");
  fs.mkdirSync(databaseDir, { recursive: true });

  databaseFilePath = path.join(databaseDir, "vpn-wg-control.sqlite");
  db = new DatabaseSync(databaseFilePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tb_config_router (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      host TEXT NOT NULL,
      api_port INTEGER NOT NULL DEFAULT 8728,
      webfig_port INTEGER NOT NULL DEFAULT 8443,
      webfig_tls INTEGER NOT NULL DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS tb_diagnosticos (
      id TEXT PRIMARY KEY,
      router_id TEXT NOT NULL,
      service_key TEXT NOT NULL,
      service_label TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tuneles_router_id ON tb_tuneles(router_id);
    CREATE INDEX IF NOT EXISTS idx_logs_router_id ON tb_logs_eventos(router_id);
    CREATE INDEX IF NOT EXISTS idx_diagnosticos_router_id ON tb_diagnosticos(router_id);
  `);
  runMigrations();
}

function registerRouterHandlers(ipcMain) {
  ipcMain.handle("routers:list", () => listRouters());
  ipcMain.handle("routers:create", (_event, payload) => createRouter(payload));
  ipcMain.handle("routers:remove", (_event, routerId) => removeRouter(routerId));
  ipcMain.handle("routers:test-connection", (_event, routerId) => testConnection(routerId));
  ipcMain.handle("routers:sync-wireguard", (_event, routerId) => syncWireGuard(routerId));
  ipcMain.handle("routers:diagnose-services", (_event, routerId) => diagnoseServices(routerId));
  ipcMain.handle("dashboard:snapshot", () => getDashboardSnapshot());
  ipcMain.handle("security:health", () => getSecurityHealth());
  ipcMain.handle("wireguard:list-tunnels", (_event, routerId) => listWireGuardTunnels(routerId));
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
        r.webfig_port AS webfigPort,
        r.webfig_tls AS webfigTls,
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
        COUNT(DISTINCT t.id) AS tunnelCount,
        MAX(d.created_at) AS lastDiagnosticAt
      FROM tb_config_router r
      LEFT JOIN tb_tuneles t ON t.router_id = r.id
      LEFT JOIN tb_diagnosticos d ON d.router_id = r.id
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
      webfig_port,
      webfig_tls,
      username,
      auth_type,
      secret_encrypted,
      use_tls,
      monitor_wireguard,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    router.id,
    router.alias,
    router.host,
    router.apiPort,
    router.webfigPort,
    router.webfigTls ? 1 : 0,
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

async function diagnoseServices(routerId) {
  assertDatabase();
  const router = getRouterWithSecret(routerId);
  const results = await diagnoseRouterServices(router);
  const now = new Date().toISOString();
  const deleteStatement = db.prepare("DELETE FROM tb_diagnosticos WHERE router_id = ?");
  const insertStatement = db.prepare(`
    INSERT INTO tb_diagnosticos (
      id,
      router_id,
      service_key,
      service_label,
      host,
      port,
      protocol,
      status,
      detail,
      latency_ms,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    deleteStatement.run(routerId);
    for (const result of results) {
      insertStatement.run(
        randomUUID(),
        routerId,
        result.key,
        result.label,
        result.host,
        result.port,
        result.protocol,
        result.status,
        result.detail,
        result.latencyMs,
        now
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const openServices = results.filter((result) => result.status === "open").map((result) => `${result.label}:${result.port}`);
  insertLog(
    routerId,
    "service-diagnostics",
    openServices.length > 0 ? "info" : "warning",
    openServices.length > 0
      ? `Diagnostico finalizado. Servicios abiertos: ${openServices.join(", ")}.`
      : "Diagnostico finalizado sin servicios abiertos."
  );

  return {
    router: listRouters().find((item) => item.id === routerId),
    diagnostics: getLatestDiagnostics(routerId)
  };
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

function getSecurityHealth() {
  assertDatabase();
  const canary = `vpn-wg-control:${randomUUID()}`;
  let canEncryptDecrypt = false;
  let encryptionError = null;

  try {
    const encrypted = encryptSecret(canary);
    canEncryptDecrypt = decryptSecret(encrypted) === canary;
  } catch (error) {
    encryptionError = error.message;
  }

  const credentialStats = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN LENGTH(secret_encrypted) > 0 THEN 1 ELSE 0 END) AS encrypted
      FROM tb_config_router
    `)
    .get();

  return {
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    canEncryptDecrypt,
    encryptionError,
    databasePath: databaseFilePath,
    credentialCount: Number(credentialStats.total || 0),
    encryptedCredentialCount: Number(credentialStats.encrypted || 0),
    secretsExposedToRenderer: false,
    contextIsolation: true,
    nodeIntegration: false
  };
}

function listWireGuardTunnels(routerId) {
  assertDatabase();
  const params = [];
  let where = "";

  if (routerId) {
    where = "WHERE t.router_id = ?";
    params.push(routerId);
  }

  return db
    .prepare(`
      SELECT
        t.id,
        t.router_id AS routerId,
        r.alias AS routerAlias,
        r.host AS routerHost,
        t.interface_name AS interfaceName,
        t.peer_public_key AS peerPublicKey,
        t.allowed_address AS allowedAddress,
        t.endpoint,
        t.last_handshake_at AS lastHandshakeAt,
        t.rx_bytes AS rxBytes,
        t.tx_bytes AS txBytes,
        t.status,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM tb_tuneles t
      INNER JOIN tb_config_router r ON r.id = t.router_id
      ${where}
      ORDER BY r.alias, t.interface_name, t.allowed_address
    `)
    .all(...params)
    .map((row) => ({
      id: row.id,
      routerId: row.routerId,
      routerAlias: row.routerAlias,
      routerHost: row.routerHost,
      interfaceName: row.interfaceName,
      peerPublicKey: row.peerPublicKey,
      allowedAddress: row.allowedAddress,
      endpoint: row.endpoint,
      lastHandshakeAt: row.lastHandshakeAt,
      rxBytes: Number(row.rxBytes || 0),
      txBytes: Number(row.txBytes || 0),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
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
        webfig_port AS webfigPort,
        webfig_tls AS webfigTls,
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
    webfigTls: Boolean(router.webfigTls),
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
  const webfigPort = Number(payload.webfigPort || 8443);
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

  if (!Number.isInteger(webfigPort) || webfigPort < 1 || webfigPort > 65535) {
    throw new Error("El puerto WebFig debe estar entre 1 y 65535.");
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
    webfigPort,
    username,
    secret,
    authType,
    useTls: Boolean(payload.useTls),
    webfigTls: payload.webfigTls !== false,
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
    webfigPort: row.webfigPort,
    webfigTls: Boolean(row.webfigTls),
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
    tunnelCount: Number(row.tunnelCount || 0),
    lastDiagnosticAt: row.lastDiagnosticAt,
    diagnostics: getLatestDiagnostics(row.id)
  };
}

function runMigrations() {
  ensureColumn("tb_config_router", "webfig_port", "INTEGER NOT NULL DEFAULT 8443");
  ensureColumn("tb_config_router", "webfig_tls", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("tb_config_router", "last_error", "TEXT");
  ensureColumn("tb_config_router", "router_identity", "TEXT");
  ensureColumn("tb_config_router", "router_version", "TEXT");
  ensureColumn("tb_config_router", "last_sync_at", "TEXT");
}

function getLatestDiagnostics(routerId) {
  return db
    .prepare(`
      SELECT
        service_key AS key,
        service_label AS label,
        host,
        port,
        protocol,
        status,
        detail,
        latency_ms AS latencyMs,
        created_at AS createdAt
      FROM tb_diagnosticos
      WHERE router_id = ?
      ORDER BY service_label
    `)
    .all(routerId);
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
