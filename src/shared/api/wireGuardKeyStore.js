let browserKeys = [];

const electronApi = () => window.vpnWgControl;

export async function listWireGuardKeys() {
  if (electronApi()?.wireguardKeys) {
    return electronApi().wireguardKeys.list();
  }

  return browserKeys;
}

export async function generateWireGuardKey(payload) {
  if (electronApi()?.wireguardKeys) {
    return electronApi().wireguardKeys.generate(payload);
  }

  const now = new Date().toISOString();
  const key = {
    id: crypto.randomUUID(),
    label: payload.label || `Llave WireGuard ${new Date().toLocaleString("es-PE")}`,
    publicKey: "Disponible en la app instalada",
    assignedRouterId: payload.assignedRouterId || null,
    assignedRouterAlias: null,
    assignedTunnelId: null,
    createdAt: now,
    updatedAt: now
  };

  browserKeys = [key, ...browserKeys];
  return key;
}

export async function removeWireGuardKey(keyId) {
  if (electronApi()?.wireguardKeys) {
    return electronApi().wireguardKeys.remove(keyId);
  }

  browserKeys = browserKeys.filter((key) => key.id !== keyId);
  return { ok: true };
}
