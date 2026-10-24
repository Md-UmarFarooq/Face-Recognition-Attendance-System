/**
 * js/app.js
 * ------------------
 * Navigation between screens + wiring for the three workflows:
 * register, verify & mark attendance, and the ledger view.
 */

// ---- Editable kiosk configuration ----------------------------------------
const CONFIG = {
  collegeName: "Face Recognition Attendance System",
  eyebrow: "Registry Kiosk",
};
document.getElementById("college-name").textContent = CONFIG.collegeName;
document.getElementById("menu-college-name").textContent = CONFIG.collegeName;
document.getElementById("college-eyebrow").textContent = CONFIG.eyebrow;
document.getElementById("menu-eyebrow").textContent = CONFIG.eyebrow;
document.title = `${CONFIG.collegeName} · Attendance Registry`;

// ---- Navigation ------------------------------------------------------------

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.dataset.active = s.id === id ? "true" : "false";
  });
  // Stop any active camera streams when leaving their screens
  if (id !== "screen-register") FaceEngine.stopVideo(document.getElementById("video-register"));
  if (id !== "screen-verify") FaceEngine.stopVideo(document.getElementById("video-verify"));

  if (id === "screen-ledger") loadLedger();
}

document.getElementById("btn-enter").addEventListener("click", () => showScreen("screen-menu"));
document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => showScreen(el.dataset.nav));
});

// ---- Toast -----------------------------------------------------------------

let toastTimer = null;
function toast(message, kind = "") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3800);
}

// Preload the face-api models as soon as the page opens so the first
// scan doesn't stall on a multi-megabyte download.
FaceEngine.loadModels().catch((err) => {
  console.error(err);
  toast("Could not load face recognition models. Check your connection.", "error");
});

/* ==========================================================================
   REGISTER
   ========================================================================== */

const registerForm = document.getElementById("register-form");
const registerStatus = document.getElementById("register-status");
const apertureRegister = document.getElementById("aperture-register");
const videoRegister = document.getElementById("video-register");
const overlayRegister = document.getElementById("overlay-register");
const hintRegister = document.getElementById("hint-register");
const countRegister = document.getElementById("count-register");
const ringRegister = document.getElementById("ring-register");
const btnCaptureRegister = document.getElementById("btn-capture-register");

let registerController = null;

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    name: document.getElementById("reg-name").value.trim(),
    reg_no: document.getElementById("reg-regno").value.trim(),
    branch: document.getElementById("reg-branch").value,
    course: document.getElementById("reg-course").value,
    year: document.getElementById("reg-year").value,
    semester: document.getElementById("reg-semester").value,
  };

  if (Object.values(payload).some((v) => !v)) {
    registerStatus.textContent = "Please complete every field before scanning.";
    return;
  }

  try {
    const { exists } = await API.checkExists(payload.reg_no);
    if (exists) {
      registerStatus.textContent = `Registration number ${payload.reg_no} is already enrolled.`;
      return;
    }
  } catch {
    registerStatus.textContent = "Could not reach the server. Is it running?";
    return;
  }

  btnCaptureRegister.disabled = true;
  registerStatus.textContent = "";
  ringRegister.className = "aperture__ring";
  hintRegister.textContent = "Look straight at the camera and hold still.";

  try {
    await FaceEngine.loadModels();
    await FaceEngine.startVideo(videoRegister);
    apertureRegister.classList.add("scanning");

    registerController = FaceEngine.captureDescriptorSamples(videoRegister, overlayRegister, {
      numSamples: 6,
      onProgress: (n, total) => {
        countRegister.textContent = `Sample ${n} / ${total}`;
      },
    });

    const descriptor = await registerController.promise;
    apertureRegister.classList.remove("scanning");

    if (!descriptor) {
      hintRegister.textContent = "Capture cancelled or no face detected. Press the button to try again.";
      countRegister.textContent = "";
      return;
    }

    await API.registerStudent({ ...payload, descriptor });

    ringRegister.className = "aperture__ring success";
    hintRegister.textContent = `${payload.name} (${payload.reg_no}) registered successfully.`;
    countRegister.textContent = "";
    toast(`Registered ${payload.name} — ${payload.reg_no}`, "success");
    registerForm.reset();

    setTimeout(() => {
      FaceEngine.stopVideo(videoRegister);
      showScreen("screen-menu");
    }, 1400);
  } catch (err) {
    ringRegister.className = "aperture__ring fail";
    hintRegister.textContent = err.message || "Registration failed. Please try again.";
    toast(err.message || "Registration failed.", "error");
  } finally {
    btnCaptureRegister.disabled = false;
  }
});

