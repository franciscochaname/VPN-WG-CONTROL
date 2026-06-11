const electronApi = () => window.vpnWgControl;

export async function getSecurityHealth() {
  if (electronApi()?.security) {
    return electronApi().security.health();
  }

  return {
    encryptionAvailable: false,
    canEncryptDecrypt: false,
    encryptionError: "La verificacion de cifrado solo esta disponible en la app instalada.",
    databasePath: "Memoria temporal",
    credentialCount: 0,
    encryptedCredentialCount: 0,
    secretsExposedToRenderer: false,
    contextIsolation: true,
    nodeIntegration: false
  };
}
