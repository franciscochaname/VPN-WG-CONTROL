const electronApi = () => window.vpnWgControl;

export async function listWireGuardTunnels(routerId) {
  if (electronApi()?.wireguard) {
    return electronApi().wireguard.listTunnels(routerId || null);
  }

  return [];
}
