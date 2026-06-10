const { generateKeyPairSync } = require("node:crypto");

function generateWireGuardKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });

  return {
    privateKey: base64UrlToBase64(privateJwk.d),
    publicKey: base64UrlToBase64(publicJwk.x)
  };
}

function base64UrlToBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("base64");
}

module.exports = {
  generateWireGuardKeyPair
};
