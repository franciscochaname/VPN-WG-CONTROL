# VPN-WG-CONTROL

Aplicacion de escritorio para orquestar, monitorear y administrar tuneles WireGuard sobre routers Mikrotik con una experiencia moderna, clara y de baja curva de aprendizaje.

## Direccion visual

- Modo claro calido como identidad principal.
- Interfaz moderna, interactiva y con animaciones utiles.
- Sin sobrecarga de stickers ni adornos innecesarios.
- Componentes pensados para usuarios tecnicos y no tecnicos.

## Arquitectura objetivo

- `electron/`: proceso principal, preload seguro e integraciones nativas.
- `src/app/`: composicion principal de la aplicacion.
- `src/features/`: modulos funcionales por dominio visual u operativo.
- `src/shared/ui/`: componentes reutilizables de interfaz.
- `src/styles.css`: estilos globales y animaciones base.
- `dist/`: salida compilada de Vite.

Fases siguientes previstas:

1. Persistencia local con SQLite y migraciones versionadas.
2. Servicio IPC seguro entre React y Electron.
3. Modulo criptografico local para llaves WireGuard.
4. Orquestador API para Mikrotik.
5. Servidor pasivo webhook/syslog para eventos.
6. Empaquetado instalable para Windows.

## Desarrollo local

```bash
npm install
npm run dev
```

En PowerShell de Windows, si `npm` esta bloqueado por politicas de ejecucion, usar:

```bash
npm.cmd install
npm.cmd run dev
```

## Persistencia local

La aplicacion guarda su base SQLite en el perfil local de Electron:

```text
%APPDATA%/vpn-wg-control/data/vpn-wg-control.sqlite
```

Las credenciales del router no se devuelven al frontend. El token o clave se cifra desde Electron con `safeStorage` antes de persistirse.

## Registro de avances

### 2026-06-09

- Se inicio el repositorio base.
- Se definio direccion visual: modo claro calido, moderno, interactivo y limpio.
- Se creo el scaffold Electron + React + Tailwind.
- Se agrego dashboard inicial con topologia animada para la primera maqueta visual.
- Se organizo el frontend por `app`, `features` y `shared/ui` para crecer por modulos sin reordenar archivos.

### 2026-06-10

- Se elimino la dependencia de datos inventados en el dashboard.
- Se agrego registro real de routers Mikrotik con formulario de acceso API.
- Se agrego persistencia local SQLite desde Electron.
- Se agrego cifrado local de token/clave con `safeStorage` antes de guardar credenciales.
- Se prepararon tablas base: `tb_config_router`, `tb_tuneles` y `tb_logs_eventos`.
- Se agrego cliente nativo RouterOS API por TCP/TLS sin dependencias externas.
- Se agrego prueba real de conexion contra Mikrotik con actualizacion de estado `online`/`offline`.
- Se agrego lectura real de identidad y version RouterOS cuando la conexion responde.
- Se agrego sincronizacion WireGuard desde `/interface/wireguard/print` y `/interface/wireguard/peers/print`.
- Se agrego registro local de errores/eventos tecnicos en `tb_logs_eventos`.
- Se agrego configuracion de puerto WebFig por router.
- Se agrego diagnostico real de servicios Mikrotik: API, API-SSL, Winbox, WebFig, HTTP y HTTPS.
- Se agrego persistencia de diagnosticos en `tb_diagnosticos`.
- Se agrego verificacion de cifrado local con `safeStorage` desde Electron.
- Se agrego panel de seguridad para revisar cifrado, aislamiento IPC y persistencia de credenciales.
- Se agrego vista WireGuard para listar tuneles/peers reales sincronizados en `tb_tuneles`.
- Se agrego generador local de llaves WireGuard X25519 compatible con formato base64.
- Se agrego persistencia de llaves privadas cifradas en `tb_wireguard_keys`.
- Se agrego vista `Llaves WG` para generar, listar, copiar publicas y eliminar llaves locales.
- Se agrego operacion real para crear peers WireGuard en RouterOS con `/interface/wireguard/peers/add`.
- Se agrego formulario WireGuard para seleccionar llave publica de la boveda o ingresar una publica manual.
- Se mantiene la regla de no crear peers locales si RouterOS no confirma la operacion.
- Se mejoro el monitor de topologia con un lienzo tipo laboratorio de red: grilla, nodos, enlaces animados y barra de estado.
- El monitor ahora consume routers y tuneles reales del snapshot local, sin crear conexiones de ejemplo.
- Se agrego modulo Firewall para sincronizar reglas reales `filter` y `nat` desde RouterOS.
- Se agrego diagnostico de interferencias que revisa posibles bloqueos en `input`, `forward` y ausencia de NAT para tuneles.
- Se agregaron presets guiados para permitir API, WireGuard UDP y trafico forward establecido desde la app.

### 2026-06-11

