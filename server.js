/**
 * server.js
 * ------------------
 * Express backend for the Face Recognition Attendance System.
 *
 * The browser does all the face DETECTION and ENCODING (via face-api.js
 * running on the client, using the webcam). It only ever sends a 128-number
 * face "descriptor" array to the server - never raw images - which keeps
 * payloads small and avoids storing biometric images.
 *
 * The server's job:
 *   - store students + their descriptor in SQLite
 *   - compare a submitted descriptor against stored descriptor(s)
 *     (euclidean distance) to verify identity
 *   - log attendance (once per student per day)
 */

const path = require("path");
const express = require("express");
const cors = require("cors");
const db = require("./db/database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Match threshold for euclidean distance between two 128-d descriptors.
// Lower = stricter. face-api.js's own FaceMatcher typically uses ~0.6.
const MATCH_THRESHOLD = 0.5;

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// ------------------------------------------------------------------ health

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// -------------------------------------------------------------- students

app.get("/api/students/exists/:reg_no", (req, res) => {
  res.json({ exists: db.studentExists(req.params.reg_no) });
});

app.post("/api/students", (req, res) => {
  const { reg_no, name, branch, course, year, semester, descriptor } = req.body;

  if (!reg_no || !name || !branch || !course || !year || !semester || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: "Missing or invalid required fields." });
  }
  if (descriptor.length !== 128) {
    return res.status(400).json({ error: "Descriptor must be a 128-length array." });
  }
  if (db.studentExists(reg_no)) {
    return res.status(409).json({ error: `Registration number ${reg_no} is already enrolled.` });
  }

  db.addStudent({ reg_no, name, branch, course, year, semester, descriptor });
  res.status(201).json({ message: "Student registered successfully.", reg_no });
});

// -------------------------------------------------------------- attendance

/**
 * POST /api/attendance/verify
 * body: { reg_no?: string, descriptor: number[128] }
 *
 * - If reg_no is given, the submitted descriptor is compared ONLY against
 *   that student's stored descriptor (1:1 verification).
 * - If reg_no is omitted, the descriptor is compared against every
 *   enrolled student to find the closest match (1:N identification).
 */
app.post("/api/attendance/verify", (req, res) => {
  const { reg_no, descriptor } = req.body;

  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({ error: "A 128-length face descriptor is required." });
  }

  let student = null;
  let distance = null;

  if (reg_no) {
    const candidate = db.getStudent(reg_no);
    if (!candidate) {
      return res.status(404).json({ error: `No student enrolled with registration number ${reg_no}.` });
    }
    distance = euclideanDistance(descriptor, candidate.descriptor);
    if (distance < MATCH_THRESHOLD) student = candidate;
  } else {
    const all = db.getAllStudents();
    if (all.length === 0) {
      return res.status(404).json({ error: "No students are enrolled yet." });
    }
    let best = null;
    let bestDist = Infinity;
    for (const s of all) {
      const d = euclideanDistance(descriptor, s.descriptor);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    distance = bestDist;
    if (bestDist < MATCH_THRESHOLD) student = best;
  }

  if (!student) {
    return res.status(401).json({ matched: false, distance, message: "Face did not match any enrolled record." });
  }

  const result = db.markAttendance({
    reg_no: student.reg_no,
    name: student.name,
    branch: student.branch,
    course: student.course,
    year: student.year,
    semester: student.semester,
  });

  res.json({
    matched: true,
    distance,
    status: result.status, // "marked" | "duplicate"
    date: result.date,
    time: result.time,
    student: {
      reg_no: student.reg_no,
      name: student.name,
      branch: student.branch,
      course: student.course,
      year: student.year,
      semester: student.semester,
    },
  });
});

app.get("/api/attendance", (req, res) => {
  const { date } = req.query;
  res.json(db.getAttendanceByDate(date));
});

app.get("/api/attendance/all", (req, res) => {
  res.json(db.getAllAttendance());
});

app.get("/api/attendance/export", (req, res) => {
  const { date } = req.query;
  const rows = db.getAttendanceByDate(date);
  const header = "Reg No,Name,Branch,Course,Year,Semester,Date,Time";
  const csvRows = rows.map((r) =>
    [r.reg_no, r.name, r.branch, r.course, r.year, r.semester, r.date, r.time]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");
  const filename = `attendance_${date || new Date().toLocaleDateString("en-CA")}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// Fallback: serve the SPA shell for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  Face Recognition Attendance System`);
  console.log(`  ---------------------------------`);
  console.log(`  Server running at http://localhost:${PORT}\n`);
});
