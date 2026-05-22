const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
console.log(`Conectando a la base de datos en: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al abrir la base de datos:", err.message);
    process.exit(1);
  }
  console.log("Conexión establecida con SQLite.");
  runMigrations();
});

function runMigrations() {
  db.serialize(() => {
    // 1. Asegurar que las tablas básicas existan
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

    // 2. Definir las nuevas columnas a agregar
    const newColumns = [
      { name: 'tamano_empresa', type: 'TEXT' },
      { name: 'provincia', type: 'TEXT' },
      { name: 'ciudad', type: 'TEXT' },
      { name: 'whatsapp', type: 'TEXT' },
      { name: 'cargo', type: 'TEXT' }
    ];

    // 3. Agregar cada columna si no existe
    db.all("PRAGMA table_info(leads)", [], (err, columns) => {
      if (err) {
        console.error("Error al verificar la estructura de la tabla:", err.message);
        db.close();
        process.exit(1);
      }

      const existingNames = columns.map(col => col.name);
      
      newColumns.forEach(newCol => {
        if (!existingNames.includes(newCol.name)) {
          const alterSql = `ALTER TABLE leads ADD COLUMN ${newCol.name} ${newCol.type}`;
          db.run(alterSql, (alterErr) => {
            if (alterErr) {
              console.error(`Error agregando columna ${newCol.name}:`, alterErr.message);
            } else {
              console.log(`Columna agregada con éxito: ${newCol.name}`);
            }
          });
        } else {
          console.log(`La columna ya existe: ${newCol.name}`);
        }
      });

      // Cerrar la base de datos al finalizar
      db.configure("busyTimeout", 1000);
      setTimeout(() => {
        db.close((closeErr) => {
          if (closeErr) console.error("Error al cerrar la base de datos:", closeErr.message);
          else console.log("Migración completada con éxito.");
        });
      }, 500);
    });
  });
}
