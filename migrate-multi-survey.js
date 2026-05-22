/**
 * Migración: soporte multi-encuesta (tabla surveys + survey_id en leads/analytics).
 * Ejecutar: node migrate-multi-survey.js
 */
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const {
  ensureSchema,
  seedDefaultSurvey,
  getDefaultSurvey,
  backfillSurveyIds,
} = require('./lib/surveys');

const dbPath = path.join(__dirname, 'database.sqlite');
const rootDir = __dirname;

const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
    process.exit(1);
  }
  console.log('Conexión establecida con SQLite.');

  try {
    await ensureSchema(db);
    const seeded = await seedDefaultSurvey(db, rootDir);
    const def = await getDefaultSurvey(db);
    if (def) {
      await backfillSurveyIds(db, def.id);
      console.log(`Encuesta por defecto: id=${def.id}, public_id=${def.public_id}`);
    }
    if (seeded) {
      console.log('Se importó la encuesta desde preguntas.json + cutoff.json.');
    } else {
      console.log('Las encuestas ya existían; solo se aplicó el esquema y backfill.');
    }
    console.log('Migración multi-encuesta completada.');
  } catch (e) {
    console.error('Error en migración:', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
});
