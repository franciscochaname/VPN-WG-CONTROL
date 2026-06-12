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

export async function analyzeIpam(routerId) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.analysis(routerId || null);
  }

  return {
    summary: {
      totalSegments: 0,
      totalReservations: 0,
      totalTunnels: 0,
      usableIps: 0,
      usedIps: 0,
      reservedIps: 0,
      freeEstimate: 0,
      utilization: 0,
      overlaps: 0,
      conflicts: 0
    },
    segments: [],
    reservations: [],
    overlaps: [],
    conflicts: [],
    findings: []
  };
}

export async function suggestIpAddress(payload) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.suggest(payload);
  }

  throw new Error("La sugerencia de IP solo esta disponible en la app instalada.");
}

export async function reserveIpAddress(payload) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.reserve(payload);
  }

  throw new Error("Las reservas IP solo estan disponibles en la app instalada.");
}

export async function releaseIpReservation(reservationId) {
  if (electronApi()?.ipam) {
    return electronApi().ipam.release(reservationId);
  }

  return { ok: true };
}
