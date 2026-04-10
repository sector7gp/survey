require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005;

// Configurar SQLite
const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    initDb();
  }
});

// Configurar Email Transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendReportEmail(leadData, scoreData) {
  if (!process.env.SMTP_USER) {
    console.warn("SMTP_USER no configurado. El email no se enviará.");
    return;
  }

  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, 'preguntas.json'), 'utf-8')).profiles[scoreData.profile];

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
      <h1 style="color: #3b82f6;">Tu Reporte de Madurez Digital</h1>
      <p>Hola <strong>${leadData.nombre}</strong>,</p>
      <p>Gracias por realizar nuestra evaluación. Estos son tus resultados:</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0; color: #1e293b;">Perfil: ${profile.title}</h2>
        <p style="font-size: 1.2rem; font-weight: bold; color: #3b82f6;">Puntaje: ${scoreData.score} / 24</p>
        <p>${profile.desc}</p>
      </div>

      <h3>Próximos Pasos</h3>
      <p>${profile.ctaText}</p>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://calendar.app.google/MVb6cbu5iAAZ1SG1A" style="background: #3b82f6; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Agendar Reunión de Consultoría</a>
      </div>
      
      <p style="margin-top: 40px; font-size: 0.8rem; color: #9ca3af;">
        Enviado automáticamente por el Sistema de Diagnóstico Digital.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: leadData.email,
      subject: `Resultados: Tu Diagnóstico de Madurez Digital`,
      html: htmlContent,
    });
    console.log(`Email enviado con éxito a ${leadData.email}`);
  } catch (error) {
    console.error("Error enviando email:", error);
  }
}

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT,
        rubro TEXT,
        empresa TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        lead_id INTEGER,
        data TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting para la API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { error: 'Demasiadas solicitudes del mismo IP, intente luego.' }
});
app.use('/api/', apiLimiter);

// Middleware de Autenticación Admin
const checkAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (token === password) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'No autorizado' });
  }
};

// --- RUTAS ---

// Obtener Configuración
app.get('/api/config', (req, res) => {
  try {
    const preguntasData = JSON.parse(fs.readFileSync(path.join(__dirname, 'preguntas.json'), 'utf-8'));
    const cutoffData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cutoff.json'), 'utf-8'));

    res.json({
      success: true,
      data: {
        questions: preguntasData.questions,
        profiles: preguntasData.profiles,
        scoring: cutoffData.scoring
      }
    });
  } catch (error) {
    console.error("Error reading config:", error);
    res.status(500).json({ success: false, error: 'Error del servidor al leer configuración' });
  }
});

// Guardar Lead
app.post('/api/leads', (req, res) => {
  const { nombre, email, rubro, empresa, scoreData } = req.body;
  if (!nombre || !email || !rubro) {
    return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });
  }

  const sql = 'INSERT INTO leads (nombre, email, rubro, empresa) VALUES (?, ?, ?, ?)';
  const params = [nombre, email, rubro, empresa || ''];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("Error inserting lead:", err.message);
      return res.status(500).json({ success: false, error: 'Error interno guardando form' });
    }

    const leadId = this.lastID;

    // Si viene scoreData, lo guardamos en analytics y disparamos email
    if (scoreData) {
      const analyticsSql = 'INSERT INTO analytics (event_type, lead_id, data) VALUES (?, ?, ?)';
      db.run(analyticsSql, ['lead_submitted', leadId, JSON.stringify(scoreData)], (err) => {
        if (err) console.error("Error logging lead analytics:", err.message);
      });

      // Enviar Email (Asincrónico, no bloquea respuesta)
      sendReportEmail({ nombre, email }, scoreData);
    }
    
    res.status(201).json({ success: true, lead_id: leadId });
  });
});

// Trackear Analytics (Ahora soporta lead_id opcional)
app.post('/api/analytics', (req, res) => {
  const { event_type, data, lead_id } = req.body;
  if (!event_type) return res.status(400).json({ success: false });

  const sql = 'INSERT INTO analytics (event_type, data, lead_id) VALUES (?, ?, ?)';
  db.run(sql, [event_type, JSON.stringify(data || {}), lead_id || null], (err) => {
    if (err) {
      console.error("Error tracking event:", err.message);
      return res.status(500).json({ success: false });
    }
    res.status(201).json({ success: true });
  });
});

// --- RUTAS ADMIN ---

// Validar Password (Login)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || 'admin123')) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// Obtener Resultados (Leads + Score + Click en Calendario)
app.get('/api/admin/results', checkAdmin, (req, res) => {
  const sql = `
    SELECT l.*, a.data as score_data 
    FROM leads l 
    LEFT JOIN analytics a ON l.id = a.lead_id AND a.event_type = 'lead_submitted'
    ORDER BY l.fecha DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    // Parsear el JSON de score_data
    const results = rows.map(row => ({
      ...row,
      score_data: row.score_data ? JSON.parse(row.score_data) : null
    }));
    
    res.json({ success: true, data: results });
  });
});

// Estadísticas Rápidas
app.get('/api/admin/stats', checkAdmin, (req, res) => {
  const sqlStats = `
    SELECT 
      COUNT(*) as total_leads,
      (SELECT COUNT(*) FROM analytics WHERE event_type = 'survey_started') as total_started
    FROM leads
  `;
  db.get(sqlStats, [], (err, stats) => {
    if (err) return res.status(500).json({ success: false });
    
    // Distribución de perfiles desde analytics
    db.all("SELECT data FROM analytics WHERE event_type = 'lead_submitted'", [], (err, rows) => {
      const distribution = { red: 0, yellow: 0, green: 0 };
      rows.forEach(r => {
        const d = JSON.parse(r.data);
        if (d.profile && distribution[d.profile] !== undefined) distribution[d.profile]++;
      });
      
      res.json({ success: true, stats: { ...stats, profile_distribution: distribution } });
    });
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 API + Frontend server running on http://localhost:${PORT}`);
});
