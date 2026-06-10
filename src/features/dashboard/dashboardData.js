import { Activity, CheckCircle2, Gauge, Network, Router } from "lucide-react";

export const nodes = [
  { id: "hq", label: "Mikrotik Core", type: "router", x: 50, y: 45, status: "online" },
  { id: "branch-a", label: "Sucursal Norte", type: "site", x: 21, y: 26, status: "online" },
  { id: "branch-b", label: "Sucursal Sur", type: "site", x: 26, y: 72, status: "warning" },
  { id: "mobile", label: "Soporte Movil", type: "client", x: 78, y: 30, status: "online" },
  { id: "field", label: "Tecnico Campo", type: "client", x: 73, y: 73, status: "online" }
];

export const tunnels = [
  { from: "hq", to: "branch-a", traffic: "42 Mbps" },
  { from: "hq", to: "branch-b", traffic: "18 Mbps" },
  { from: "hq", to: "mobile", traffic: "9 Mbps" },
  { from: "hq", to: "field", traffic: "12 Mbps" }
];

export const stats = [
  { label: "Tuneles activos", value: "18", trend: "+3 hoy", icon: Network },
  { label: "Routers enlazados", value: "6", trend: "100% API", icon: Router },
  { label: "Eventos resueltos", value: "94%", trend: "ult. 24h", icon: CheckCircle2 },
  { label: "Latencia media", value: "24 ms", trend: "estable", icon: Gauge }
];

export const alerts = [
  { title: "Sucursal Sur", detail: "Handshake demorado, revisar ruta WAN secundaria.", severity: "Atencion" },
  { title: "Core", detail: "Token API valido y whitelisting confirmado.", severity: "Seguro" },
  { title: "IPAM", detail: "Pool 10.70.8.0/24 con 41 direcciones libres.", severity: "OK" }
];

export const navigationItems = [
  { label: "Panel", icon: Activity, active: true },
  { label: "Topologia", icon: Network },
  { label: "Routers", icon: Router },
  { label: "Seguridad", icon: CheckCircle2 },
  { label: "Llaves WG", icon: Gauge }
];
