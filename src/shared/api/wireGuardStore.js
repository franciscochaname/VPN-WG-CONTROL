const electronApi = () => window.vpnWgControl;

export async function listWireGuardTunnels(routerId) {
  if (electronApi()?.wireguard) {
    return electronApi().wireguard.listTunnels(routerId || null);
  }

  return [];
}

export async function addWireGuardPeer(payload) {
  if (electronApi()?.wireguard) {
    return electronApi().wireguard.addPeer(payload);
  }

  throw new Error("La creacion de peers WireGuard solo esta disponible en la app instalada.");
}

export async function orchestrateWireGuardVpn(payload) {
  if (electronApi()?.wireguard) {
    return electronApi().wireguard.orchestrate(payload);
  }

  throw new Error("La orquestacion de VPN solo esta disponible en la app instalada.");
}
