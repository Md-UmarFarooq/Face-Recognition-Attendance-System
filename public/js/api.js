/**
 * js/api.js
 * ------------------
 * Thin wrapper around the backend REST API (see server.js).
 */

const API = {
  async checkExists(regNo) {
    const res = await fetch(`/api/students/exists/${encodeURIComponent(regNo)}`);
    if (!res.ok) throw new Error("Could not reach server.");
    return res.json();
  },

  async registerStudent(payload) {
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed.");
    return data;
  },

  async verifyAndMark({ regNo, descriptor }) {
    const res = await fetch("/api/attendance/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reg_no: regNo || undefined, descriptor }),
    });
    const data = await res.json();
    // Non-2xx here is a meaningful business outcome (no match / not found),
    // not necessarily an exception — the caller inspects `matched`.
    return { ok: res.ok, status: res.status, data };
  },

  async getLedger(date) {
    const url = date ? `/api/attendance?date=${encodeURIComponent(date)}` : "/api/attendance";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not fetch attendance records.");
    return res.json();
  },

  exportUrl(date) {
    return date ? `/api/attendance/export?date=${encodeURIComponent(date)}` : "/api/attendance/export";
  },
};
