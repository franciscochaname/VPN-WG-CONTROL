const crypto = require("node:crypto");
const net = require("node:net");
const tls = require("node:tls");

class RouterOsClient {
  constructor({ host, port, username, password, useTls, timeoutMs = 8000 }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.useTls = useTls;
    this.timeoutMs = timeoutMs;
    this.buffer = Buffer.alloc(0);
    this.socket = null;
  }

  async connect() {
    this.socket = this.useTls
      ? tls.connect({
          host: this.host,
          port: this.port,
          rejectUnauthorized: false
        })
      : net.connect({
          host: this.host,
          port: this.port
        });

    this.socket.setTimeout(this.timeoutMs);
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    });

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        this.socket.off("connect", onConnect);
        this.socket.off("secureConnect", onConnect);
        this.socket.off("timeout", onTimeout);
        this.socket.off("error", onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error("Tiempo de conexion agotado."));
      };
      const onError = (error) => {
        cleanup();
        reject(new Error(`No se pudo abrir conexion: ${error.message}`));
      };

      this.socket.once(this.useTls ? "secureConnect" : "connect", onConnect);
      this.socket.once("timeout", onTimeout);
      this.socket.once("error", onError);
    });
  }

  async login() {
    const first = await this.command(["/login", `=name=${this.username}`, `=password=${this.password}`]);

    if (first.some((sentence) => sentence.reply === "!done")) {
      return;
    }

    const challenge = first.find((sentence) => sentence.attributes.ret)?.attributes.ret;

    if (!challenge) {
      throw new Error(extractTrapMessage(first) || "El router no acepto el login API.");
    }

    const response = createLegacyLoginResponse(this.password, challenge);
    const second = await this.command(["/login", `=name=${this.username}`, `=response=${response}`]);

    if (!second.some((sentence) => sentence.reply === "!done")) {
      throw new Error(extractTrapMessage(second) || "Credenciales API rechazadas.");
    }
  }

  async command(words) {
    this.writeSentence(words);
    return this.readSentences();
  }

  close() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
      this.socket.destroy();
    }
  }

  writeSentence(words) {
    const chunks = [];

    for (const word of words) {
      const wordBuffer = Buffer.from(word, "utf8");
      chunks.push(encodeLength(wordBuffer.length), wordBuffer);
    }

    chunks.push(Buffer.from([0]));
    this.socket.write(Buffer.concat(chunks));
  }

  async readSentences() {
    const sentences = [];

    while (true) {
      const sentence = await this.readSentence();

      if (!sentence.reply && sentence.words.length === 0) {
        continue;
      }

      sentences.push(sentence);

      if (sentence.reply === "!done") {
        return sentences;
      }

      if (sentence.reply === "!trap") {
        throw new Error(extractTrapMessage([sentence]) || "RouterOS rechazo el comando.");
      }

      if (sentence.reply === "!fatal") {
        throw new Error(extractTrapMessage([sentence]) || "Respuesta fatal del router.");
      }
    }
  }

  async readSentence() {
    const words = [];

    while (true) {
      const word = await this.readWord();

      if (word === null) {
        const reply = words[0] || "";
        return {
          reply,
          words,
          attributes: parseAttributes(words)
        };
      }

      words.push(word);
    }
  }

  async readWord() {
    const length = await this.readLength();

    if (length === 0) {
      return null;
    }

    const data = await this.readBytes(length);
    return data.toString("utf8");
  }

  async readLength() {
    const first = (await this.readBytes(1))[0];

    if ((first & 0x80) === 0x00) {
      return first;
    }

    if ((first & 0xc0) === 0x80) {
      return ((first & ~0xc0) << 8) + (await this.readBytes(1))[0];
    }

    if ((first & 0xe0) === 0xc0) {
      const bytes = await this.readBytes(2);
      return ((first & ~0xe0) << 16) + (bytes[0] << 8) + bytes[1];
    }

    if ((first & 0xf0) === 0xe0) {
      const bytes = await this.readBytes(3);
      return ((first & ~0xf0) << 24) + (bytes[0] << 16) + (bytes[1] << 8) + bytes[2];
    }

    const bytes = await this.readBytes(4);
    return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  }

  async readBytes(length) {
    const startedAt = Date.now();

    while (this.buffer.length < length) {
      if (Date.now() - startedAt > this.timeoutMs) {
        throw new Error("Tiempo de lectura agotado.");
      }

      await new Promise((resolve, reject) => {
        const cleanup = () => {
          this.socket.off("data", onData);
          this.socket.off("error", onError);
          this.socket.off("close", onClose);
        };
        const onData = () => {
          cleanup();
          resolve();
        };
        const onError = (error) => {
          cleanup();
          reject(new Error(`Error de conexion: ${error.message}`));
        };
        const onClose = () => {
          cleanup();
          reject(new Error("El router cerro la conexion."));
        };

        this.socket.once("data", onData);
        this.socket.once("error", onError);
        this.socket.once("close", onClose);
      });
    }

    const out = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return out;
  }
}

