require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
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

    // Si viene scoreData, lo guardamos en analytics
    if (scoreData) {
      const analyticsSql = 'INSERT INTO analytics (event_type, lead_id, data) VALUES (?, ?, ?)';
      db.run(analyticsSql, ['lead_submitted', leadId, JSON.stringify(scoreData)], (err) => {
        if (err) console.error("Error logging lead analytics:", err.message);
      });
    }

    res.status(201).json({ success: true, lead_id: leadId });
  });
});

// Trackear Analytics
app.post('/api/analytics', (req, res) => {
  const { event_type, data } = req.body;
  if (!event_type) return res.status(400).json({ success: false });

  db.run('INSERT INTO analytics (event_type, data) VALUES (?, ?)', [event_type, JSON.stringify(data || {})], (err) => {
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

// Obtener Resultados (Leads + Score)
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
