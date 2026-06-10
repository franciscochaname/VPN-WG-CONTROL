const net = require("node:net");

const DEFAULT_TIMEOUT_MS = 3500;

async function diagnoseRouterServices(router) {
  const services = [
    {
      key: "api",
      label: "RouterOS API",
      port: router.apiPort,
      protocol: router.useTls ? "tls" : "tcp"
    },
    {
      key: "api-ssl",
      label: "RouterOS API-SSL",
      port: 8729,
      protocol: "tls"
    },
    {
      key: "winbox",
      label: "Winbox",
      port: 8291,
      protocol: "tcp"
    },
    {
      key: "webfig",
      label: "WebFig",
      port: router.webfigPort,
      protocol: router.webfigTls ? "https" : "http"
    },
    {
      key: "http",
      label: "HTTP",
      port: 80,
      protocol: "http"
    },
    {
      key: "https",
      label: "HTTPS",
      port: 443,
      protocol: "https"
    }
  ].filter((service) => Number.isInteger(service.port) && service.port > 0);

  return Promise.all(services.map((service) => checkService(router.host, service)));
}

function checkService(host, service) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.connect({ host, port: service.port });

    const done = (status, detail) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        ...service,
        host,
        status,
        detail,
        latencyMs: Date.now() - startedAt
      });
    };

    socket.setTimeout(DEFAULT_TIMEOUT_MS);
    socket.once("connect", () => done("open", "Conexion TCP establecida."));
    socket.once("timeout", () => done("timeout", "Sin respuesta dentro del tiempo limite."));
    socket.once("error", (error) => done("closed", error.code || error.message));
  });
}

module.exports = {
  diagnoseRouterServices
};
