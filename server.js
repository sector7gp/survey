const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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

  db.run(sql, params, function(err) {
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 API + Frontend server running on http://localhost:${PORT}`);
});
