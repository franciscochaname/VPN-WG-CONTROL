const electronApi = () => window.vpnWgControl;

export async function listIpSegments(routerId) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.list(routerId || null);
  }

  return [];
}

export async function syncIpInventory(routerId) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.sync(routerId);
  }

  throw new Error("La sincronizacion de segmentos solo esta disponible en la app instalada.");
}

export async function createIpSegment(payload) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.create(payload);
  }

  throw new Error("La segmentacion persistente solo esta disponible en la app instalada.");
}

export async function removeIpSegment(segmentId) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.remove(segmentId);
  }

  return { ok: true };
}
