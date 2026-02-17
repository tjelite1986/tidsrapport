import Database from 'better-sqlite3';
import { hashSync } from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tidsrapport.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    salary_type TEXT NOT NULL DEFAULT 'hourly',
    hourly_rate REAL,
    monthly_salary REAL,
    overtime_rate REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    date TEXT NOT NULL,
    hours REAL NOT NULL,
    start_time TEXT,
    end_time TEXT,
    break_minutes INTEGER DEFAULT 0,
    entry_type TEXT NOT NULL DEFAULT 'work',
    overtime_type TEXT NOT NULL DEFAULT 'none',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS salary_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    working_hours_per_month REAL NOT NULL DEFAULT 160
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    workplace_type TEXT NOT NULL DEFAULT 'none',
    contract_level TEXT NOT NULL DEFAULT '3plus',
    tax_rate REAL NOT NULL DEFAULT 30,
    vacation_pay_rate REAL NOT NULL DEFAULT 12,
    vacation_pay_mode TEXT NOT NULL DEFAULT 'included',
    working_hours_per_month REAL NOT NULL DEFAULT 160,
    auto_break_calc INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS work_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS weekly_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0
  );
`);

// Seed admin user
const adminPassword = hashSync('admin123', 10);
const insertUser = sqlite.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role, salary_type, hourly_rate)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertUser.run('Admin', 'admin@example.com', adminPassword, 'admin', 'hourly', 350);

// Seed a regular user
const userPassword = hashSync('user123', 10);
insertUser.run('Anna Svensson', 'anna@example.com', userPassword, 'user', 'monthly', null);

// Update Anna's monthly salary
sqlite.prepare(`UPDATE users SET monthly_salary = 42000, overtime_rate = 250 WHERE email = 'anna@example.com'`).run();

// Seed salary settings
const insertSalary = sqlite.prepare(`INSERT OR IGNORE INTO salary_settings (user_id, working_hours_per_month) VALUES (?, ?)`);
insertSalary.run(1, 160);
insertSalary.run(2, 160);

// Seed user_settings
const insertSettings = sqlite.prepare(`INSERT OR IGNORE INTO user_settings (user_id, workplace_type, contract_level, tax_rate) VALUES (?, ?, ?, ?)`);
insertSettings.run(1, 'none', '3plus', 30);
insertSettings.run(2, 'butik', '3plus', 30);

// Seed projects
const insertProject = sqlite.prepare(`INSERT OR IGNORE INTO projects (name, description) VALUES (?, ?)`);
insertProject.run('Webbplats Redesign', 'Omdesign av företagets webbplats');
insertProject.run('Mobilapp', 'Utveckling av ny mobilapplikation');
insertProject.run('Intern Administration', 'Internt administrativt arbete');

console.log('Seed completed successfully!');
console.log('Admin: admin@example.com / admin123');
console.log('User: anna@example.com / user123');
sqlite.close();
