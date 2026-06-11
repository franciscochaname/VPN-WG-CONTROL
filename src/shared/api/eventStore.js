const electronApi = () => window.vpnWgControl;

export async function getEventServerStatus() {
  if (electronApi()?.events) {
    return electronApi().events.status();
  }

  try {
    const response = await fetch("http://127.0.0.1:8787/status");

    if (response.ok) {
      return response.json();
    }
  } catch {
    // The development browser may run without the local receiver.
  }

  return {
    httpListening: false,
    syslogListening: false,
    httpPort: 8787,
    syslogPort: 5514,
    lastEventAt: null,
    latestStoredEventAt: null
  };
}

export async function listEvents(limit = 30) {
  if (electronApi()?.events) {
    return electronApi().events.list(limit);
  }

  return [];
}
