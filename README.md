# CondominioApp 🏢

Aplicación moderna para la gestión eficiente de condominios, edificios y residencias. Facilita la comunicación entre administradores y residentes, el reporte de pagos, y la gestión de incidencias.

## 🚀 Características Principales

### Para Residentes
* **Reporte de Pagos:** Envío de referencias bancarias para el pago del recibo mensual (Bs. y USD).
* **Reporte de Incidencias:** Panel para reportar problemas de mantenimiento, ruido, seguridad, etc.
* **Sistema de Votación (Propuestas):** Participación activa en las decisiones del condominio.
* **Chat Vecinal:** Espacio para la comunicación entre los residentes del edificio.

### Para Administradores
* **Gestión del Edificio:** Configuración de información del condominio, datos bancarios y logo.
* **Gestión de Gastos:** Registro de los gastos comunes (ordinarios, extraordinarios y fondo de reserva).
* **Aprobación de Recibos:** Verificación y validación de los pagos reportados por los residentes.
* **Control de Reportes:** Seguimiento de las incidencias reportadas (Abierto, En Progreso, Resuelto).
* **Gestión de Propuestas:** Creación de votaciones para la toma de decisiones.

## 🛠️ Tecnologías y Herramientas

* **Frontend:** [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
* **Build Tool:** [Vite](https://vitejs.dev/)
* **Estilos:** CSS Modules / Inline Styles (diseño moderno en modo oscuro)
* **Backend as a Service (BaaS):** [Supabase](https://supabase.com/) (Autenticación, Base de Datos PostgreSQL, Storage)
* **Integraciones:** Consulta automática de tasa BCV

## 📦 Instalación y Uso Local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/dohuglasr-tech/CondominioApp.git
   cd CondominioApp
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   * Crea un archivo `.env.local` en la raíz del proyecto.
   * Agrega tus credenciales de Supabase:
     ```env
     VITE_SUPABASE_URL=tu_url_de_supabase
     VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
     ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   El proyecto estará disponible en `http://localhost:5173`.

## 🗄️ Base de Datos (Supabase)

El proyecto incluye esquemas SQL en la carpeta `supabase/` para inicializar la base de datos:
* `supabase/seed.sql`: Contiene la estructura de las tablas necesarias (perfiles, apartamentos, gastos, recibos, reportes, propuestas, etc.) y políticas de seguridad (RLS).
* `supabase/automatizaciones.sql`: Funciones y triggers para mantener los balances actualizados.

## 📄 Licencia

Este proyecto es de uso privado / propietario.
