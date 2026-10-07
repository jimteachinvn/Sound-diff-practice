import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getStudent } from "./local-family-store.ts";

type Invite = { familyId: string; studentId: string; greeting: string; tokenHash: string; createdAt: string };

function dataDir(): string { return process.env.LOCAL_FAMILY_DATA_DIR || join(process.cwd(), ".local-data"); }
function invitePath(): string { return join(dataDir(), "special-welcome.json"); }
function hash(value: string): Buffer { return createHash("sha256").update(value).digest(); }

export function createSpecialWelcomeInvite(familyId: string, studentId: string, greeting: string, baseUrl: string): string {
  if (!getStudent(familyId, studentId)) throw new Error("Không tìm thấy học sinh trong gia đình đã chọn.");
  const message = greeting.trim();
  if (message.length < 2 || message.length > 120) throw new Error("Lời chào cần từ 2 đến 120 ký tự.");
  const url = new URL(baseUrl);
  if (!(["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:")) {
    throw new Error("Bản thử nghiệm chỉ tạo liên kết cho máy cục bộ.");
  }
  const token = randomBytes(32).toString("base64url");
  const invite: Invite = { familyId, studentId, greeting: message, tokenHash: hash(token).toString("hex"), createdAt: new Date().toISOString() };
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const temp = `${invitePath()}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(invite), { mode: 0o600 });
  renameSync(temp, invitePath());
  url.hash = `welcome=${token}`;
  return url.toString();
}

export function greetingForInvite(familyId: string, studentId: string, token: unknown): string | null {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || !existsSync(invitePath())) return null;
  let invite: Invite;
  try { invite = JSON.parse(readFileSync(invitePath(), "utf8")) as Invite; } catch { return null; }
  if (invite.familyId !== familyId || invite.studentId !== studentId || !getStudent(familyId, studentId)) return null;
  const supplied = hash(token), saved = Buffer.from(invite.tokenHash, "hex");
  return supplied.length === saved.length && timingSafeEqual(supplied, saved) ? invite.greeting : null;
}
