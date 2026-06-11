const electronApi = () => window.vpnWgControl;

export async function listFirewall(routerId) {
  if (electronApi()?.firewall) {
    return electronApi().firewall.list(routerId || null);
  }

  return {
    rules: [],
    findings: []
  };
}

export async function syncFirewall(routerId) {
  if (electronApi()?.firewall) {
    return electronApi().firewall.sync(routerId);
  }

  throw new Error("La sincronizacion de firewall solo esta disponible en la app instalada.");
}

export async function applyFirewallPreset(payload) {
  if (electronApi()?.firewall) {
    return electronApi().firewall.applyPreset(payload);
  }

  throw new Error("La aplicacion de reglas firewall solo esta disponible en la app instalada.");
}
