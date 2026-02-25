const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
require("dotenv").config();

function resolveDbPath(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    throw new Error('DATABASE_URL must start with "file:" for SQLite.');
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) {
    throw new Error("DATABASE_URL is missing a database path.");
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

const dbPath = resolveDbPath(process.env.DATABASE_URL || "file:./prisma/dev.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ddl = `
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  fname TEXT NOT NULL,
  mname TEXT,
  lname TEXT NOT NULL,
  dob TEXT NOT NULL,
  gender TEXT NOT NULL,
  nationality TEXT NOT NULL,
  address TEXT NOT NULL,
  city_prov TEXT NOT NULL,
  contact_no TEXT NOT NULL,
  category TEXT NOT NULL,
  shirt_size TEXT NOT NULL,
  emergency_full_name TEXT NOT NULL,
  emergency_contact_no TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES event(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  gcash_number TEXT,
  amount REAL NOT NULL,
  proof_of_payment TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_event_id ON client(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_client_id ON payment(client_id);
`;

db.exec(ddl);

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('event', 'client', 'payment') ORDER BY name"
  )
  .all()
  .map((row) => row.name);

db.close();

console.log(`Schema pushed to SQLite database: ${dbPath}`);
console.log(`Tables available: ${tables.join(", ")}`);