- Se corrigio la carga de assets del build Vite para que Electron desktop renderice correctamente desde `file://`.
- Se agrego tabla `tb_telemetry_samples` para guardar muestras reales de trafico WireGuard en cada sincronizacion.
- Se agrego motor inteligente local con modo entrenamiento/baseline, confianza, deteccion de peers sin handshake, routers offline y anomalias de trafico.
- Se amplio el dashboard con telemetria RX/TX, tasa estimada, muestras reales y panel de hallazgos inteligentes.
- Se agrego refresco local periodico del dashboard cada 10 segundos sin saturar RouterOS.
- Se mejoro Firewall con puntuacion de riesgo, resumen por cadenas, filtros visuales y recomendaciones accionables.
- Se agregaron presets adicionales para WebFig y forward de peers, manteniendo verificacion contra reglas reales sincronizadas.
- Se agrego receptor local de eventos HTTP Webhook y Syslog UDP para alertas vivas del router.
- Se agrego endpoint de estado del receptor para monitoreo local durante desarrollo y ejecucion instalada.
- Se agrego orquestador WireGuard por tipos: acceso remoto, sitio a sitio, sede con NAT y troncal.
- La creacion guiada de VPN ahora aplica peer, firewall, rutas, NAT opcional y verificacion final por pasos.
- Se agrego inventario IPAM con tabla `tb_ip_segments` para segmentos reales y planificados.
- Se agrego vista Segmentos para sincronizar IPs del router, clasificar LAN/WAN/VPN/troncales y registrar redes manuales.
- Se rediseno la creacion WireGuard como asistente interactivo por tipo de conexion, con campos progresivos y opciones avanzadas plegadas.
- Se agrego centro global de notificaciones, modales de confirmacion y refresco compartido para mantener coherencia entre VPN, firewall, segmentos y monitoreo.

### 2026-06-12

- Se agrego tabla `tb_router_backups` para snapshots previos de WireGuard, firewall, NAT e inventario IP/rutas.
- Se agrego respaldo automatico antes de orquestar VPN y antes de aplicar presets de firewall.
- Se agrego rollback selectivo para retirar objetos nuevos creados por la app despues de un respaldo.
- Se agrego vista `Respaldos` para crear snapshots manuales, revisar historial y ejecutar rollback con confirmacion.
- Se agrego IPAM inteligente con tabla `tb_ip_reservations` para reservas persistentes por segmento.
- Se agrego analisis local de capacidad IP, redes superpuestas, IPs duplicadas, rutas WireGuard y proxima IP disponible.
- Se agrego reserva guiada de IP con sugerencia automatica y bloqueo contra IPs ya usadas por inventario real o WireGuard.
- Se rediseno la vista `Segmentos` con motor IPAM, tarjetas de salud, barras de utilizacion y detalle de reservas/rutas sin datos inventados.
- Se agrego monitor continuo real en Electron para sincronizar routers `online` cada 30 segundos sin depender de una vista abierta.
- Se agrego estado visible del monitor continuo en el dashboard con ultima pasada, resumen y ejecucion manual de ciclo.
- Se rediseno el registro de router como asistente por pasos con validacion en vivo y guia RouterOS para API, WebFig, firewall y syslog.
- Se agregaron validaciones frontales al asistente WireGuard para CIDR, llave publica, puertos y rutas antes de orquestar VPN.
- Se compacto la arquitectura visual a dos columnas: barra izquierda operativa y centro ampliado para dashboard, VPN, firewall e IPAM.
- Se agrego barra superior de flujo seguro para crear VPN y recordar backup, inyeccion controlada, verificacion y monitoreo sin duplicar metricas.
- Se elimino la columna lateral derecha redundante y se movieron las acciones de crear VPN, extraer estado, validar servicios, firewall e IPAM a la barra izquierda.
- Se agrego tabla `tb_monitoring_profiles` para que el motor inteligente aprenda perfiles locales persistentes por tunel WireGuard.
- Se agrego aprendizaje incremental con promedio movil RX/TX, pico local, ciclos en silencio y ultimo handshake a partir de muestras reales.
- Se amplio el dashboard con resumen de perfiles aprendidos, perfiles entrenados, silencio detectado y picos locales sin servicios externos.
- Se mejoro el asistente WireGuard por escenarios claros: laptop a router, router a router, sucursal con NAT y troncal de red.
- Se conecto la creacion de VPN con IPAM y firewall para validar segmento, sugerir IP libre, bloquear duplicados y detectar solapes antes de orquestar.
- Se agrego panel de analisis previo para revisar router, segmento, peer, ruta remota, conflictos IPAM y firewall antes de aplicar comandos.
- Se agrego alerta recuperable cuando el estado local no puede actualizarse, evitando fallos silenciosos en el dashboard.
- Se unifico feedback operativo en Registro de router y Seguridad con notificaciones, errores visibles y reintentos claros.
- Se reforzo la copia de guias RouterOS con manejo de error y confirmacion visual.
- Se agrego persistencia de `listen_port` por interfaz WireGuard sincronizada para validar puertos reales antes de crear VPN.
- Se movio el puerto UDP al flujo principal del asistente VPN con sugerencia automatica y semaforo de conflicto.
- Se agrego bloqueo backend contra puertos WireGuard en otra interfaz, reglas firewall `drop/reject` y parser seguro de listas/rangos de puertos.
- Se rediseno el header para usar el espacio superior con marca, vista activa, metricas reales, estado del monitor y acciones rapidas.
- Se verifico el header en escritorio y movil para evitar espacios vacios y desbordes horizontales.
- Se compacto la franja de operacion segura para eliminar acciones duplicadas y usar todo el ancho con el flujo Backup-Aplicacion-Verificacion-Rollback.
- Se redujo la redundancia visual entre header, franja superior y panel lateral, manteniendo acciones principales en una sola zona.
