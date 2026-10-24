# Face Recognition Attendance System (HTML / CSS / JavaScript)

A browser-based attendance kiosk: **HTML + CSS + vanilla JavaScript** frontend
(using [face-api.js](https://github.com/justadudewhohacks/face-api.js) for
in-browser face detection & recognition) with a **Node.js + Express + SQLite**
backend for storage.

All model weights and the face-api.js library are bundled in this project —
no external CDN is required to run it once dependencies are installed.

## How it works

1. **Splash screen** — shows the college name and "Attendance Registry" title.
2. **Register Student** — enter Name, Registration Number, Branch, Course,
   Year, Semester. Pressing "Capture Face & Register" opens the webcam
   inside a circular scan aperture, takes 6 face readings, averages them
   into one 128-number face descriptor, and saves it to the database.
3. **Verify & Mark Attendance** — optionally enter a Registration Number
   (for 1:1 verification) or leave it blank (for 1:N auto-identification
   against every enrolled student). The webcam scans the live face; on a
   match, attendance is logged with date & time.
4. **Attendance Ledger** — browse any date's attendance in a table and
   export it to CSV.

Each student can only be marked present **once per day** (enforced by a
`UNIQUE(reg_no, date)` constraint in SQLite).

**Privacy note:** the browser does all face detection/encoding locally.
Only the numeric 128-value descriptor is ever sent to the server — raw
images/video frames never leave the device.

## Project Structure

```
face_attendance_web/
├── server.js                  # Express server + REST API
├── package.json
├── db/
│   └── database.js             # SQLite schema + queries (better-sqlite3)
└── public/                     # Everything served to the browser
    ├── index.html               # Single-page app shell (all screens)
    ├── css/style.css            # "Registry Kiosk" design system
    ├── js/
    │   ├── api.js                # fetch() wrapper for the backend API
    │   ├── face.js               # face-api.js wrapper (webcam, descriptors)
    │   ├── app.js                # navigation + screen logic
    │   └── lib/face-api.min.js   # bundled face-api.js library
    └── models/                   # bundled face-api.js pretrained weights
        ├── tiny_face_detector_model-*
        ├── face_landmark_68_model-*
        └── face_recognition_model-*
```

## Database Schema (SQLite — `attendance_system.db`, auto-created on first run)

**students**
| column        | type | notes                                    |
|---------------|------|--------------------------------------------|
| reg_no        | TEXT | Primary key                                 |
| name          | TEXT |                                              |
| branch        | TEXT |                                              |
| course        | TEXT |                                              |
| year          | TEXT |                                              |
| semester      | TEXT |                                              |
| descriptor    | TEXT | JSON array of 128 floats (the face encoding)|
| registered_on | TEXT | timestamp                                   |

**attendance**
| column   | type    | notes                                       |
|----------|---------|----------------------------------------------|
| id       | INTEGER | Primary key, autoincrement                    |
| reg_no   | TEXT    | Foreign key → students.reg_no                 |
| name, branch, course, year, semester | TEXT | copied at time of marking |
| date     | TEXT    | YYYY-MM-DD                                    |
| time     | TEXT    | HH:MM:SS                                      |

`UNIQUE(reg_no, date)` prevents double-marking on the same day.

## Setup

Requires **Node.js 18+** and a webcam. The browser will ask for camera
permission — allow it. For the camera to work, the site must be served over
`http://localhost` (fine) or **https** (required if you ever deploy it
somewhere other than localhost — browsers block camera access on plain HTTP
for non-localhost origins).

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Then open **http://localhost:3000** in your browser (Chrome, Edge, or
Firefox recommended).

## Customizing

- Change `CONFIG.collegeName` at the top of `public/js/app.js` to your
  institution's name.
- Edit the `<option>` lists in the register form inside `public/index.html`
  (Branch / Course / Year / Semester) to match your college's offerings.
- Match strictness is controlled by `MATCH_THRESHOLD` in `server.js`
  (default `0.5`; lower = stricter, fewer false matches but more retries).
- Colors, type, and layout tokens are defined as CSS variables at the top
  of `public/css/style.css`.

## Viewing the database directly

```bash
sqlite3 attendance_system.db "SELECT * FROM attendance;"
```
Or open `attendance_system.db` with any SQLite GUI browser.

## Possible Extensions

- Add an admin login before allowing new student registration.
- Add liveness detection (blink/head-turn prompt) to resist photo spoofing.
- Deploy behind HTTPS and let students check in from their own phones.
- Add a monthly attendance percentage report per student.
