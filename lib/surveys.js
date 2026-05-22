const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_META = {
  pageTitle: 'Encuesta: Madurez Digital PyMEs',
  introTitle: 'Diagnóstico del Núcleo Digital',
  introSubtitle:
    'Evaluá cómo está gestionando la información tu empresa y descubrí tu potencial de mejora.',
  interstitialTitle:
    '¿Querés recibir tu diagnóstico completo con recomendaciones concretas para mejorar tu gestión?',
  emailSubject: 'Resultados: Tu Diagnóstico de Madurez Digital',
  emailHeading: 'Tu Reporte de Madurez Digital',
  pdfTitle: 'Diagnóstico del Núcleo Digital',
};

function generatePublicId() {
  return crypto.randomBytes(16).toString('hex');
}

function buildConfigFromLegacy(preguntas, cutoff) {
  return {
    meta: { ...DEFAULT_META },
    questions: preguntas.questions,
    profiles: preguntas.profiles,
    scoring: cutoff.scoring,
  };
}

function loadLegacyConfigFromDisk(rootDir) {
  const preguntas = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'preguntas.json'), 'utf-8')
  );
  const cutoff = JSON.parse(fs.readFileSync(path.join(rootDir, 'cutoff.json'), 'utf-8'));
  return buildConfigFromLegacy(preguntas, cutoff);
}

function validateSurveyConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuración inválida');
  }
  if (!Array.isArray(config.questions) || config.questions.length === 0) {
    throw new Error('Debe incluir al menos una pregunta');
  }
  for (const q of config.questions) {
    if (!q.text || !Array.isArray(q.options) || q.options.length === 0) {
      throw new Error('Cada pregunta debe tener texto y opciones');
    }
  }
  if (!config.profiles || typeof config.profiles !== 'object') {
    throw new Error('Debe incluir perfiles (profiles)');
  }
  if (!config.scoring?.ranges?.length) {
    throw new Error('Debe incluir scoring.ranges');
  }
  return true;
}

function parseConfigJson(configJson) {
  const config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  validateSurveyConfig(config);
  return config;
}

function toPublicPayload(surveyRow) {
  const config = parseConfigJson(surveyRow.config_json);
  return {
    surveyId: surveyRow.id,
    publicId: surveyRow.public_id,
    name: surveyRow.name,
    meta: config.meta || {},
    questions: config.questions,
    profiles: config.profiles,
    scoring: config.scoring,
  };
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function columnExists(db, table, column) {
  return dbAll(db, `PRAGMA table_info(${table})`).then((cols) =>
    cols.some((c) => c.name === column)
  );
}

async function ensureSchema(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  if (!(await columnExists(db, 'leads', 'survey_id'))) {
    await dbRun(db, 'ALTER TABLE leads ADD COLUMN survey_id INTEGER');
  }
  if (!(await columnExists(db, 'analytics', 'survey_id'))) {
    await dbRun(db, 'ALTER TABLE analytics ADD COLUMN survey_id INTEGER');
  }
}

async function seedDefaultSurvey(db, rootDir) {
  const count = await dbGet(db, 'SELECT COUNT(*) as c FROM surveys');
  if (count.c > 0) return null;

  const config = loadLegacyConfigFromDisk(rootDir);
  const publicId = generatePublicId();
  const configJson = JSON.stringify(config);

  await dbRun(
    db,
    `INSERT INTO surveys (public_id, name, config_json, active, is_default)
     VALUES (?, ?, ?, 1, 1)`,
    [publicId, 'Madurez Digital (default)', configJson]
  );

  const survey = await dbGet(db, 'SELECT * FROM surveys WHERE is_default = 1 LIMIT 1');
  await backfillSurveyIds(db, survey.id);
  console.log(`Encuesta por defecto creada. public_id=${publicId}`);
  return survey;
}

async function backfillSurveyIds(db, defaultSurveyId) {
  await dbRun(db, 'UPDATE leads SET survey_id = ? WHERE survey_id IS NULL', [
    defaultSurveyId,
  ]);
  await dbRun(db, 'UPDATE analytics SET survey_id = ? WHERE survey_id IS NULL', [
    defaultSurveyId,
  ]);
}

async function getSurveyByPublicId(db, publicId) {
  return dbGet(
    db,
    'SELECT * FROM surveys WHERE public_id = ? AND active = 1',
    [publicId]
  );
}

async function getDefaultSurvey(db) {
  let row = await dbGet(db, 'SELECT * FROM surveys WHERE is_default = 1 AND active = 1 LIMIT 1');
  if (!row) {
    row = await dbGet(db, 'SELECT * FROM surveys WHERE active = 1 ORDER BY id ASC LIMIT 1');
  }
  return row;
}

async function getSurveyById(db, id) {
  return dbGet(db, 'SELECT * FROM surveys WHERE id = ?', [id]);
}

function getEmptySurveyTemplate() {
  return {
    meta: { ...DEFAULT_META, introTitle: 'Nueva Encuesta', introSubtitle: 'Descripción de la encuesta' },
    questions: [
      {
        text: 'Pregunta de ejemplo',
        options: [
          { text: 'Opción A', points: 3 },
          { text: 'Opción B', points: 2 },
          { text: 'Opción C', points: 1 },
          { text: 'Opción D', points: 0 },
        ],
      },
    ],
    profiles: {
      red: {
        emoji: '🔴',
        label: 'Perfil bajo',
        title: 'Perfil inicial',
        scoreClass: 'profile-red',
        desc: 'Descripción del perfil rojo.',
        ctaTitle: 'Siguiente paso',
        ctaText: 'Texto de llamada a la acción.',
        ctaBtn: 'Contactar',
        ctaLink: 'https://calendar.app.google/MVb6cbu5iAAZ1SG1A',
      },
      yellow: {
        emoji: '🟡',
        label: 'Perfil medio',
        title: 'Perfil intermedio',
        scoreClass: 'profile-yellow',
        desc: 'Descripción del perfil amarillo.',
        ctaTitle: 'Siguiente paso',
        ctaText: 'Texto de llamada a la acción.',
        ctaBtn: 'Contactar',
        ctaLink: 'https://calendar.app.google/MVb6cbu5iAAZ1SG1A',
      },
      green: {
        emoji: '🟢',
        label: 'Perfil alto',
        title: 'Perfil avanzado',
        scoreClass: 'profile-green',
        desc: 'Descripción del perfil verde.',
        ctaTitle: 'Siguiente paso',
        ctaText: 'Texto de llamada a la acción.',
        ctaBtn: 'Contactar',
        ctaLink: 'https://calendar.app.google/MVb6cbu5iAAZ1SG1A',
      },
    },
    scoring: {
      min: 0,
      max: 3,
      ranges: [
        { profile: 'red', min: 0, max: 0 },
        { profile: 'yellow', min: 1, max: 2 },
        { profile: 'green', min: 3, max: 3 },
      ],
    },
  };
}

module.exports = {
  DEFAULT_META,
  generatePublicId,
  buildConfigFromLegacy,
  loadLegacyConfigFromDisk,
  validateSurveyConfig,
  parseConfigJson,
  toPublicPayload,
  dbGet,
  dbAll,
  dbRun,
  ensureSchema,
  seedDefaultSurvey,
  backfillSurveyIds,
  getSurveyByPublicId,
  getDefaultSurvey,
  getSurveyById,
  getEmptySurveyTemplate,
};
