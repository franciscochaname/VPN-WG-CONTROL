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
