const electronApi = () => window.vpnWgControl;

export async function listBackups(routerId) {
  if (electronApi()?.backups) {
    return electronApi().backups.list(routerId || null);
  }

  return [];
}

export async function createBackup(payload) {
  if (electronApi()?.backups) {
    return electronApi().backups.create(payload);
  }

  throw new Error("Los respaldos del router solo estan disponibles en la app instalada.");
}

export async function rollbackBackup(backupId) {
  if (electronApi()?.backups) {
    return electronApi().backups.rollback(backupId);
  }

  throw new Error("El rollback solo esta disponible en la app instalada.");
}
