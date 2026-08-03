// lib/db.js
// 데모/개발용 파일 기반 저장소.
// 운영 환경에서는 PostgreSQL + Prisma 등 실제 DB로 교체할 것을 권장합니다.
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], attendanceLogs: [], antiSpoofLogs: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { users: [], attendanceLogs: [], antiSpoofLogs: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getUsers() {
  return readDb().users;
}

export function addUser(user) {
  const db = readDb();
  db.users.push(user);
  writeDb(db);
  return user;
}

export function deleteUser(id) {
  const db = readDb();
  db.users = db.users.filter((u) => u.id !== id);
  writeDb(db);
}

export function getAttendanceLogs() {
  return readDb().attendanceLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

export function addAttendanceLog(log) {
  const db = readDb();
  db.attendanceLogs.push(log);
  writeDb(db);
  return log;
}

export function getAntiSpoofLogs() {
  return readDb().antiSpoofLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

export function addAntiSpoofLog(log) {
  const db = readDb();
  db.antiSpoofLogs.push(log);
  // 최근 500건만 유지
  if (db.antiSpoofLogs.length > 500) {
    db.antiSpoofLogs = db.antiSpoofLogs.slice(-500);
  }
  writeDb(db);
  return log;
}

// 마지막 출결 시각 대비 중복 체크 (분 단위)
export function hasRecentAttendance(userId, withinMinutes = 5) {
  const logs = readDb().attendanceLogs.filter((l) => l.userId === userId);
  if (logs.length === 0) return false;
  const last = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  const diffMs = Date.now() - new Date(last.timestamp).getTime();
  return diffMs < withinMinutes * 60 * 1000;
}
