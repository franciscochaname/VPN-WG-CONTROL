const dgram = require("node:dgram");
const http = require("node:http");

const DEFAULT_HTTP_PORT = 8787;
const DEFAULT_SYSLOG_PORT = 5514;

let httpServer = null;
let udpServer = null;
let status = {
  httpPort: DEFAULT_HTTP_PORT,
  syslogPort: DEFAULT_SYSLOG_PORT,
  httpListening: false,
  syslogListening: false,
  lastEventAt: null,
  lastError: null
};

function startEventServer({ onEvent, httpPort = DEFAULT_HTTP_PORT, syslogPort = DEFAULT_SYSLOG_PORT }) {
  if (httpServer || udpServer) {
    return getEventServerStatus();
  }

  httpServer = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/status") {
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "application/json"
      });
      response.end(JSON.stringify(getEventServerStatus()));
      return;
    }

    if (request.method !== "POST" || !["/webhook", "/events", "/syslog"].includes(request.url || "")) {
      response.writeHead(404, {
        "access-control-allow-origin": "*",
        "content-type": "application/json"
      });
      response.end(JSON.stringify({ ok: false, error: "Ruta no disponible." }));
      return;
    }

    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const event = normalizeHttpEvent(rawBody, request);
      recordEvent(onEvent, event);
      response.writeHead(202, {
        "access-control-allow-origin": "*",
        "content-type": "application/json"
      });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  httpServer.on("error", (error) => {
    status.lastError = error.message;
    status.httpListening = false;
  });

  httpServer.listen(httpPort, "0.0.0.0", () => {
    status.httpPort = httpPort;
    status.httpListening = true;
  });

  udpServer = dgram.createSocket("udp4");
  udpServer.on("message", (message, remote) => {
    recordEvent(onEvent, {
      source: "syslog",
      level: detectLevel(message.toString("utf8")),
      message: cleanSyslogMessage(message.toString("utf8")),
      remoteAddress: remote.address,
      remotePort: remote.port,
      rawPayload: message.toString("utf8")
    });
  });
  udpServer.on("error", (error) => {
    status.lastError = error.message;
    status.syslogListening = false;
  });
  udpServer.bind(syslogPort, "0.0.0.0", () => {
    status.syslogPort = syslogPort;
    status.syslogListening = true;
  });

  return getEventServerStatus();
}

function stopEventServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  if (udpServer) {
    udpServer.close();
    udpServer = null;
  }

  status = {
    ...status,
    httpListening: false,
    syslogListening: false
  };
}

function getEventServerStatus() {
  return { ...status };
}

function recordEvent(onEvent, event) {
  status.lastEventAt = new Date().toISOString();
  status.lastError = null;

  try {
    onEvent(event);
  } catch (error) {
    status.lastError = error.message;
  }
}

function normalizeHttpEvent(rawBody, request) {
  const parsed = parseJson(rawBody);
  const message = parsed?.message || parsed?.log || parsed?.event || rawBody || "Evento recibido por webhook.";

  return {
    source: parsed?.source || "webhook",
    level: parsed?.level || detectLevel(message),
    message: String(message),
    remoteAddress: request.socket.remoteAddress,
    remotePort: request.socket.remotePort,
    rawPayload: rawBody
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cleanSyslogMessage(value) {
  return value.replace(/^<\d+>/, "").trim() || "Evento syslog recibido.";
}

function detectLevel(value) {
  const text = String(value || "").toLowerCase();

  if (/(error|failed|failure|timeout|down|denied|drop|reject)/.test(text)) {
    return "error";
  }

  if (/(warn|warning|blocked|invalid|retry)/.test(text)) {
    return "warning";
  }

  return "info";
}

module.exports = {
  getEventServerStatus,
  startEventServer,
  stopEventServer
};
