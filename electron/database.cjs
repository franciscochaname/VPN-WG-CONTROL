const { safeStorage } = require("electron");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  addFirewallNatRule,
  addFirewallFilterRule,
  addIpRoute,
  addWireGuardPeer,
  fetchFirewallState,
  fetchIpInventory,
  fetchWireGuardState,
  testRouterConnection
} = require("./routerosClient.cjs");
const { getEventServerStatus } = require("./eventServer.cjs");
const { diagnoseRouterServices } = require("./serviceDiagnostics.cjs");
const { generateWireGuardKeyPair } = require("./wireguardKeys.cjs");

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

    CREATE TABLE IF NOT EXISTS tb_wireguard_keys (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT NOT NULL,
      assigned_router_id TEXT,
      assigned_tunnel_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (assigned_router_id) REFERENCES tb_config_router(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_tunnel_id) REFERENCES tb_tuneles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tb_firewall_rules (
      id TEXT PRIMARY KEY,
      router_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      rule_id TEXT,
      order_index INTEGER NOT NULL,
      chain TEXT,
      action TEXT,
      protocol TEXT,
      src_address TEXT,
      dst_address TEXT,
      dst_port TEXT,
      in_interface TEXT,
      out_interface TEXT,
      connection_state TEXT,
      comment TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tb_telemetry_samples (
      id TEXT PRIMARY KEY,
      router_id TEXT NOT NULL,
      tunnel_id TEXT NOT NULL,
      interface_name TEXT NOT NULL,
      allowed_address TEXT,
      rx_bytes INTEGER NOT NULL DEFAULT 0,
      tx_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      last_handshake_at TEXT,
      sampled_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tb_ip_segments (
      id TEXT PRIMARY KEY,
      router_id TEXT,
      label TEXT NOT NULL,
      cidr TEXT NOT NULL,
      gateway TEXT,
      interface_name TEXT,
      purpose TEXT NOT NULL DEFAULT 'unknown',
      vlan_id TEXT,
      trunk_name TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tb_orchestration_runs (
      id TEXT PRIMARY KEY,
      router_id TEXT NOT NULL,
      vpn_type TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (router_id) REFERENCES tb_config_router(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tuneles_router_id ON tb_tuneles(router_id);
    CREATE INDEX IF NOT EXISTS idx_logs_router_id ON tb_logs_eventos(router_id);
    CREATE INDEX IF NOT EXISTS idx_diagnosticos_router_id ON tb_diagnosticos(router_id);
    CREATE INDEX IF NOT EXISTS idx_wireguard_keys_router_id ON tb_wireguard_keys(assigned_router_id);
    CREATE INDEX IF NOT EXISTS idx_firewall_rules_router_id ON tb_firewall_rules(router_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_samples_router_id ON tb_telemetry_samples(router_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_samples_tunnel_id ON tb_telemetry_samples(tunnel_id);
    CREATE INDEX IF NOT EXISTS idx_ip_segments_router_id ON tb_ip_segments(router_id);
    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_router_id ON tb_orchestration_runs(router_id);
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
  ipcMain.handle("wireguard:add-peer", (_event, payload) => createWireGuardPeer(payload));
  ipcMain.handle("wireguard:orchestrate", (_event, payload) => orchestrateWireGuardVpn(payload));
  ipcMain.handle("wireguard-keys:list", () => listWireGuardKeys());
  ipcMain.handle("wireguard-keys:generate", (_event, payload) => createWireGuardKey(payload));
  ipcMain.handle("wireguard-keys:remove", (_event, keyId) => removeWireGuardKey(keyId));
  ipcMain.handle("firewall:list", (_event, routerId) => listFirewall(routerId));
  ipcMain.handle("firewall:sync", (_event, routerId) => syncFirewall(routerId));
  ipcMain.handle("firewall:apply-preset", (_event, payload) => applyFirewallPreset(payload));
  ipcMain.handle("events:status", () => getLiveEventStatus());
  ipcMain.handle("events:list", (_event, limit) => listLiveEvents(limit));
  ipcMain.handle("ipam:list", (_event, routerId) => listIpSegments(routerId));
  ipcMain.handle("ipam:sync", (_event, routerId) => syncIpInventory(routerId));
  ipcMain.handle("ipam:create", (_event, payload) => createIpSegment(payload));
  ipcMain.handle("ipam:remove", (_event, segmentId) => removeIpSegment(segmentId));
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
  const tunnels = listWireGuardTunnels();
  const tunnelCount = db.prepare("SELECT COUNT(*) AS total FROM tb_tuneles").get().total;
  const eventCount = db.prepare("SELECT COUNT(*) AS total FROM tb_logs_eventos").get().total;
  const segmentCount = db.prepare("SELECT COUNT(*) AS total FROM tb_ip_segments").get().total;
  const monitoring = buildMonitoringSnapshot(routers, tunnels);

  return {
    routers,
    tunnels,
    monitoring,
    metrics: {
      routers: routers.length,
      tunnels: tunnelCount,
      events: eventCount,
      pendingConnections: routers.filter((router) => router.status === "pending_connection").length,
      onlineRouters: routers.filter((router) => router.status === "online").length,
      offlineRouters: routers.filter((router) => router.status === "offline").length,
      totalRxBytes: monitoring.totalRxBytes,
      totalTxBytes: monitoring.totalTxBytes,
      throughputBps: monitoring.throughputBps,
      handshakeMissing: monitoring.handshakeMissing,
      ipSegments: Number(segmentCount || 0)
    }
  };
}

function buildMonitoringSnapshot(routers, tunnels) {
  const samples = db
    .prepare(`
      SELECT
        router_id AS routerId,
        tunnel_id AS tunnelId,
        rx_bytes AS rxBytes,
        tx_bytes AS txBytes,
        status,
        sampled_at AS sampledAt
      FROM tb_telemetry_samples
      ORDER BY sampled_at DESC
      LIMIT 600
    `)
    .all()
    .map((row) => ({
      ...row,
      rxBytes: Number(row.rxBytes || 0),
      txBytes: Number(row.txBytes || 0)
    }));
  const sampleStats = db.prepare("SELECT COUNT(*) AS total, MAX(sampled_at) AS latestSampleAt FROM tb_telemetry_samples").get();
  const findings = [];
  const offlineRouters = routers.filter((router) => router.status === "offline");
  const pendingRouters = routers.filter((router) => router.status === "pending_connection");
  const staleRouters = routers.filter((router) => router.lastSyncAt && minutesSince(router.lastSyncAt) > 5);
  const handshakeMissing = tunnels.filter((tunnel) => tunnel.status !== "interface_only" && !tunnel.lastHandshakeAt).length;
  const totalRxBytes = tunnels.reduce((total, tunnel) => total + Number(tunnel.rxBytes || 0), 0);
  const totalTxBytes = tunnels.reduce((total, tunnel) => total + Number(tunnel.txBytes || 0), 0);
  const throughputBps = calculateThroughput(samples);
  const anomalyFindings = detectTelemetryAnomalies(samples, tunnels);
  const firewallWarnings = routers.flatMap((router) =>
    listFirewall(router.id).findings.filter((finding) => finding.severity === "warning" || finding.severity === "error")
  );

  if (routers.length === 0) {
    findings.push({
      severity: "info",
      title: "Sin routers para monitorear",
      detail: "El entrenamiento inteligente inicia cuando registres y sincronices un router real."
    });
  }

  if (pendingRouters.length > 0) {
    findings.push({
      severity: "warning",
      title: "Routers sin validar",
      detail: `${pendingRouters.length} router(s) estan pendientes de prueba API antes de monitorear tuneles.`
    });
  }

  if (offlineRouters.length > 0) {
    findings.push({
      severity: "error",
      title: "Routers offline",
      detail: `${offlineRouters.length} router(s) no respondieron en la ultima prueba o sincronizacion.`
    });
  }

  if (staleRouters.length > 0) {
    findings.push({
      severity: "warning",
      title: "Telemetria desactualizada",
      detail: `${staleRouters.length} router(s) tienen mas de 5 minutos sin sincronizar WireGuard.`
    });
  }

  if (handshakeMissing > 0) {
    findings.push({
      severity: "warning",
      title: "Peers sin handshake",
      detail: `${handshakeMissing} peer(s) no reportan ultimo handshake en la lectura real.`
    });
  }

  if (firewallWarnings.length > 0) {
    findings.push({
      severity: "warning",
      title: "Firewall puede interferir",
      detail: `${firewallWarnings.length} hallazgo(s) de firewall requieren revision antes de asumir falla del tunel.`
    });
  }

  findings.push(...anomalyFindings);

  if (findings.length === 0 && tunnels.length > 0) {
    findings.push({
      severity: "ok",
      title: "Monitoreo sin anomalias evidentes",
      detail: "Los tuneles sincronizados no muestran bloqueos ni cambios de trafico fuera del baseline local."
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    eventServer: getEventServerStatus(),
    latestSampleAt: sampleStats.latestSampleAt || null,
    sampleCount: Number(sampleStats.total || 0),
    confidence: calculateMonitoringConfidence(Number(sampleStats.total || 0), tunnels.length),
    mode: Number(sampleStats.total || 0) >= Math.max(8, tunnels.length * 4) ? "baseline" : "training",
    totalRxBytes,
    totalTxBytes,
    throughputBps,
    handshakeMissing,
    activeTunnels: tunnels.filter((tunnel) => tunnel.lastHandshakeAt).length,
    findings
  };
}

function calculateThroughput(samples) {
  const grouped = groupSamplesByTunnel(samples);
  let bytesPerSecond = 0;

  for (const tunnelSamples of grouped.values()) {
    if (tunnelSamples.length < 2) {
      continue;
    }

    const [latest, previous] = tunnelSamples;
    const seconds = secondsBetween(latest.sampledAt, previous.sampledAt);
    const delta = byteDelta(latest, previous);

    if (seconds > 0 && delta >= 0) {
      bytesPerSecond += delta / seconds;
    }
  }

  return Math.round(bytesPerSecond);
}

function detectTelemetryAnomalies(samples, tunnels) {
  const grouped = groupSamplesByTunnel(samples);
  const findings = [];
  let trainingTunnels = 0;

  for (const tunnel of tunnels) {
    const tunnelSamples = grouped.get(tunnel.id) || [];

    if (tunnelSamples.length > 0 && tunnelSamples.length < 6) {
      trainingTunnels += 1;
      continue;
    }

    if (tunnelSamples.length < 6) {
      continue;
    }

    const currentDelta = byteDelta(tunnelSamples[0], tunnelSamples[1]);
    const baseline = [];

    for (let index = 1; index < tunnelSamples.length - 1; index += 1) {
      const delta = byteDelta(tunnelSamples[index], tunnelSamples[index + 1]);

      if (delta >= 0) {
        baseline.push(delta);
      }
    }

    const average = baseline.reduce((total, delta) => total + delta, 0) / Math.max(1, baseline.length);

    if (average > 0 && currentDelta > average * 3 && currentDelta > 50000) {
      findings.push({
        severity: "warning",
        title: "Pico de trafico WireGuard",
        detail: `${tunnel.allowedAddress || tunnel.interfaceName} supera 3x su baseline local de trafico.`
      });
    }

    if (average > 10000 && currentDelta === 0) {
      findings.push({
        severity: "warning",
        title: "Tunel en silencio",
        detail: `${tunnel.allowedAddress || tunnel.interfaceName} tenia trafico habitual y la ultima muestra no aumento bytes.`
      });
    }
  }

  if (trainingTunnels > 0) {
    findings.push({
      severity: "training",
      title: "Baseline en entrenamiento",
      detail: `${trainingTunnels} tunel(es) necesitan al menos 6 muestras reales para detectar anomalias de trafico.`
    });
  }

  return findings;
}

function groupSamplesByTunnel(samples) {
  const grouped = new Map();

  for (const sample of samples) {
    if (!grouped.has(sample.tunnelId)) {
      grouped.set(sample.tunnelId, []);
    }

    grouped.get(sample.tunnelId).push(sample);
  }

  return grouped;
}

function byteDelta(latest, previous) {
  return latest.rxBytes + latest.txBytes - previous.rxBytes - previous.txBytes;
}

function secondsBetween(latestIso, previousIso) {
  const latest = Date.parse(latestIso);
  const previous = Date.parse(previousIso);

  if (!Number.isFinite(latest) || !Number.isFinite(previous)) {
    return 0;
  }

  return Math.max(0, (latest - previous) / 1000);
}

function minutesSince(isoDate) {
  const timestamp = Date.parse(isoDate);

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return (Date.now() - timestamp) / 60000;
}

function calculateMonitoringConfidence(sampleCount, tunnelCount) {
  if (tunnelCount === 0) {
    return sampleCount > 0 ? 20 : 0;
  }

  return Math.min(95, Math.round((sampleCount / Math.max(8, tunnelCount * 6)) * 100));
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
  const keyStats = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN LENGTH(private_key_encrypted) > 0 THEN 1 ELSE 0 END) AS encrypted
      FROM tb_wireguard_keys
    `)
    .get();

  return {
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    canEncryptDecrypt,
    encryptionError,
    databasePath: databaseFilePath,
    credentialCount: Number(credentialStats.total || 0),
    encryptedCredentialCount: Number(credentialStats.encrypted || 0),
    wireGuardKeyCount: Number(keyStats.total || 0),
    encryptedWireGuardKeyCount: Number(keyStats.encrypted || 0),
    secretsExposedToRenderer: false,
    contextIsolation: true,
    nodeIntegration: false
  };
}

function listWireGuardKeys() {
  assertDatabase();

  return db
    .prepare(`
      SELECT
        k.id,
        k.label,
        k.public_key AS publicKey,
        k.assigned_router_id AS assignedRouterId,
        r.alias AS assignedRouterAlias,
        k.assigned_tunnel_id AS assignedTunnelId,
        k.created_at AS createdAt,
        k.updated_at AS updatedAt
      FROM tb_wireguard_keys k
      LEFT JOIN tb_config_router r ON r.id = k.assigned_router_id
      ORDER BY k.created_at DESC
    `)
    .all();
}

async function createWireGuardPeer(payload = {}) {
  assertDatabase();
  const peer = validateWireGuardPeerPayload(payload);
  const router = getRouterWithSecret(peer.routerId);

  if (!router.monitorWireGuard) {
    throw new Error("El monitoreo WireGuard no esta habilitado para este router.");
  }

  try {
    await addWireGuardPeer(toConnectionConfig(router), peer);
    insertLog(peer.routerId, "wireguard-peer", "info", `Peer agregado en ${peer.interfaceName}: ${peer.allowedAddress}.`);
    return await syncWireGuard(peer.routerId);
  } catch (error) {
    markRouterOffline(peer.routerId, error.message);
    throw error;
  }
}

async function orchestrateWireGuardVpn(payload = {}) {
  assertDatabase();
  const plan = validateVpnOrchestrationPayload(payload);
  const router = getRouterWithSecret(plan.routerId);
  const steps = [];
  const runId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tb_orchestration_runs (id, router_id, vpn_type, label, status, steps_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(runId, plan.routerId, plan.vpnType, plan.label, "running", JSON.stringify(steps), now);

  try {
    await runOrchestrationStep(steps, "peer", "Crear peer WireGuard", () =>
      addWireGuardPeer(toConnectionConfig(router), plan.peer)
    );

    for (const rule of buildOrchestrationFilterRules(router, plan)) {
      await runOrchestrationStep(steps, "firewall-filter", rule.comment, () =>
        addFirewallFilterRule(toConnectionConfig(router), rule)
      );
    }

    for (const route of buildOrchestrationRoutes(plan)) {
      await runOrchestrationStep(steps, "route", route.comment, () =>
        addIpRoute(toConnectionConfig(router), route)
      );
    }

    for (const rule of buildOrchestrationNatRules(plan)) {
      await runOrchestrationStep(steps, "firewall-nat", rule.comment, () =>
        addFirewallNatRule(toConnectionConfig(router), rule)
      );
    }

    await runOrchestrationStep(steps, "verify-wireguard", "Verificar peer en lectura WireGuard", async () => {
      const state = await fetchWireGuardState(toConnectionConfig(router));
      replaceWireGuardTunnels(plan.routerId, state, new Date().toISOString());
      return { peers: state.peers.length };
    });

    await runOrchestrationStep(steps, "verify-firewall", "Verificar reglas firewall", async () => {
      const state = await fetchFirewallState(toConnectionConfig(router));
      replaceFirewallRules(plan.routerId, "filter", state.filter, new Date().toISOString());
      replaceFirewallRules(plan.routerId, "nat", state.nat, new Date().toISOString());
      return { filter: state.filter.length, nat: state.nat.length };
    });

    const completedAt = new Date().toISOString();
    db.prepare(`
      UPDATE tb_orchestration_runs
      SET status = 'completed', steps_json = ?, completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(steps), completedAt, runId);

    insertLog(plan.routerId, "vpn-orchestrator", "info", `VPN ${plan.label} creada como ${plan.vpnType}.`);

    return {
      runId,
      status: "completed",
      steps,
      snapshot: getDashboardSnapshot(),
      firewall: listFirewall(plan.routerId)
    };
  } catch (error) {
    steps.push({
      key: "failed",
      label: "Orquestacion detenida",
      status: "error",
      detail: error.message
    });

    db.prepare(`
      UPDATE tb_orchestration_runs
      SET status = 'failed', steps_json = ?, completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(steps), new Date().toISOString(), runId);

    insertLog(plan.routerId, "vpn-orchestrator", "error", error.message);
    throw error;
  }
}

async function runOrchestrationStep(steps, key, label, action) {
  const startedAt = new Date().toISOString();

  try {
    const result = await action();
    steps.push({
      key,
      label,
      status: "ok",
      startedAt,
      completedAt: new Date().toISOString(),
      result
    });
    return result;
  } catch (error) {
    steps.push({
      key,
      label,
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      detail: error.message
    });
    throw error;
  }
}

function createWireGuardKey(payload = {}) {
  assertDatabase();
  const label = cleanText(payload.label) || `Llave WireGuard ${new Date().toLocaleString("es-PE")}`;
  const assignedRouterId = cleanText(payload.assignedRouterId) || null;
  const keyPair = generateWireGuardKeyPair();
  const now = new Date().toISOString();
  const keyId = randomUUID();

  if (assignedRouterId) {
    assertRouterExists(assignedRouterId);
  }

  db.prepare(`
    INSERT INTO tb_wireguard_keys (
      id,
      label,
      public_key,
      private_key_encrypted,
      assigned_router_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    keyId,
    label,
    keyPair.publicKey,
    encryptSecret(keyPair.privateKey),
    assignedRouterId,
    now,
    now
  );

  insertLog(assignedRouterId, "wireguard-keys", "info", `Llave WireGuard generada localmente: ${label}.`);
  return listWireGuardKeys().find((item) => item.id === keyId);
}

function removeWireGuardKey(keyId) {
  assertDatabase();

  if (!keyId || typeof keyId !== "string") {
    throw new Error("Llave WireGuard invalida.");
  }

  db.prepare("DELETE FROM tb_wireguard_keys WHERE id = ?").run(keyId);
  return { ok: true };
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

async function syncFirewall(routerId) {
  assertDatabase();
  const router = getRouterWithSecret(routerId);

  try {
    const state = await fetchFirewallState(toConnectionConfig(router));
    const now = new Date().toISOString();

    replaceFirewallRules(routerId, "filter", state.filter, now);
    replaceFirewallRules(routerId, "nat", state.nat, now);
    insertLog(routerId, "firewall-sync", "info", `Firewall sincronizado: ${state.filter.length} filter, ${state.nat.length} nat.`);

    return listFirewall(routerId);
  } catch (error) {
    markRouterOffline(routerId, error.message);
    throw error;
  }
}

function listFirewall(routerId) {
  assertDatabase();

  if (!routerId) {
    return {
      rules: [],
      findings: []
    };
  }

  const rules = db
    .prepare(`
      SELECT
        id,
        router_id AS routerId,
        table_name AS tableName,
        rule_id AS ruleId,
        order_index AS orderIndex,
        chain,
        action,
        protocol,
        src_address AS srcAddress,
        dst_address AS dstAddress,
        dst_port AS dstPort,
        in_interface AS inInterface,
        out_interface AS outInterface,
        connection_state AS connectionState,
        comment,
        disabled,
        synced_at AS syncedAt
      FROM tb_firewall_rules
      WHERE router_id = ?
      ORDER BY table_name, order_index
    `)
    .all(routerId)
    .map((row) => ({
      ...row,
      disabled: Boolean(row.disabled)
    }));

  return {
    rules,
    findings: analyzeFirewall(routerId, rules)
  };
}

async function applyFirewallPreset(payload = {}) {
  assertDatabase();
  const routerId = cleanText(payload.routerId);
  const preset = cleanText(payload.preset);
  const router = getRouterWithSecret(routerId);
  const rule = buildFirewallPresetRule(router, preset, payload);

  try {
    await addFirewallFilterRule(toConnectionConfig(router), rule);
    insertLog(routerId, "firewall-apply", "info", `Regla firewall aplicada: ${rule.comment}.`);
    return await syncFirewall(routerId);
  } catch (error) {
    markRouterOffline(routerId, error.message);
    throw error;
  }
}

function replaceFirewallRules(routerId, tableName, rows, syncedAt) {
  const deleteStatement = db.prepare("DELETE FROM tb_firewall_rules WHERE router_id = ? AND table_name = ?");
  const insertStatement = db.prepare(`
    INSERT INTO tb_firewall_rules (
      id,
      router_id,
      table_name,
      rule_id,
      order_index,
      chain,
      action,
      protocol,
      src_address,
      dst_address,
      dst_port,
      in_interface,
      out_interface,
      connection_state,
      comment,
      disabled,
      raw_json,
      synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    deleteStatement.run(routerId, tableName);
    rows.forEach((row, index) => {
      insertStatement.run(
        randomUUID(),
        routerId,
        tableName,
        row[".id"] || null,
        index,
        row.chain || null,
        row.action || null,
        row.protocol || null,
        row["src-address"] || null,
        row["dst-address"] || null,
        row["dst-port"] || null,
        row["in-interface"] || null,
        row["out-interface"] || null,
        row["connection-state"] || null,
        row.comment || null,
        row.disabled === "true" ? 1 : 0,
        JSON.stringify(row),
        syncedAt
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function analyzeFirewall(routerId, rules) {
  const router = listRouters().find((item) => item.id === routerId);
  const tunnels = listWireGuardTunnels(routerId);
  const findings = [];
  const filterRules = rules.filter((rule) => rule.tableName === "filter" && !rule.disabled);
  const natRules = rules.filter((rule) => rule.tableName === "nat" && !rule.disabled);
  const firstInputDrop = filterRules.findIndex((rule) => rule.chain === "input" && isDropAction(rule.action));
  const firstForwardDrop = filterRules.findIndex((rule) => rule.chain === "forward" && isDropAction(rule.action));

  if (router && firstInputDrop !== -1 && !hasAcceptBefore(filterRules, firstInputDrop, {
    chain: "input",
    protocol: "tcp",
    dstPort: String(router.apiPort)
  })) {
    findings.push({
      severity: "warning",
      title: "API puede estar bloqueada",
      detail: `Hay un drop/reject en input antes de una regla accept para TCP ${router.apiPort}. Esto puede impedir que la app gestione el router.`
    });
  }

  const wireGuardPortFindings = findWireGuardPortCandidates(filterRules);
  if (firstInputDrop !== -1 && wireGuardPortFindings.length === 0) {
    findings.push({
      severity: "info",
      title: "Puerto WireGuard no identificado",
      detail: "No se encontro una regla accept UDP para WireGuard antes de los drops de input. Si los clientes no conectan, agrega una regla allow para el puerto listen del tunel."
    });
  }

  if (tunnels.length > 0 && firstForwardDrop !== -1) {
    const missingForward = tunnels.filter((tunnel) => !hasForwardAcceptForAddress(filterRules, firstForwardDrop, tunnel.allowedAddress));

    if (missingForward.length > 0) {
      findings.push({
        severity: "warning",
        title: "Forward puede limitar tuneles",
        detail: `${missingForward.length} allowed-address no tienen accept claro antes del primer drop/reject en forward.`
      });
    }
  }

  if (tunnels.length > 0 && !natRules.some((rule) => rule.chain === "srcnat" && ["masquerade", "src-nat"].includes(rule.action))) {
    findings.push({
      severity: "info",
      title: "NAT no detectado",
      detail: "No hay srcnat masquerade/src-nat activo. Si los peers necesitan salir a internet o redes no enrutadas, revisa NAT o rutas."
    });
  }

  if (findings.length === 0 && rules.length > 0) {
    findings.push({
      severity: "ok",
      title: "Sin interferencias evidentes",
      detail: "Con las reglas sincronizadas no se detectaron bloqueos obvios para API, WireGuard o forward de tuneles."
    });
  }

  return findings;
}

function buildFirewallPresetRule(router, preset, payload) {
  const srcAddress = cleanText(payload.srcAddress);
  const wireGuardPort = payload.wireGuardPort ? Number(payload.wireGuardPort) : null;
  const commentSuffix = "VPN WG CONTROL";

  if (preset === "allow-api") {
    return {
      chain: "input",
      action: "accept",
      protocol: "tcp",
      dstPort: String(router.apiPort),
      srcAddress,
      comment: `Allow API ${commentSuffix}`
    };
  }

  if (preset === "allow-wireguard") {
    if (!Number.isInteger(wireGuardPort) || wireGuardPort < 1 || wireGuardPort > 65535) {
      throw new Error("Ingresa un puerto UDP WireGuard valido.");
    }

    return {
      chain: "input",
      action: "accept",
      protocol: "udp",
      dstPort: String(wireGuardPort),
      srcAddress,
      comment: `Allow WireGuard UDP ${commentSuffix}`
    };
  }

  if (preset === "allow-webfig") {
    return {
      chain: "input",
      action: "accept",
      protocol: "tcp",
      dstPort: String(router.webfigPort),
      srcAddress,
      comment: `Allow WebFig ${commentSuffix}`
    };
  }

  if (preset === "allow-forward-peer") {
    if (!srcAddress) {
      throw new Error("Ingresa el allowed-address del peer para permitir forward.");
    }

    return {
      chain: "forward",
      action: "accept",
      srcAddress,
      comment: `Allow peer forward ${commentSuffix}`
    };
  }

  if (preset === "allow-forward-established") {
    return {
      chain: "forward",
      action: "accept",
      connectionState: "established,related",
      comment: `Allow established forward ${commentSuffix}`
    };
  }

  throw new Error("Preset firewall no soportado.");
}

function isDropAction(action) {
  return action === "drop" || action === "reject";
}

function hasAcceptBefore(rules, endIndex, matcher) {
  return rules.slice(0, endIndex).some((rule) => {
    if (rule.action !== "accept" || rule.chain !== matcher.chain) {
      return false;
    }

    if (matcher.protocol && rule.protocol && rule.protocol !== matcher.protocol) {
      return false;
    }

    if (matcher.dstPort && rule.dstPort && !portListIncludes(rule.dstPort, matcher.dstPort)) {
      return false;
    }

    return true;
  });
}

function hasForwardAcceptForAddress(rules, endIndex, allowedAddress) {
  if (!allowedAddress) {
    return false;
  }

  return rules.slice(0, endIndex).some((rule) => {
    if (rule.chain !== "forward" || rule.action !== "accept") {
      return false;
    }

    return rule.srcAddress === allowedAddress || rule.dstAddress === allowedAddress || (!rule.srcAddress && !rule.dstAddress);
  });
}

function findWireGuardPortCandidates(rules) {
  return rules.filter(
    (rule) =>
      rule.chain === "input" &&
      rule.action === "accept" &&
      rule.protocol === "udp" &&
      rule.dstPort &&
      /wireguard|wg/i.test(rule.comment || "")
  );
}

function portListIncludes(portList, port) {
  return String(portList)
    .split(",")
    .map((item) => item.trim())
    .includes(String(port));
}

function validateWireGuardPeerPayload(payload) {
  const routerId = cleanText(payload.routerId);
  const interfaceName = cleanText(payload.interfaceName);
  const keyId = cleanText(payload.keyId);
  const manualPublicKey = cleanText(payload.publicKey);
  const allowedAddress = cleanText(payload.allowedAddress);
  const endpointAddress = cleanText(payload.endpointAddress);
  const endpointPort = payload.endpointPort ? Number(payload.endpointPort) : null;
  const persistentKeepalive = cleanText(payload.persistentKeepalive);
  const comment = cleanText(payload.comment);
  const publicKey = keyId ? getPublicKeyFromVault(keyId) : manualPublicKey;

  if (!routerId) {
    throw new Error("Selecciona un router.");
  }

  if (!interfaceName) {
    throw new Error("Ingresa la interfaz WireGuard del router.");
  }

  if (!isWireGuardPublicKey(publicKey)) {
    throw new Error("La llave publica WireGuard debe tener formato base64 de 32 bytes.");
  }

  if (!allowedAddress) {
    throw new Error("Ingresa el allowed-address del peer.");
  }

  if (endpointPort !== null && (!Number.isInteger(endpointPort) || endpointPort < 1 || endpointPort > 65535)) {
    throw new Error("El puerto endpoint debe estar entre 1 y 65535.");
  }

  return {
    routerId,
    interfaceName,
    publicKey,
    allowedAddress,
    endpointAddress,
    endpointPort,
    persistentKeepalive,
    comment,
    disabled: Boolean(payload.disabled)
  };
}

function validateVpnOrchestrationPayload(payload = {}) {
  const vpnType = ["remote-access", "site-to-site", "branch-nat", "trunk"].includes(payload.vpnType)
    ? payload.vpnType
    : "remote-access";
  const label = cleanText(payload.label) || `VPN ${new Date().toLocaleString("es-PE")}`;
  const peer = validateWireGuardPeerPayload({
    routerId: payload.routerId,
    interfaceName: payload.interfaceName,
    keyId: payload.keyId,
    publicKey: payload.publicKey,
    allowedAddress: payload.allowedAddress,
    endpointAddress: payload.endpointAddress,
    endpointPort: payload.endpointPort,
    persistentKeepalive: payload.persistentKeepalive,
    comment: cleanText(payload.comment) || `VPN WG CONTROL ${label}`,
    disabled: payload.disabled
  });
  const localSubnet = cleanText(payload.localSubnet);
  const remoteSubnet = cleanText(payload.remoteSubnet);
  const listenPort = payload.listenPort ? Number(payload.listenPort) : null;
  const routeDistance = payload.routeDistance ? Number(payload.routeDistance) : 1;
  const enableFirewall = payload.enableFirewall !== false;
  const enableNat = Boolean(payload.enableNat);

  if (listenPort !== null && (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535)) {
    throw new Error("El puerto publico WireGuard debe estar entre 1 y 65535.");
  }

  if (!Number.isInteger(routeDistance) || routeDistance < 1 || routeDistance > 255) {
    throw new Error("La distancia de ruta debe estar entre 1 y 255.");
  }

  if (["site-to-site", "branch-nat", "trunk"].includes(vpnType) && !remoteSubnet) {
    throw new Error("Ingresa la red remota para este tipo de VPN.");
  }

  return {
    routerId: peer.routerId,
    vpnType,
    label,
    peer,
    localSubnet,
    remoteSubnet,
    listenPort,
    routeDistance,
    enableFirewall,
    enableNat
  };
}

function buildOrchestrationFilterRules(router, plan) {
  if (!plan.enableFirewall) {
    return [];
  }

  const rules = [];
  const suffix = `VPN WG CONTROL ${plan.label}`;

  if (plan.listenPort) {
    rules.push({
      chain: "input",
      action: "accept",
      protocol: "udp",
      dstPort: String(plan.listenPort),
      comment: `Allow WireGuard UDP ${suffix}`
    });
  }

  rules.push({
    chain: "forward",
    action: "accept",
    connectionState: "established,related",
    comment: `Allow established forward ${suffix}`
  });

  if (plan.peer.allowedAddress) {
    rules.push({
      chain: "forward",
      action: "accept",
      srcAddress: plan.peer.allowedAddress,
      comment: `Allow peer source ${suffix}`
    });
    rules.push({
      chain: "forward",
      action: "accept",
      dstAddress: plan.peer.allowedAddress,
      comment: `Allow peer destination ${suffix}`
    });
  }

  if (plan.localSubnet && plan.remoteSubnet) {
    rules.push({
      chain: "forward",
      action: "accept",
      srcAddress: plan.localSubnet,
      dstAddress: plan.remoteSubnet,
      comment: `Allow local to remote ${suffix}`
    });
    rules.push({
      chain: "forward",
      action: "accept",
      srcAddress: plan.remoteSubnet,
      dstAddress: plan.localSubnet,
      comment: `Allow remote to local ${suffix}`
    });
  }

  if (router.apiPort) {
    rules.push({
      chain: "input",
      action: "accept",
      protocol: "tcp",
      dstPort: String(router.apiPort),
      comment: `Keep management API ${suffix}`
    });
  }

  return rules;
}

function buildOrchestrationRoutes(plan) {
  if (!["site-to-site", "branch-nat", "trunk"].includes(plan.vpnType) || !plan.remoteSubnet) {
    return [];
  }

  return [
    {
      dstAddress: plan.remoteSubnet,
      gateway: plan.peer.interfaceName,
      distance: String(plan.routeDistance),
      comment: `Route ${plan.remoteSubnet} VPN WG CONTROL ${plan.label}`
    }
  ];
}

function buildOrchestrationNatRules(plan) {
  if (!plan.enableNat && plan.vpnType !== "branch-nat") {
    return [];
  }

  return [
    {
      chain: "srcnat",
      action: "masquerade",
      srcAddress: plan.localSubnet || null,
      dstAddress: plan.remoteSubnet || plan.peer.allowedAddress || null,
      outInterface: plan.peer.interfaceName,
      comment: `Masquerade VPN WG CONTROL ${plan.label}`
    }
  ];
}

function getPublicKeyFromVault(keyId) {
  const row = db.prepare("SELECT public_key AS publicKey FROM tb_wireguard_keys WHERE id = ?").get(keyId);

  if (!row) {
    throw new Error("Llave WireGuard no encontrada.");
  }

  return row.publicKey;
}

function isWireGuardPublicKey(value) {
  return /^[A-Za-z0-9+/]{43}=$/.test(value || "");
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
    insertTelemetrySamples(routerId, rows, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertTelemetrySamples(routerId, rows, sampledAt) {
  if (rows.length === 0) {
    return;
  }

  const statement = db.prepare(`
    INSERT INTO tb_telemetry_samples (
      id,
      router_id,
      tunnel_id,
      interface_name,
      allowed_address,
      rx_bytes,
      tx_bytes,
      status,
      last_handshake_at,
      sampled_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    statement.run(
      randomUUID(),
      routerId,
      row.id,
      row.interfaceName,
      row.allowedAddress,
      row.rxBytes,
      row.txBytes,
      row.status,
      row.lastHandshakeAt,
      sampledAt
    );
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

function assertRouterExists(routerId) {
  const router = db.prepare("SELECT id FROM tb_config_router WHERE id = ?").get(routerId);

  if (!router) {
    throw new Error("Router asignado no encontrado.");
  }
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

function ingestLiveEvent(event = {}) {
  assertDatabase();
  const router = findRouterByRemoteAddress(event.remoteAddress);
  const level = ["info", "warning", "error"].includes(event.level) ? event.level : "info";
  const source = cleanText(event.source) || "live-event";
  const message = cleanText(event.message) || "Evento recibido.";

  insertLog(router?.id || null, source, level, message);
}

function getLiveEventStatus() {
  assertDatabase();
  const latest = db
    .prepare(`
      SELECT created_at AS createdAt
      FROM tb_logs_eventos
      WHERE source IN ('syslog', 'webhook', 'live-event')
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get();

  return {
    ...getEventServerStatus(),
    latestStoredEventAt: latest?.createdAt || null
  };
}

function listLiveEvents(limit = 30) {
  assertDatabase();
  const cleanLimit = Math.max(1, Math.min(100, Number(limit || 30)));

  return db
    .prepare(`
      SELECT
        l.id,
        l.router_id AS routerId,
        r.alias AS routerAlias,
        l.source,
        l.level,
        l.message,
        l.created_at AS createdAt
      FROM tb_logs_eventos l
      LEFT JOIN tb_config_router r ON r.id = l.router_id
      ORDER BY l.created_at DESC
      LIMIT ?
    `)
    .all(cleanLimit);
}

function listIpSegments(routerId) {
  assertDatabase();
  const params = [];
  let where = "";

  if (routerId) {
    where = "WHERE s.router_id = ?";
    params.push(routerId);
  }

  return db
    .prepare(`
      SELECT
        s.id,
        s.router_id AS routerId,
        r.alias AS routerAlias,
        s.label,
        s.cidr,
        s.gateway,
        s.interface_name AS interfaceName,
        s.purpose,
        s.vlan_id AS vlanId,
        s.trunk_name AS trunkName,
        s.source,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt
      FROM tb_ip_segments s
      LEFT JOIN tb_config_router r ON r.id = s.router_id
      ${where}
      ORDER BY s.purpose, s.cidr
    `)
    .all(...params);
}

async function syncIpInventory(routerId) {
  assertDatabase();
  const router = getRouterWithSecret(routerId);
  const state = await fetchIpInventory(toConnectionConfig(router));
  const now = new Date().toISOString();
  const deleteStatement = db.prepare("DELETE FROM tb_ip_segments WHERE router_id = ? AND source = 'routeros'");
  const insertStatement = db.prepare(`
    INSERT INTO tb_ip_segments (
      id,
      router_id,
      label,
      cidr,
      gateway,
      interface_name,
      purpose,
      vlan_id,
      trunk_name,
      source,
      raw_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    deleteStatement.run(routerId);
    for (const address of state.addresses) {
      const interfaceName = address.interface || "sin-interfaz";
      const vlan = state.vlans.find((item) => item.name === interfaceName);
      insertStatement.run(
        randomUUID(),
        routerId,
        address.comment || interfaceName,
        address.address || address.network || "0.0.0.0/32",
        extractGateway(address.address),
        interfaceName,
        classifySegment(interfaceName, address.comment),
        vlan?.["vlan-id"] || null,
        vlan?.interface || null,
        "routeros",
        JSON.stringify(address),
        now,
        now
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  insertLog(routerId, "ipam-sync", "info", `Segmentacion IP sincronizada: ${state.addresses.length} direcciones.`);

  return {
    segments: listIpSegments(routerId),
    routes: state.routes.length,
    interfaces: state.interfaces.length,
    vlans: state.vlans.length
  };
}

function createIpSegment(payload = {}) {
  assertDatabase();
  const routerId = cleanText(payload.routerId) || null;
  const cidr = cleanText(payload.cidr);
  const label = cleanText(payload.label) || cidr;
  const now = new Date().toISOString();

  if (routerId) {
    assertRouterExists(routerId);
  }

  if (!cidr || !cidr.includes("/")) {
    throw new Error("Ingresa un segmento CIDR valido.");
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO tb_ip_segments (
      id,
      router_id,
      label,
      cidr,
      gateway,
      interface_name,
      purpose,
      vlan_id,
      trunk_name,
      source,
      raw_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    routerId,
    label,
    cidr,
    cleanText(payload.gateway) || null,
    cleanText(payload.interfaceName) || null,
    cleanText(payload.purpose) || "unknown",
    cleanText(payload.vlanId) || null,
    cleanText(payload.trunkName) || null,
    "manual",
    JSON.stringify(payload),
    now,
    now
  );

  return listIpSegments(routerId).find((segment) => segment.id === id);
}

function removeIpSegment(segmentId) {
  assertDatabase();

  if (!segmentId || typeof segmentId !== "string") {
    throw new Error("Segmento invalido.");
  }

  db.prepare("DELETE FROM tb_ip_segments WHERE id = ?").run(segmentId);
  return { ok: true };
}

function findRouterByRemoteAddress(remoteAddress) {
  if (!remoteAddress) {
    return null;
  }

  const normalized = String(remoteAddress).replace(/^::ffff:/, "");
  return listRouters().find((router) => router.host === normalized) || null;
}

function extractGateway(cidr) {
  const [address] = String(cidr || "").split("/");
  return address || null;
}

function classifySegment(interfaceName = "", comment = "") {
  const text = `${interfaceName} ${comment}`.toLowerCase();

  if (/wireguard|wg|vpn/.test(text)) {
    return "vpn";
  }

  if (/vlan|trunk|sfp|bond|bridge/.test(text)) {
    return "trunk";
  }

  if (/wan|internet|pppoe/.test(text)) {
    return "wan";
  }

  if (/lan|local|clientes|users/.test(text)) {
    return "lan";
  }

  return "unknown";
}

function runMigrations() {
  ensureColumn("tb_config_router", "webfig_port", "INTEGER NOT NULL DEFAULT 8443");
  ensureColumn("tb_config_router", "webfig_tls", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("tb_config_router", "last_error", "TEXT");
  ensureColumn("tb_config_router", "router_identity", "TEXT");
  ensureColumn("tb_config_router", "router_version", "TEXT");
  ensureColumn("tb_config_router", "last_sync_at", "TEXT");
  ensureColumn("tb_firewall_rules", "connection_state", "TEXT");
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
  ingestLiveEvent,
  initializeDatabase,
  registerRouterHandlers
};
