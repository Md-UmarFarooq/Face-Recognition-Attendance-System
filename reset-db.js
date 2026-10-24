const Database = require("better-sqlite3");

const db = new Database("./attendance_system.db");

db.prepare("DELETE FROM attendance").run();
db.prepare("DELETE FROM students").run();

console.log("All students and attendance records cleared.");
db.close();