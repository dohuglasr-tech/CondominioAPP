# Domus — Gestión Integral de Condominios 🏢

Plataforma web (PWA) y móvil (Android via Capacitor) para la administración financiera, operativa y comunitaria de condominios multi-edificio, diseñada con arquitectura modular en React + TypeScript y backend sobre Supabase (PostgreSQL con RLS multi-tenant, Edge Functions, Realtime y Storage).

---

## 🚀 Funcionalidades Principales

### Para Residentes
* **Dashboard Consolidado:** Visualización unificada de deuda de condominio, cuotas de gas comunal, locales asignados, saldo a favor, alícuota legal y tasa oficial BCV del día (`America/Caracas`, UTC-4).
* **Reporte y Prelación de Pagos:** Carga de pagos en Bolívares o USD con compresión automática de comprobantes y conciliación con prelación estricta (deudas fijas en Bs -> recibos indexados USD -> saldo a favor).
* **Recibos y Solvencia PDF:** Consulta histórica y descarga de recibos oficiales y **Carta de Solvencia** en PDF generados bajo demanda.
* **Módulos Comunitarios:** Servicio de gas comunal, locales y espacios comerciales, lista transparente de morosidad, normas de convivencia descargables en PDF, organigrama de junta directiva, reportes de averías, propuestas/votaciones y chat vecinal en tiempo real.
* **Acceso Biométrico y Recuperación:** Soporte WebAuthn / biometría en dispositivos compatibles y recuperación de contraseña por correo.

### Para Administradores
* **Dashboard KPI en Servidor:** Métricas agregadas vía RPC (`get_admin_dashboard_kpis`) sin límite de paginación.
* **Facturación y Cartera:** Registro de gastos comunes, emisión masiva de recibos indexados/fijos, informes de gestión PDF, importación/exportación Excel y despacho automático por correo y WhatsApp.
* **Conciliación Atómica de Pagos:** Aprobación/rechazo con bloqueo transaccional (`reclamar_pago_para_revision` con `FOR UPDATE`) para impedir doble aprobación.
* **Calendario de Deudas y Cuotas Extraordinarias:** Matriz anual editable por apartamento/edificio, sincronizada en tablas relacionales, más generador de **Cartelera Informativa PDF (Carta 1/2/3 hojas)** para ascensor.
* **Gas Comunal:** Control de nivel de tanque, registro de llenados, jornadas/cuotas ordinarias y especiales, deudas anteriores y conciliación por apartamento.
* **Mora y Expedientes Legales:** Seguimiento por nivel de riesgo, citaciones de cobranza y generación de expedientes legales PDF.
* **Gobernanza y Auditoría:** Gestión de residentes, locales, chat administrativo con modo solo lectura, notificaciones globales y bitácora inmutable (`historial_auditoria`).

### Multi-Edificio (SuperAdmin)
* **Aislamiento Real por Tenant (`edificio_id`):** Resolución por subdominio (`<slug>.domus.ve`), ruta (`/e/:slug`) o parámetro (`?edificio=<slug>`), con aislamiento estricto a nivel de políticas RLS en PostgreSQL (`user_can_access_edificio`) y contexto en cliente (`tenantContext.ts`).

---

## 🛠️ Stack Tecnológico

* **Frontend:** React 18, TypeScript 5.5, React Router DOM 6, Vite 5 (`React.lazy` + `manualChunks`).
* **Estilos:** Sistema CSS modular en `src/styles/` (`tokens.css`, `components.css`, `animations.css`, `light-theme.css`) con soporte dinámico para **Modo Oscuro** y **Modo Claro**.
* **Generación de Documentos:** `jsPDF` + `jspdf-autotable` y `ExcelJS` cargados de forma dinámica (`src/utils/pdfLoader.ts`).
* **Pruebas Unitarias:** Vitest 2 (`src/__tests__/`).
* **Móvil Nativo:** Capacitor 8 (`@capacitor/core`, `@capacitor/android`).
* **Backend & Automatización:** Supabase (PostgreSQL + RLS, Auth, Realtime con debounce, Storage) y 3 Edge Functions en Deno (`enviar-email`, `notificacion-pago`, `cron-tasa-bcv`).
* **Despliegue:** Vercel (`vercel.json`) con caché inmutable para assets y encabezados `no-cache` para HTML/SW.

