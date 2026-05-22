require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const path = require('path');
const { generatePDF } = require('./pdfGenerator');
const surveys = require('./lib/surveys');

const app = express();
const PORT = process.env.PORT || 3005;
const ROOT_DIR = __dirname;

const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDb();
  }
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function initDb() {
  db.serialize(async () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT,
        rubro TEXT,
        empresa TEXT,
        tamano_empresa TEXT,
        provincia TEXT,
        ciudad TEXT,
        whatsapp TEXT,
        cargo TEXT,
        survey_id INTEGER,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        lead_id INTEGER,
        survey_id INTEGER,
        data TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await surveys.ensureSchema(db);
      await surveys.seedDefaultSurvey(db, ROOT_DIR);
      const def = await surveys.getDefaultSurvey(db);
      if (def) await surveys.backfillSurveyIds(db, def.id);
    } catch (e) {
      console.error('Error inicializando encuestas:', e.message);
    }
  });
}

async function resolveSurvey(publicId) {
  if (publicId) {
    const row = await surveys.getSurveyByPublicId(db, publicId);
    if (!row) return null;
    return row;
  }
  return surveys.getDefaultSurvey(db);
}

async function sendReportEmail(leadData, scoreData, surveyRow) {
  if (!process.env.SMTP_USER) {
    console.warn('SMTP_USER no configurado. El email no se enviará.');
    return;
  }

  const config = surveys.parseConfigJson(surveyRow.config_json);
  const meta = config.meta || {};
  const profile = config.profiles[scoreData.profile];
  if (!profile) {
    console.error('Perfil no encontrado en configuración:', scoreData.profile);
    return;
  }

  const maxScore = config.scoring?.max ?? 24;
  const emailHeading = meta.emailHeading || 'Tu Reporte';
  const calendarLink =
    profile.ctaLink || 'https://calendar.app.google/MVb6cbu5iAAZ1SG1A';

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
      <h1 style="color: #3b82f6;">${emailHeading}</h1>
      <p>Hola <strong>${leadData.nombre}</strong>,</p>
      <p>Gracias por realizar nuestra evaluación. Adjuntamos a este correo tu reporte en PDF con las respuestas y recomendaciones personalizadas.</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0; color: #1e293b;">Perfil: ${profile.title}</h2>
        <p style="font-size: 1.2rem; font-weight: bold; color: #3b82f6;">Puntaje: ${scoreData.score} / ${maxScore}</p>
        <p>${profile.desc}</p>
      </div>

      <h3>Próximos Pasos</h3>
      <p>${profile.ctaText}</p>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="${calendarLink}" style="background: #3b82f6; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Agendar Reunión de Consultoría</a>
      </div>
      
      <p style="margin-top: 40px; font-size: 0.8rem; color: #9ca3af;">
        Pablo Gon | Facilitador Tecnologico
      </p>
    </div>
  `;

  try {
    const pdfTitle = meta.pdfTitle || emailHeading;
    const pdfBuffer = await generatePDF(leadData, scoreData, profile, {
      maxScore,
      pdfTitle,
    });
    const safeName = leadData.nombre
      ? leadData.nombre.replace(/[^a-z0-9]/gi, '_')
      : 'Lead';

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: leadData.email,
      subject: meta.emailSubject || `Resultados: ${surveyRow.name}`,
      html: htmlContent,
      attachments: [
        {
          filename: `Reporte_${safeName}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
    console.log(`Email enviado con éxito a ${leadData.email}`);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
}

function handleScoreData(leadId, surveyId, scoreData, userData, surveyRow, res) {
  if (scoreData) {
    db.run(
      'DELETE FROM analytics WHERE lead_id = ? AND event_type = "lead_submitted"',
      [leadId],
      () => {
        const analyticsSql =
          'INSERT INTO analytics (event_type, lead_id, survey_id, data) VALUES (?, ?, ?, ?)';
        db.run(
          analyticsSql,
          ['lead_submitted', leadId, surveyId, JSON.stringify(scoreData)],
          (err) => {
            if (err) console.error('Error logging lead analytics:', err.message);
          }
        );
      }
    );
    sendReportEmail(userData, scoreData, surveyRow);
  }
  res.status(201).json({ success: true, lead_id: leadId });
}

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes del mismo IP, intente luego.' },
});
app.use('/api/', apiLimiter);

const checkAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  if (token === password) next();
  else res.status(401).json({ success: false, error: 'No autorizado' });
};

// Encuesta pública por ID (ruta amigable)
app.get('/e/:publicId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// --- PÚBLICO: configuración por public_id ---

app.get('/api/surveys/:publicId/config', async (req, res) => {
  try {
    const row = await surveys.getSurveyByPublicId(db, req.params.publicId);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
    }
    res.json({ success: true, data: surveys.toPublicPayload(row) });
  } catch (error) {
    console.error('Error reading survey config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compatibilidad: encuesta por defecto
app.get('/api/config', async (req, res) => {
  try {
    const publicId = req.query.s || req.query.publicId;
    const row = await resolveSurvey(publicId);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
    }
    res.json({ success: true, data: surveys.toPublicPayload(row) });
  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ success: false, error: 'Error del servidor al leer configuración' });
  }
});

app.post('/api/leads', async (req, res) => {
  const {
    nombre,
    email,
    rubro,
    empresa,
    tamano_empresa,
    provincia,
    ciudad,
    whatsapp,
    cargo,
    scoreData,
    survey_id,
    public_id,
  } = req.body;

  if (!email) return res.status(400).json({ success: false, error: 'Email obligatorio' });

  try {
    let surveyRow = null;
    if (survey_id) {
      surveyRow = await surveys.getSurveyById(db, survey_id);
    } else if (public_id) {
      surveyRow = await surveys.getSurveyByPublicId(db, public_id);
    } else {
      surveyRow = await surveys.getDefaultSurvey(db);
    }

    if (!surveyRow) {
      return res.status(400).json({ success: false, error: 'Encuesta inválida' });
    }

    const surveyId = surveyRow.id;

    db.get(
      'SELECT id FROM leads WHERE email = ? AND survey_id = ?',
      [email, surveyId],
      (err, row) => {
        if (err) return res.status(500).json({ success: false });

        const userData = {
          nombre,
          email,
          rubro,
          empresa,
          tamano_empresa,
          provincia,
          ciudad,
          whatsapp,
          cargo,
        };

        if (row) {
          const leadId = row.id;
          const fields = [];
          const params = [];

          if (nombre !== undefined) {
            fields.push('nombre = ?');
            params.push(nombre);
          }
          if (rubro !== undefined) {
            fields.push('rubro = ?');
            params.push(rubro);
          }
          if (empresa !== undefined) {
            fields.push('empresa = ?');
            params.push(empresa);
          }
          if (tamano_empresa !== undefined) {
            fields.push('tamano_empresa = ?');
            params.push(tamano_empresa);
          }
          if (provincia !== undefined) {
            fields.push('provincia = ?');
            params.push(provincia);
          }
          if (ciudad !== undefined) {
            fields.push('ciudad = ?');
            params.push(ciudad);
          }
          if (whatsapp !== undefined) {
            fields.push('whatsapp = ?');
            params.push(whatsapp);
          }
          if (cargo !== undefined) {
            fields.push('cargo = ?');
            params.push(cargo);
          }

          params.push(leadId);

          const afterUpdate = (updateErr) => {
            if (updateErr) console.error('Error updating lead:', updateErr.message);
            handleScoreData(leadId, surveyId, scoreData, userData, surveyRow, res);
          };

          if (fields.length > 0) {
            const updateSql = `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`;
            db.run(updateSql, params, afterUpdate);
          } else {
            afterUpdate(null);
          }
        } else {
          const insertSql =
            'INSERT INTO leads (nombre, email, rubro, empresa, tamano_empresa, provincia, ciudad, whatsapp, cargo, survey_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
          db.run(
            insertSql,
            [
              nombre || '',
              email,
              rubro || '',
              empresa || '',
              tamano_empresa || '',
              provincia || '',
              ciudad || '',
              whatsapp || '',
              cargo || '',
              surveyId,
            ],
            function insertCb(insertErr) {
              if (insertErr) return res.status(500).json({ success: false });
              handleScoreData(this.lastID, surveyId, scoreData, userData, surveyRow, res);
            }
          );
        }
      }
    );
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/analytics', async (req, res) => {
  const { event_type, data, lead_id, survey_id, public_id } = req.body;
  if (!event_type) return res.status(400).json({ success: false });

  try {
    let resolvedSurveyId = survey_id || null;
    if (!resolvedSurveyId && public_id) {
      const row = await surveys.getSurveyByPublicId(db, public_id);
      if (row) resolvedSurveyId = row.id;
    }
    if (!resolvedSurveyId) {
      const def = await surveys.getDefaultSurvey(db);
      if (def) resolvedSurveyId = def.id;
    }

    const sql =
      'INSERT INTO analytics (event_type, data, lead_id, survey_id) VALUES (?, ?, ?, ?)';
    db.run(sql, [event_type, JSON.stringify(data || {}), lead_id || null, resolvedSurveyId], (err) => {
      if (err) {
        console.error('Error tracking event:', err.message);
        return res.status(500).json({ success: false });
      }
      res.status(201).json({ success: true });
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- ADMIN ---

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || 'admin123')) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

function surveyFilterClause(surveyId, alias = 'l') {
  if (!surveyId) return { clause: '', params: [] };
  return { clause: ` AND ${alias}.survey_id = ?`, params: [surveyId] };
}

app.get('/api/admin/surveys', checkAdmin, async (req, res) => {
  try {
    const rows = await surveys.dbAll(
      db,
      `SELECT s.id, s.public_id, s.name, s.active, s.is_default, s.created_at, s.updated_at,
        (SELECT COUNT(*) FROM leads l WHERE l.survey_id = s.id) as lead_count
       FROM surveys s ORDER BY s.is_default DESC, s.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/surveys/:id', checkAdmin, async (req, res) => {
  try {
    const row = await surveys.getSurveyById(db, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'No encontrada' });
    res.json({
      success: true,
      data: {
        id: row.id,
        public_id: row.public_id,
        name: row.name,
        active: row.active,
        is_default: row.is_default,
        config: surveys.parseConfigJson(row.config_json),
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/surveys', checkAdmin, async (req, res) => {
  const { name, config, active = 1, clone_from_id } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Nombre obligatorio' });

  try {
    let surveyConfig = config;
    if (!surveyConfig && clone_from_id) {
      const src = await surveys.getSurveyById(db, clone_from_id);
      if (!src) return res.status(400).json({ success: false, error: 'Encuesta origen no encontrada' });
      surveyConfig = surveys.parseConfigJson(src.config_json);
    }
    if (!surveyConfig) surveyConfig = surveys.getEmptySurveyTemplate();

    surveys.validateSurveyConfig(surveyConfig);
    const publicId = surveys.generatePublicId();
    const configJson = JSON.stringify(surveyConfig);

    const result = await surveys.dbRun(
      db,
      `INSERT INTO surveys (public_id, name, config_json, active, is_default)
       VALUES (?, ?, ?, ?, 0)`,
      [publicId, name, configJson, active ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.lastID,
        public_id: publicId,
        public_url: `/e/${publicId}`,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/surveys/:id', checkAdmin, async (req, res) => {
  const { name, config, active, is_default } = req.body;
  try {
    const existing = await surveys.getSurveyById(db, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'No encontrada' });

    const fields = [];
    const params = [];

    if (name !== undefined) {
      fields.push('name = ?');
      params.push(name);
    }
    if (config !== undefined) {
      surveys.validateSurveyConfig(config);
      fields.push('config_json = ?');
      params.push(JSON.stringify(config));
    }
    if (active !== undefined) {
      fields.push('active = ?');
      params.push(active ? 1 : 0);
    }
    if (is_default === true) {
      await surveys.dbRun(db, 'UPDATE surveys SET is_default = 0');
      fields.push('is_default = 1');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await surveys.dbRun(
      db,
      `UPDATE surveys SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/surveys/:id', checkAdmin, async (req, res) => {
  try {
    const row = await surveys.getSurveyById(db, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'No encontrada' });
    if (row.is_default) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar la encuesta por defecto',
      });
    }

    const leadCount = await surveys.dbGet(
      db,
      'SELECT COUNT(*) as c FROM leads WHERE survey_id = ?',
      [req.params.id]
    );
    if (leadCount.c > 0) {
      await surveys.dbRun(db, 'UPDATE surveys SET active = 0 WHERE id = ?', [
        req.params.id,
      ]);
      return res.json({
        success: true,
        deactivated: true,
        message: 'Encuesta desactivada (tiene leads asociados)',
      });
    }

    await surveys.dbRun(db, 'DELETE FROM analytics WHERE survey_id = ?', [req.params.id]);
    await surveys.dbRun(db, 'DELETE FROM surveys WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/results', checkAdmin, (req, res) => {
  const surveyId = req.query.survey_id ? parseInt(req.query.survey_id, 10) : null;
  const { clause, params } = surveyFilterClause(surveyId, 'l');

  const sql = `
    SELECT 
      l.id, l.nombre, l.email, l.rubro, l.empresa, l.tamano_empresa, l.provincia, l.ciudad, l.whatsapp, l.cargo, l.fecha, l.survey_id,
      s.name as survey_name,
      a1.data as score_data,
      (SELECT 1 FROM analytics a2 WHERE a2.lead_id = l.id AND a2.event_type = 'cta_clicked' LIMIT 1) as clicked_cta
    FROM leads l 
    LEFT JOIN surveys s ON s.id = l.survey_id
    LEFT JOIN analytics a1 ON l.id = a1.lead_id AND a1.event_type = 'lead_submitted'
    WHERE 1=1 ${clause}
    GROUP BY l.id
    ORDER BY l.fecha DESC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });

    const results = rows.map((row) => ({
      ...row,
      score_data: row.score_data ? JSON.parse(row.score_data) : null,
    }));

    res.json({ success: true, data: results });
  });
});

app.get('/api/admin/stats', checkAdmin, (req, res) => {
  const surveyId = req.query.survey_id ? parseInt(req.query.survey_id, 10) : null;
  const { clause, params } = surveyFilterClause(surveyId, 'l');

  const sqlStats = `
    SELECT 
      COUNT(*) as total_leads,
      (SELECT COUNT(*) FROM analytics a WHERE a.event_type = 'survey_started' ${surveyId ? 'AND a.survey_id = ?' : ''}) as total_started
    FROM leads l
    WHERE 1=1 ${clause}
  `;

  const statsParams = surveyId ? [...params, surveyId] : params;

  db.get(sqlStats, statsParams, (err, statsRow) => {
    if (err) return res.status(500).json({ success: false });

    const analyticsClause = surveyId
      ? "event_type = 'lead_submitted' AND survey_id = ?"
      : "event_type = 'lead_submitted'";
    const analyticsParams = surveyId ? [surveyId] : [];

    db.all(
      `SELECT data FROM analytics WHERE ${analyticsClause}`,
      analyticsParams,
      (aErr, rows) => {
        const distribution = {};
        (rows || []).forEach((r) => {
          const d = JSON.parse(r.data);
          if (d.profile) {
            distribution[d.profile] = (distribution[d.profile] || 0) + 1;
          }
        });

        res.json({
          success: true,
          stats: { ...statsRow, profile_distribution: distribution },
        });
      }
    );
  });
});

app.delete('/api/admin/leads/:id', checkAdmin, (req, res) => {
  const { id } = req.params;

  db.serialize(() => {
    db.run('DELETE FROM analytics WHERE lead_id = ?', [id], (err) => {
      if (err) console.error('Error deleting analytics:', err.message);
    });

    db.run('DELETE FROM leads WHERE id = ?', [id], function deleteLead(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, changes: this.changes });
    });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API + Frontend server running on http://localhost:${PORT}`);
});
