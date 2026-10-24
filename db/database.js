/**
 * db/database.js
 * ------------------
 * SQLite persistence layer (via better-sqlite3).
 * Two tables:
 *   students   - one row per enrolled student, including their
 *                128-d face descriptor (stored as a JSON string).
 *   attendance - one row per attendance event. A UNIQUE(reg_no, date)
 *                constraint stops a student being marked twice in a day.
 */

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "attendance_system.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    reg_no          TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    branch          TEXT NOT NULL,
    course          TEXT NOT NULL,
    year            TEXT NOT NULL,
    semester        TEXT NOT NULL,
    descriptor      TEXT NOT NULL,          -- JSON array of 128 floats
    registered_on   TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no    TEXT NOT NULL,
    name      TEXT NOT NULL,
    branch    TEXT NOT NULL,
    course    TEXT NOT NULL,
    year      TEXT NOT NULL,
    semester  TEXT NOT NULL,
    date      TEXT NOT NULL,
    time      TEXT NOT NULL,
    FOREIGN KEY (reg_no) REFERENCES students(reg_no),
    UNIQUE (reg_no, date)
  );
`);

// ---------------------------------------------------------------- students

function studentExists(reg_no) {
  const row = db.prepare("SELECT 1 FROM students WHERE reg_no = ?").get(reg_no);
  return !!row;
}

function addStudent({ reg_no, name, branch, course, year, semester, descriptor }) {
  db.prepare(`
    INSERT INTO students (reg_no, name, branch, course, year, semester, descriptor)
    VALUES (@reg_no, @name, @branch, @course, @year, @semester, @descriptor)
  `).run({
    reg_no, name, branch, course, year, semester,
    descriptor: JSON.stringify(descriptor),
  });
}

function getStudent(reg_no) {
  const row = db.prepare("SELECT * FROM students WHERE reg_no = ?").get(reg_no);
  if (!row) return null;
  return { ...row, descriptor: JSON.parse(row.descriptor) };
}

function getAllStudents() {
  const rows = db.prepare("SELECT * FROM students").all();
  return rows.map((r) => ({ ...r, descriptor: JSON.parse(r.descriptor) }));
}

// -------------------------------------------------------------- attendance

function markAttendance({ reg_no, name, branch, course, year, semester }) {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA");           // YYYY-MM-DD (local)
  const time = now.toLocaleTimeString("en-GB");            // HH:MM:SS (local)

  try {
    db.prepare(`
      INSERT INTO attendance (reg_no, name, branch, course, year, semester, date, time)
      VALUES (@reg_no, @name, @branch, @course, @year, @semester, @date, @time)
    `).run({ reg_no, name, branch, course, year, semester, date, time });
    return { status: "marked", date, time };
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE/.test(err.message)) {
      return { status: "duplicate", date, time };
    }
    throw err;
  }
}


function getAttendanceByDate(date) {
  return db.prepare(`
    SELECT
      s.reg_no,
      s.name,
      s.branch,
      s.course,
      s.year,
      s.semester,
      a.date,
      a.time,
      CASE
        WHEN a.reg_no IS NOT NULL THEN 100
        ELSE 0
      END AS attendance_percentage
    FROM students s
    LEFT JOIN attendance a
      ON a.reg_no = s.reg_no
      AND a.date = ?
    ORDER BY s.reg_no
  `).all(date);
}


function getAllAttendance() {
  return db.prepare(`
    SELECT reg_no, name, branch, course, year, semester, date, time
    FROM attendance ORDER BY date DESC, time DESC
  `).all();
}

module.exports = {
  studentExists,
  addStudent,
  getStudent,
  getAllStudents,
  markAttendance,
  getAttendanceByDate,
  getAllAttendance,
};