/* ==========================================================================
   VERIFY & MARK ATTENDANCE
   ========================================================================== */

const apertureVerify = document.getElementById("aperture-verify");
const videoVerify = document.getElementById("video-verify");
const overlayVerify = document.getElementById("overlay-verify");
const ringVerify = document.getElementById("ring-verify");
const btnStartVerify = document.getElementById("btn-start-verify");
const verifyRegnoInput = document.getElementById("verify-regno");
const verifyResult = document.getElementById("verify-result");

btnStartVerify.addEventListener("click", async () => {
  const regNo = verifyRegnoInput.value.trim();

  btnStartVerify.disabled = true;
  ringVerify.className = "aperture__ring";
  verifyResult.className = "result-panel";
  verifyResult.textContent = "Opening camera…";

  try {
    await FaceEngine.loadModels();
    await FaceEngine.startVideo(videoVerify);
    apertureVerify.classList.add("scanning");
    verifyResult.textContent = "Align your face within the frame…";

    const controller = FaceEngine.captureSingleDescriptor(videoVerify, overlayVerify, { timeoutMs: 20000 });
    const descriptor = await controller.promise;
    apertureVerify.classList.remove("scanning");

    if (!descriptor) {
      ringVerify.className = "aperture__ring fail";
      verifyResult.className = "result-panel fail";
      verifyResult.innerHTML = `<span class="rp-title">No face detected</span>Please try again and make sure your face is well lit and centered.`;
      return;
    }

    const { data } = await API.verifyAndMark({ regNo, descriptor });

    if (!data.matched) {
      ringVerify.className = "aperture__ring fail";
      verifyResult.className = "result-panel fail";
      verifyResult.innerHTML = `<span class="rp-title">Verification failed</span>${data.error || data.message || "Face did not match an enrolled record."}`;
      return;
    }

    ringVerify.className = "aperture__ring success";
    verifyResult.className = "result-panel success";
    const s = data.student;
    if (data.status === "marked") {
      verifyResult.innerHTML = `
        <span class="rp-title">✓ Attendance marked</span>
        ${s.name} — <span class="mono">${s.reg_no}</span><br/>
        ${s.branch} · ${s.course} · ${s.year} · Sem ${s.semester}
        <div class="rp-meta">${data.date} at ${data.time}</div>`;
      toast(`Attendance marked for ${s.name}`, "success");
    } else {
      verifyResult.innerHTML = `
        <span class="rp-title">Already marked today</span>
        ${s.name} — <span class="mono">${s.reg_no}</span> was already recorded present today.`;
      toast(`${s.name} already marked present today.`);
    }

    setTimeout(() => FaceEngine.stopVideo(videoVerify), 800);
  } catch (err) {
    ringVerify.className = "aperture__ring fail";
    verifyResult.className = "result-panel fail";
    verifyResult.innerHTML = `<span class="rp-title">Error</span>${err.message || "Something went wrong."}`;
  } finally {
    btnStartVerify.disabled = false;
  }
});

/* ==========================================================================
   LEDGER
   ========================================================================== */

const ledgerBody = document.getElementById("ledger-body");
const ledgerDate = document.getElementById("ledger-date");
const btnRefreshLedger = document.getElementById("btn-refresh-ledger");
const btnExportLedger = document.getElementById("btn-export-ledger");

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
ledgerDate.value = todayISO();


async function loadLedger() {
  ledgerBody.innerHTML =
    `<tr class="ledger-empty"><td colspan="9">Loading…</td></tr>`;

  try {
    const rows = await API.getLedger(ledgerDate.value);

    if (!rows.length) {
      ledgerBody.innerHTML =
        `<tr class="ledger-empty"><td colspan="9">No attendance recorded for this date yet.</td></tr>`;
      return;
    }

    ledgerBody.innerHTML = rows
      .map((r, i) => `
        <tr>
          <td class="col-no">${i + 1}</td>
          <td class="mono">${r.reg_no}</td>
          <td>${r.name}</td>
          <td>${r.branch}</td>
          <td>${r.course}</td>
          <td>${r.year}</td>
          <td>${r.semester}</td>
          <td class="mono">${r.time}</td>
          <td>${r.attendance_percentage}%</td>
        </tr>
      `)
      .join("");
  } catch (err) {
    ledgerBody.innerHTML =
      `<tr class="ledger-empty"><td colspan="9">${err.message}</td></tr>`;
  }
}


btnRefreshLedger.addEventListener("click", loadLedger);
ledgerDate.addEventListener("change", loadLedger);
btnExportLedger.addEventListener("click", () => {
  window.location.href = API.exportUrl(ledgerDate.value);
});