async function withRouterOsSession(config, callback) {
  const client = new RouterOsClient(config);

  try {
    await client.connect();
    await client.login();
    return await callback(client);
  } finally {
    client.close();
  }
}

async function testRouterConnection(config) {
  return withRouterOsSession(config, async (client) => {
    const resource = await client.command(["/system/resource/print"]);
    const identity = await client.command(["/system/identity/print"]);

    return {
      resource: firstDataAttributes(resource),
      identity: firstDataAttributes(identity)
    };
  });
}

async function fetchWireGuardState(config) {
  return withRouterOsSession(config, async (client) => {
    const interfaces = await client.command(["/interface/wireguard/print"]);
    const peers = await client.command(["/interface/wireguard/peers/print"]);

    return {
      interfaces: dataAttributes(interfaces),
      peers: dataAttributes(peers)
    };
  });
}

async function addWireGuardPeer(config, peer) {
  return withRouterOsSession(config, async (client) => {
    const words = [
      "/interface/wireguard/peers/add",
      `=interface=${peer.interfaceName}`,
      `=public-key=${peer.publicKey}`,
      `=allowed-address=${peer.allowedAddress}`
    ];

    addOptionalWord(words, "comment", peer.comment);
    addOptionalWord(words, "endpoint-address", peer.endpointAddress);
    addOptionalWord(words, "endpoint-port", peer.endpointPort);
    addOptionalWord(words, "persistent-keepalive", peer.persistentKeepalive);

    if (peer.disabled) {
      words.push("=disabled=yes");
    }

    const response = await client.command(words);
    return {
      response: firstDoneAttributes(response)
    };
  });
}

async function fetchFirewallState(config) {
  return withRouterOsSession(config, async (client) => {
    const filter = await client.command(["/ip/firewall/filter/print"]);
    const nat = await client.command(["/ip/firewall/nat/print"]);

    return {
      filter: dataAttributes(filter),
      nat: dataAttributes(nat)
    };
  });
}

async function addFirewallFilterRule(config, rule) {
  return withRouterOsSession(config, async (client) => {
    const words = [
      "/ip/firewall/filter/add",
      `=chain=${rule.chain}`,
      `=action=${rule.action}`
    ];

    addOptionalWord(words, "protocol", rule.protocol);
    addOptionalWord(words, "src-address", rule.srcAddress);
    addOptionalWord(words, "dst-address", rule.dstAddress);
    addOptionalWord(words, "dst-port", rule.dstPort);
    addOptionalWord(words, "in-interface", rule.inInterface);
    addOptionalWord(words, "out-interface", rule.outInterface);
    addOptionalWord(words, "connection-state", rule.connectionState);
    addOptionalWord(words, "comment", rule.comment);
    addOptionalWord(words, "place-before", rule.placeBefore);

    if (rule.disabled) {
      words.push("=disabled=yes");
    }

    const response = await client.command(words);
    return {
      response: firstDoneAttributes(response)
    };
  });
}

function encodeLength(length) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }

  if (length < 0x4000) {
    return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  }

  if (length < 0x200000) {
    return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
  }

  if (length < 0x10000000) {
    return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }

  return Buffer.from([0xf0, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}

function parseAttributes(words) {
  const attributes = {};

  for (const word of words) {
    if (!word.startsWith("=")) {
      continue;
    }

    const separatorIndex = word.indexOf("=", 1);

    if (separatorIndex === -1) {
      continue;
    }

    attributes[word.slice(1, separatorIndex)] = word.slice(separatorIndex + 1);
  }

  return attributes;
}

function dataAttributes(sentences) {
  return sentences
    .filter((sentence) => sentence.reply === "!re")
    .map((sentence) => sentence.attributes);
}

function firstDataAttributes(sentences) {
  return dataAttributes(sentences)[0] || {};
}

function firstDoneAttributes(sentences) {
  return sentences.find((sentence) => sentence.reply === "!done")?.attributes || {};
}

function addOptionalWord(words, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  words.push(`=${key}=${value}`);
}

function createLegacyLoginResponse(password, challengeHex) {
  const challenge = Buffer.from(challengeHex, "hex");
  const digest = crypto
    .createHash("md5")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(password), challenge]))
    .digest("hex");

  return `00${digest}`;
}

function extractTrapMessage(sentences) {
  const trap = sentences.find((sentence) => sentence.reply === "!trap" || sentence.reply === "!fatal");
  return trap?.attributes?.message;
}

module.exports = {
  addWireGuardPeer,
  addFirewallFilterRule,
  fetchFirewallState,
  fetchWireGuardState,
  testRouterConnection
};
