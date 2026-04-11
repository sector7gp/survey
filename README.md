# 📊 Diagnóstico de Madurez Digital v1.0.0

Sistema de encuestas mobile-first para evaluación de madurez digital, con captura de leads, persistencia en SQLite y panel administrativo integrado.

## 🚀 Características Principales
- **Motor de Encuestas**: Lógica de scoring dinámica basada en JSON.
- **Captura de Leads**: Flujo intersticial y pre-resultado para maximizar conversión.
- **Deduplicación**: El sistema reconoce emails existentes y actualiza registros.
- **Panel Admin**: Visualización de estadísticas, detalle de respuestas de cada usuario y exportación a CSV.
- **Notificaciones**: Envío automático de reportes personalizados vía Email (Nodemailer).
- **Seguridad**: Protección de rutas administrativas y endurecimiento de headers (Helmet).

## 🛠️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/sector7gp/survey.git
   cd survey
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura el entorno:
   Crea un archivo `.env` en la raíz con:
   ```env
   PORT=3005
   ADMIN_PASSWORD=tu_clave_aqui
   
   # Configuración SMTP (Email)
   SMTP_HOST=smtp.ejemplo.com
   SMTP_PORT=465
   SMTP_USER=tu_usuario
   SMTP_PASS=tu_password
   FROM_EMAIL="Pablo Gon | Facilitador <correo@ejemplo.com>"
   ```

## 💻 Desarrollo

Para correr el proyecto localmente con recarga automática:
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3005`.

## 🌐 Producción (con PM2)

Para garantizar que la aplicación se mantenga corriendo y se reinicie ante fallos:

1. Instala PM2 globalmente (si no lo tenés):
   ```bash
   npm install -g pm2
   ```

2. Inicia la aplicación:
   ```bash
   pm2 start server.js --name "digital-survey"
   ```

3. Comandos útiles de PM2:
   - `pm2 status`: Ver estado del proceso.
   - `pm2 logs digital-survey`: Ver logs en tiempo real.
   - `pm2 restart digital-survey`: Reiniciar la app.
   - `pm2 startup`: Configurar para que inicie al bootear el servidor.

## 🔑 Acceso Administrativo
El panel de control se encuentra en: `/admin.html`
Usa la clave definida en `ADMIN_PASSWORD`.

---
**Desarrollado por Antigravity para Pablo Gon | Facilitador Tecnologico**