---

## 📁 Estructura del Proyecto

```text
├── src/
│   ├── __tests__/                 # Suites unitarias Vitest (fechaVE, tasa BCV, mora, prelación, alícuotas)
│   ├── application/
│   │   └── contexts/              # AuthContext (multi-tenant, dedupe) y ThemeContext
│   ├── data/                      # Servicios Supabase, cacheService, paginación y tenantContext
│   ├── presentation/
│   │   ├── components/            # Modales, paneles y layouts reutilizables
│   │   └── pages/                 # Vistas de residente, admin/{gas,calendario,recibos-emitidos} y superadmin
│   ├── styles/                    # tokens.css, components.css, animations.css, light-theme.css
│   └── utils/                     # Generadores PDF, logger, fechaVE, tasaBcvHelper, alicuota, biometría
├── supabase/
│   ├── functions/                 # Edge Functions: enviar-email, notificacion-pago, cron-tasa-bcv
│   └── migrations/                # Migraciones versionadas (schema, RLS, RPCs, relacional, multi-tenant)
├── vitest.config.ts
└── vercel.json
```

---

## 📦 Instalación y Comandos

1. **Clonar e instalar dependencias:**
   ```bash
   git clone https://github.com/dohuglasr-tech/CondominioAPP.git
   cd CondominioApp
   npm install
   ```

2. **Configurar variables de entorno locales (`.env.local`):**
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
   ```

3. **Comandos disponibles:**
   ```bash
   npm run dev        # Servidor de desarrollo Vite
   npm test           # Ejecutar suites unitarias en Vitest
   npm run test:watch # Vitest en modo watch
   npx tsc --noEmit   # Verificación estricta de tipos TypeScript
   npm run build      # Build de producción optimizado (dist/)
   npm run preview    # Previsualizar build local
   npm run cap:sync   # Sincronizar build web con Capacitor Android
   npm run cap:open   # Abrir proyecto nativo en Android Studio
   ```

---

## 🗄️ Base de Datos y Despliegue en Supabase

Las migraciones SQL versionadas viven en `supabase/migrations/`:
* `20260925000001` – `20261103000001`: Esquema base, Realtime, sincronización de correos y módulo de locales.
* `20261124000001_public_security_rpcs.sql`: Helpers `SECURITY DEFINER` y RPCs públicos/comunitarios sin exposición de PII.
* `20261124000002_security_rls_hardening.sql`: Cierre estricto de RLS en tablas y Storage (`pagos`, `edificio-assets`) + trigger anti-escalada en `perfiles`.
* `20261124000003_financial_integrity_rpcs.sql`: Reclamo atómico `reclamar_pago_para_revision` y KPIs agregados `get_admin_dashboard_kpis`.
* `20261124000004_relational_gas_cuotas.sql`: Tablas relacionales `cuotas_extraordinarias`, `cuotas_extraordinarias_asignaciones`, `gas_campanas` y `gas_asignaciones`.
* `20261124000005_multitenant_edificio_isolation.sql`: Columna `edificio_id`, índices, backfill, trigger por defecto y aislamiento RLS multi-edificio.

Para desplegar cambios de base de datos o Edge Functions en un proyecto enlazado con Supabase CLI:
```bash
npx supabase db push --remote --yes
npx supabase functions deploy enviar-email --no-verify-jwt --yes
npx supabase functions deploy notificacion-pago --no-verify-jwt --yes
npx supabase functions deploy cron-tasa-bcv --yes
```

---

## 📄 Licencia

Proyecto privado / propietario.
