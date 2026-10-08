import { validateFamilyDeletionConfirmation } from "./family-deletion.ts";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Attempt } from "./mastery.ts";
import { reportSummary } from "./report.ts";

export type StudentRecord = { id: string; name: string; attempts: Attempt[]; createdAt: string };
export type FamilyRecord = { id: string; name: string; phone: string; pinSalt: string; pinHash: string; students: StudentRecord[]; createdAt: string };
type Session = { familyId?: string; admin?: true; expiresAt: number };
type Failure = { count: number; until: number };
type Store = { families: FamilyRecord[]; sessions: Record<string, Session>; failures: Record<string, Failure> };

function dataDir(): string { return process.env.LOCAL_FAMILY_DATA_DIR || join(process.cwd(), ".local-data"); }
function storePath(): string { return join(dataDir(), "families.json"); }
function ensureDir(): void { mkdirSync(dataDir(), { recursive: true, mode: 0o700 }); }
function load(): Store {
  ensureDir();
  if (!existsSync(storePath())) return { families: [], sessions: {}, failures: {} };
  return JSON.parse(readFileSync(storePath(), "utf8")) as Store;
}
function save(store: Store): void {
  ensureDir();
  const temp = `${storePath()}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(store), { mode: 0o600 });
  renameSync(temp, storePath());
}
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function hashPin(pin: string, salt: string): string { return scryptSync(pin, salt, 32).toString("hex"); }
function equalHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex"), b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Vui lòng nhập họ tên.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Họ tên cần từ 2 đến 80 ký tự.");
  return name;
}
export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") throw new Error("Vui lòng nhập số điện thoại.");
  const digits = value.replace(/[\s().-]/g, "");
  const phone = digits.startsWith("0") ? `+84${digits.slice(1)}` : digits.startsWith("84") ? `+${digits}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Số điện thoại chưa đúng định dạng.");
  return phone;
}
function validatePin(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4,8}$/.test(value)) throw new Error("Mã PIN cần từ 4 đến 8 chữ số.");
  return value;
}
function sessionFor(store: Store, familyId?: string, admin?: true): string {
  const token = randomBytes(32).toString("base64url");
  store.sessions[hashToken(token)] = { familyId, admin, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  return token;
}
export function publicFamily(family: FamilyRecord) {
  return { id: family.id, name: family.name, phone: family.phone,
    students: family.students.map(({ id, name, attempts }) => ({ id, name, answers: attempts.length })) };
}
export function signUpFamily(nameValue: unknown, phoneValue: unknown, pinValue: unknown) {
  const name = cleanName(nameValue), phone = normalizePhone(phoneValue), pin = validatePin(pinValue);
  const store = load();
  if (store.families.some((family) => family.phone === phone)) throw new Error("Số điện thoại này đã có tài khoản. Hãy đăng nhập hoặc liên hệ hỗ trợ.");
  const salt = randomBytes(16).toString("hex");
  const family: FamilyRecord = { id: randomUUID(), name, phone, pinSalt: salt, pinHash: hashPin(pin, salt), students: [], createdAt: new Date().toISOString() };
  store.families.push(family);
  const token = sessionFor(store, family.id);
  save(store);
  return { family: publicFamily(family), token };
}
export function signInFamily(phoneValue: unknown, pinValue: unknown) {
  const phone = normalizePhone(phoneValue), pin = validatePin(pinValue), store = load();
  const failure = store.failures[phone];
  if (failure && failure.count >= 5 && failure.until > Date.now()) throw new Error("Đã thử quá nhiều lần. Hãy đợi 15 phút hoặc liên hệ hỗ trợ.");
  const family = store.families.find((item) => item.phone === phone);
  const good = family ? equalHex(hashPin(pin, family.pinSalt), family.pinHash) : false;
  if (!good || !family) {
    const count = (failure?.until ?? 0) > Date.now() ? failure.count + 1 : 1;
    store.failures[phone] = { count, until: Date.now() + 15 * 60 * 1000 };
    save(store);
    throw new Error("Số điện thoại hoặc mã PIN chưa đúng.");
  }
  delete store.failures[phone];
  const token = sessionFor(store, family.id);
  save(store);
  return { family: publicFamily(family), token };
}
export function familyFromToken(token: string | undefined): FamilyRecord | null {
  if (!token) return null;
  const store = load(), session = store.sessions[hashToken(token)];
  if (!session?.familyId || session.expiresAt <= Date.now()) return null;
  return store.families.find((family) => family.id === session.familyId) ?? null;
}
export function revokeToken(token: string | undefined): void {
  if (!token) return;
  const store = load(); delete store.sessions[hashToken(token)]; save(store);
}
export function addStudent(familyId: string, nameValue: unknown) {
  const name = cleanName(nameValue), store = load(), family = store.families.find((item) => item.id === familyId);
  if (!family) throw new Error("Không tìm thấy tài khoản gia đình.");
  if (family.students.length >= 12) throw new Error("Tài khoản đã đạt giới hạn hồ sơ học sinh.");
  if (family.students.some((student) => student.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) throw new Error("Tên này đã có trong gia đình. Hãy thêm tên đệm để phân biệt.");
  const student: StudentRecord = { id: randomUUID(), name, attempts: [], createdAt: new Date().toISOString() };
  family.students.push(student); save(store);
  return publicFamily(family);
}
export function getStudent(familyId: string, studentId: string): StudentRecord | null {
  const store = load();
  return store.families.find((family) => family.id === familyId)?.students.find((student) => student.id === studentId) ?? null;
}
function validAttempt(value: unknown): value is Attempt {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && /^[0-9a-f-]{36}$/.test(item.id) &&
    typeof item.at === "string" && !Number.isNaN(Date.parse(item.at)) &&
    typeof item.familyId === "string" && typeof item.contrastId === "string" &&
    typeof item.itemId === "string" && ["odd", "sort", "listen", "exam"].includes(String(item.mode)) &&
    typeof item.selectedId === "string" && typeof item.correctId === "string" &&
    typeof item.correct === "boolean" && typeof item.latencyMs === "number" && Number.isFinite(item.latencyMs);
}
export function mergeStudentAttempts(familyId: string, studentId: string, values: unknown) {
  if (!Array.isArray(values) || values.length > 5000 || !values.every(validAttempt)) throw new Error("Dữ liệu câu trả lời chưa hợp lệ.");
  const store = load(), student = store.families.find((family) => family.id === familyId)?.students.find((item) => item.id === studentId);
  if (!student) throw new Error("Không tìm thấy hồ sơ học sinh.");
  const byId = new Map(student.attempts.map((attempt) => [attempt.id, attempt]));
  for (const attempt of values) if (!byId.has(attempt.id)) byId.set(attempt.id, attempt);
  student.attempts = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  save(store);
  return student.attempts;
}
function adminCode(): string {
  ensureDir();
  const path = join(dataDir(), "admin-access.txt");
  if (!existsSync(path)) writeFileSync(path, randomBytes(12).toString("base64url"), { mode: 0o600 });
  return readFileSync(path, "utf8").trim();
}
export function prepareAdminCode(): void { void adminCode(); }
export function signInAdmin(value: unknown): string {
  const supplied = typeof value === "string" ? value.trim() : "";
  const store = load(), failure = store.failures["admin"];
  if (failure && failure.count >= 5 && failure.until > Date.now()) throw new Error("Đã thử quá nhiều lần. Hãy đợi 15 phút.");
  if (!supplied || !equalHex(hashToken(supplied), hashToken(adminCode()))) {
    const count = (failure?.until ?? 0) > Date.now() ? failure.count + 1 : 1;
    store.failures.admin = { count, until: Date.now() + 15 * 60 * 1000 };
    save(store);
    throw new Error("Mã quản trị chưa đúng.");
  }
  delete store.failures.admin;
  const token = sessionFor(store, undefined, true); save(store); return token;
}
export function isAdmin(token: string | undefined): boolean {
  if (!token) return false;
  const session = load().sessions[hashToken(token)];
  return session?.admin === true && session.expiresAt > Date.now();
}
export function listFamiliesForAdmin() {
  return load().families.map((family) => ({ ...publicFamily(family), createdAt: family.createdAt,
    answers: family.students.reduce((sum, student) => sum + student.attempts.length, 0),
    lastActiveAt: family.students.flatMap((student) => student.attempts.map((attempt) => attempt.at)).sort().at(-1) ?? null,
    students: family.students.map((student) => {
      const report = reportSummary(student.attempts);
      return { id: student.id, name: student.name, answers: student.attempts.length,
        studyDays: report.studyDays, weeklyDays: report.weekly.completed,
        confirmed: report.confirmed, masteredFamilies: report.masteredFamilies,
        lastActiveAt: student.attempts.at(-1)?.at ?? null };
    }) }));
}
export function resetFamilyPin(familyId: string, value: unknown): void {
  const pin = validatePin(value), store = load(), family = store.families.find((item) => item.id === familyId);
  if (!family) throw new Error("Không tìm thấy tài khoản gia đình.");
  const salt = randomBytes(16).toString("hex");
  family.pinSalt = salt; family.pinHash = hashPin(pin, salt);
  delete store.failures[family.phone];
  for (const [key, session] of Object.entries(store.sessions)) if (session.familyId === familyId) delete store.sessions[key];
  save(store);
}

export function deleteFamily(familyId: string, confirmation: unknown): void {
  const store = load(), family = store.families.find((item) => item.id === familyId);
  if (!family) throw new Error("Không tìm thấy tài khoản gia đình.");
  validateFamilyDeletionConfirmation(family.phone, confirmation);
  store.families = store.families.filter((item) => item.id !== familyId);
  delete store.failures[family.phone];
  for (const [key, session] of Object.entries(store.sessions)) if (session.familyId === familyId) delete store.sessions[key];
  save(store);
}
