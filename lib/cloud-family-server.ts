import "server-only";

import { createHmac } from "node:crypto";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Attempt } from "./mastery";
import { reportSummary } from "./report";
import { checkCloudAnswer } from "./cloud-attempt-validation";

export class CloudFamilyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type Config = { url: string; publishable: string; secret: string; pepper: string; adminId: string; adminEmail: string };
export type CloudSession = { token: string; user: User; refreshed?: Session };
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

export function cloudFamilyEnabled(): boolean { return process.env.FAMILY_CLOUD_ENABLED === "1"; }
function config(): Config {
  const value = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    secret: process.env.SUPABASE_SECRET_KEY ?? "",
    pepper: process.env.FAMILY_PIN_PEPPER ?? "",
    adminId: process.env.FAMILY_ADMIN_USER_ID ?? "",
    adminEmail: process.env.FAMILY_ADMIN_EMAIL ?? ""
  };
  if (!cloudFamilyEnabled() || !value.url || !value.publishable || !value.secret || !value.pepper) {
    throw new CloudFamilyError("Tài khoản đám mây chưa được cấu hình.", 503);
  }
  if (value.pepper.length < 32) throw new CloudFamilyError("Khóa bảo vệ tài khoản chưa hợp lệ.", 503);
  return value;
}
function adminConfig(): Config {
  const value = config();
  if (!value.adminId || !value.adminEmail) throw new CloudFamilyError("Quản trị đám mây chưa được cấu hình.", 503);
  return value;
}
function publicClient(): SupabaseClient {
  const value = config();
  return createClient(value.url, value.publishable, authOptions);
}
function secretClient(): SupabaseClient {
  const value = config();
  return createClient(value.url, value.secret, authOptions);
}
function userClient(token: string): SupabaseClient {
  const value = config();
  return createClient(value.url, value.publishable, {
    ...authOptions, global: { headers: { Authorization: `Bearer ${token}` } }
  });
}
function hmac(label: string, value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${label}:${value}`).digest("hex");
}
export function normalizeFamilyPhone(input: unknown): string {
  if (typeof input !== "string") throw new CloudFamilyError("Vui lòng nhập số điện thoại.");
  const digits = input.replace(/[\s().-]/g, "");
  const phone = digits.startsWith("0") ? `+84${digits.slice(1)}` : digits.startsWith("84") ? `+${digits}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new CloudFamilyError("Số điện thoại chưa đúng định dạng.");
  return phone;
}
export function validateFamilyPin(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4,8}$/.test(input)) throw new CloudFamilyError("Mã PIN cần từ 4 đến 8 chữ số.");
  return input;
}
function name(input: unknown): string {
  if (typeof input !== "string") throw new CloudFamilyError("Vui lòng nhập họ tên.");
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 80) throw new CloudFamilyError("Họ tên cần từ 2 đến 80 ký tự.");
  return value;
}
export function familyAuthCredentials(phone: string, pin: string, pepper: string) {
  if (pepper.length < 32) throw new CloudFamilyError("Khóa bảo vệ tài khoản chưa hợp lệ.", 503);
  const canonical = normalizeFamilyPhone(phone);
  validateFamilyPin(pin);
  return {
    email: `${hmac("sr-family-email-v1", canonical, pepper)}@family.invalid`,
    password: hmac("sr-family-password-v1", `${canonical}:${pin}`, pepper)
  };
}
async function takeBucket(key: string, limit: number, seconds: number): Promise<void> {
  const { pepper } = config();
  const { data, error } = await secretClient().rpc("sr_take_auth_attempt", {
    p_key_hash: hmac("sr-auth-rate-v1", key, pepper), p_limit: limit, p_window_seconds: seconds
  });
  if (error) throw new CloudFamilyError("Giới hạn đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.", 503);
  if (data !== true) throw new CloudFamilyError("Đã thử quá nhiều lần. Hãy đợi 15 phút hoặc liên hệ hỗ trợ.", 429);
}
export async function takeFamilyAuthLimit(phone: string, trustedIp?: string): Promise<void> {
  await takeBucket(`phone:${phone}`, 6, 15 * 60);
  if (trustedIp) await takeBucket(`ip:${trustedIp}`, 30, 5 * 60);
}
export async function takeAdminAuthLimit(trustedIp: string): Promise<void> {
  const { adminEmail } = adminConfig();
  await takeBucket(`admin:${adminEmail.toLowerCase()}`, 6, 15 * 60);
  await takeBucket(`ip:${trustedIp}`, 30, 5 * 60);
}
function tokenSessionId(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.session_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.session_id)) return payload.session_id;
  } catch { /* checked below */ }
  throw new CloudFamilyError("Phiên đăng nhập chưa hợp lệ.", 401);
}
async function rawCloudSession(access?: string, refresh?: string): Promise<CloudSession | null> {
  if (!access && !refresh) return null;
  const client = publicClient();
  if (access) {
    const { data, error } = await client.auth.getUser(access);
    if (!error && data.user) return { token: access, user: data.user };
  }
  if (!refresh) return null;
  const result = await client.auth.refreshSession({ refresh_token: refresh });
  const session = result.data.session;
  if (result.error || !session) return null;
  const verified = await client.auth.getUser(session.access_token);
  if (verified.error || !verified.data.user) return null;
  return { token: session.access_token, user: verified.data.user, refreshed: session };
}
async function allowedFamilySession(session: CloudSession): Promise<boolean> {
  const family = await secretClient().from("sr_families")
    .select("pin_generation,login_paused").eq("id", session.user.id).maybeSingle();
  if (family.error || !family.data || family.data.login_paused) return false;
  const allowed = await secretClient().from("sr_family_sessions")
    .select("session_id,pin_generation").eq("family_id", session.user.id)
    .eq("session_id", tokenSessionId(session.token)).maybeSingle();
  return !allowed.error && !!allowed.data && allowed.data.pin_generation === family.data.pin_generation;
}
export async function verifyCloudSession(access?: string, refresh?: string): Promise<CloudSession | null> {
  const session = await rawCloudSession(access, refresh);
  return session && await allowedFamilySession(session) ? session : null;
}
async function registerFamilySession(session: Session, generation: number): Promise<void> {
  const result = await secretClient().rpc("sr_register_family_session", {
    p_family_id: session.user.id,
    p_session_id: tokenSessionId(session.access_token),
    p_generation: generation
  });
  if (result.error || result.data !== true) {
    await secretClient().auth.admin.signOut(session.access_token, "local");
    throw new CloudFamilyError("Phiên đăng nhập đã thay đổi. Vui lòng thử lại.", 409);
  }
}
export async function familySummary(session: CloudSession) {
  const client = userClient(session.token);
  const familyResult = await client.from("sr_families")
    .select("id,parent_name,phone_e164").eq("id", session.user.id).single();
  if (familyResult.error || !familyResult.data) throw new CloudFamilyError("Không tìm thấy tài khoản gia đình.", 401);
  const studentsResult = await client.from("sr_students")
    .select("id,name").eq("family_id", session.user.id).is("archived_at", null).order("created_at");
  if (studentsResult.error) throw new CloudFamilyError("Chưa tải được hồ sơ học sinh.", 503);
  const students = await Promise.all((studentsResult.data ?? []).map(async (student) => {
    const result = await client.from("sr_family_attempts")
      .select("id", { count: "exact", head: true }).eq("student_id", student.id);
    if (result.error) throw new CloudFamilyError("Chưa tải được tiến độ học sinh.", 503);
    return { id: student.id, name: student.name, answers: result.count ?? 0 };
  }));
  return { id: familyResult.data.id, name: familyResult.data.parent_name,
    phone: familyResult.data.phone_e164, students };
}
export async function signUpCloudFamily(nameInput: unknown, phoneInput: unknown, pinInput: unknown, trustedIp?: string) {
  const parentName = name(nameInput), phone = normalizeFamilyPhone(phoneInput), pin = validateFamilyPin(pinInput);
  await takeFamilyAuthLimit(phone, trustedIp);
  const credentials = familyAuthCredentials(phone, pin, config().pepper);
  const admin = secretClient();
  const created = await admin.auth.admin.createUser({
    email: credentials.email, password: credentials.password, email_confirm: true
  });
  if (created.error || !created.data.user) throw new CloudFamilyError("Chưa tạo được tài khoản. Nếu số này đã đăng ký, hãy đăng nhập hoặc liên hệ hỗ trợ.", 409);
  const id = created.data.user.id;
  const inserted = await admin.from("sr_families").insert({ id, parent_name: parentName, phone_e164: phone });
  if (inserted.error) {
    await admin.auth.admin.deleteUser(id);
    throw new CloudFamilyError("Chưa tạo được tài khoản gia đình. Vui lòng thử lại.", 503);
  }
  const signed = await publicClient().auth.signInWithPassword(credentials);
  if (signed.error || !signed.data.session) throw new CloudFamilyError("Tài khoản đã tạo nhưng chưa đăng nhập được. Vui lòng thử đăng nhập.", 503);
  await registerFamilySession(signed.data.session, 1);
  return { session: signed.data.session, family: await familySummary({ token: signed.data.session.access_token, user: signed.data.user }) };
}
export async function signInCloudFamily(phoneInput: unknown, pinInput: unknown, trustedIp?: string) {
  const phone = normalizeFamilyPhone(phoneInput), pin = validateFamilyPin(pinInput);
  await takeFamilyAuthLimit(phone, trustedIp);
  const family = await secretClient().from("sr_families")
    .select("id,pin_generation,login_paused").eq("phone_e164", phone).maybeSingle();
  if (family.error) throw new CloudFamilyError("Chưa kiểm tra được tài khoản gia đình.", 503);
  if (!family.data || family.data.login_paused) throw new CloudFamilyError("Số điện thoại hoặc mã PIN chưa đúng.", 401);
  const signed = await publicClient().auth.signInWithPassword(familyAuthCredentials(phone, pin, config().pepper));
  if (signed.error || !signed.data.session || !signed.data.user || signed.data.user.id !== family.data.id) {
    throw new CloudFamilyError("Số điện thoại hoặc mã PIN chưa đúng.", 401);
  }
  await registerFamilySession(signed.data.session, family.data.pin_generation);
  return { session: signed.data.session, family: await familySummary({ token: signed.data.session.access_token, user: signed.data.user }) };
}
export async function signOutCloudSession(session: CloudSession | null, adminSession = false): Promise<void> {
  if (!session) return;
  if (!adminSession) {
    // Revoke database access before Auth logout: an already-issued JWT may
    // remain cryptographically valid until its expiry.
    const deleted = await secretClient().from("sr_family_sessions")
      .delete().eq("family_id", session.user.id).eq("session_id", tokenSessionId(session.token));
    if (deleted.error) throw new CloudFamilyError("Chưa đăng xuất được. Vui lòng thử lại.", 503);
  }
  const result = await secretClient().auth.admin.signOut(session.token, "local");
  if (result.error) throw new CloudFamilyError("Chưa đăng xuất được. Vui lòng thử lại.", 503);
}
export async function cloudStudent(session: CloudSession, studentId: string) {
  const client = userClient(session.token);
  const student = await client.from("sr_students").select("id,name")
    .eq("id", studentId).eq("family_id", session.user.id).is("archived_at", null).single();
  if (student.error || !student.data) throw new CloudFamilyError("Không tìm thấy hồ sơ học sinh.", 404);
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await client.from("sr_family_attempts")
      .select("id,client_attempted_at,received_at,sound_family_id,contrast_id,item_id,item_snapshot,mode,selected_id,correct_id,is_correct,latency_ms")
      .eq("student_id", studentId).order("client_attempted_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 499);
    if (result.error) throw new CloudFamilyError("Chưa tải được câu trả lời.", 503);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 500) break;
  }
  return { id: student.data.id, name: student.data.name, attempts: rows.map(rowToAttempt) };
}
function rowToAttempt(row: Record<string, unknown>): Attempt {
  const at = new Date(String(row.client_attempted_at)).toISOString();
  const receivedAt = new Date(String(row.received_at)).toISOString();
  return { id: String(row.id), at, receivedAt, familyId: String(row.sound_family_id),
    contrastId: String(row.contrast_id), itemId: String(row.item_id), itemSnapshot: row.item_snapshot,
    mode: row.mode as Attempt["mode"], selectedId: String(row.selected_id), correctId: String(row.correct_id),
    correct: Boolean(row.is_correct), latencyMs: Number(row.latency_ms) };
}
export async function addCloudStudent(session: CloudSession, studentName: unknown) {
  const client = userClient(session.token), cleaned = name(studentName);
  const count = await client.from("sr_students").select("id", { count: "exact", head: true })
    .eq("family_id", session.user.id).is("archived_at", null);
  if (count.error) throw new CloudFamilyError("Chưa kiểm tra được số hồ sơ.", 503);
  if ((count.count ?? 0) >= 12) throw new CloudFamilyError("Tài khoản đã đạt giới hạn hồ sơ học sinh.");
  const inserted = await client.from("sr_students").insert({ family_id: session.user.id, name: cleaned });
  if (inserted.error) throw new CloudFamilyError("Chưa thêm được học sinh. Hãy kiểm tra tên đã dùng.");
  return familySummary(session);
}
export async function syncCloudStudent(session: CloudSession, studentId: string, values: unknown) {
  if (!Array.isArray(values) || values.length > 200) {
    throw new CloudFamilyError("Mỗi lần chỉ lưu tối đa 200 câu trả lời.", 413);
  }
  // This ownership query runs with the family JWT and RLS. Only after it
  // succeeds does a server-only key insert the canonical, checked answers.
  const owner = await userClient(session.token).from("sr_students").select("id")
    .eq("id", studentId).eq("family_id", session.user.id).is("archived_at", null).single();
  if (owner.error || !owner.data) throw new CloudFamilyError("Không tìm thấy hồ sơ học sinh.", 404);
  const checked = values.map((value) => checkCloudAnswer(value));
  if (values.some((value) => !value || typeof value.id !== "string")) throw new CloudFamilyError("Câu trả lời chưa hợp lệ.");
  const rejected = values.filter((_, index) => !checked[index]).map((value) => value.id as string);
  const approved = checked.filter((answer) => answer !== null);
  const ids = approved.map((answer) => answer.id);
  if (new Set(ids).size !== ids.length) throw new CloudFamilyError("Câu trả lời bị lặp trong yêu cầu.");
  if (approved.length) {
    const rows = approved.map((answer) => ({
      id: answer!.id, family_id: session.user.id, student_id: studentId,
      item_id: answer!.itemId, item_snapshot: answer!.itemSnapshot,
      sound_family_id: answer!.soundFamilyId, contrast_id: answer!.contrastId,
      mode: answer!.mode, selected_id: answer!.selectedId,
      correct_id: answer!.correctId, is_correct: answer!.isCorrect,
      latency_ms: answer!.latencyMs, client_attempted_at: answer!.at
    }));
    const inserted = await secretClient().from("sr_family_attempts")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (inserted.error) throw new CloudFamilyError("Chưa lưu được câu trả lời.", 503);
  }
  if (!ids.length) return { attempts: [], rejected };
  const read = await userClient(session.token).from("sr_family_attempts")
    .select("id,client_attempted_at,received_at,sound_family_id,contrast_id,item_id,item_snapshot,mode,selected_id,correct_id,is_correct,latency_ms")
    .eq("student_id", studentId).in("id", ids);
  if (read.error || !read.data || read.data.length !== ids.length) {
    throw new CloudFamilyError("Chưa xác nhận được câu trả lời đã lưu.", 503);
  }
  const byId = new Map(read.data.map((row) => [row.id, rowToAttempt(row)]));
  return { attempts: ids.map((id) => byId.get(id)!), rejected };
}
export async function verifyAdminSession(access?: string, refresh?: string): Promise<CloudSession | null> {
  const session = await rawCloudSession(access, refresh);
  return session?.user.id === adminConfig().adminId ? session : null;
}
export async function signInCloudAdmin(emailInput: unknown, passwordInput: unknown) {
  const value = adminConfig();
  if (typeof emailInput !== "string" || typeof passwordInput !== "string" || emailInput.toLowerCase() !== value.adminEmail.toLowerCase()) {
    throw new CloudFamilyError("Thông tin quản trị chưa đúng.", 401);
  }
  const result = await publicClient().auth.signInWithPassword({ email: emailInput, password: passwordInput });
  if (result.error || !result.data.session || result.data.user?.id !== value.adminId) {
    throw new CloudFamilyError("Thông tin quản trị chưa đúng.", 401);
  }
  return result.data.session;
}
export async function resetCloudFamilyPin(adminSession: CloudSession, familyIdInput: unknown, pinInput: unknown) {
  if (adminSession.user.id !== adminConfig().adminId) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
  if (typeof familyIdInput !== "string" || !/^[0-9a-f-]{36}$/i.test(familyIdInput)) {
    throw new CloudFamilyError("Không tìm thấy tài khoản gia đình.", 404);
  }
  const pin = validateFamilyPin(pinInput);
  const admin = secretClient();
  const family = await admin.from("sr_families").select("id,phone_e164")
    .eq("id", familyIdInput).maybeSingle();
  if (family.error || !family.data) throw new CloudFamilyError("Không tìm thấy tài khoản gia đình.", 404);
  // The RPC atomically pauses login, increments the PIN generation, revokes
  // every allowlisted session, and creates an audit row before Auth changes.
  const begun = await admin.rpc("sr_begin_pin_reset", {
    p_family_id: familyIdInput, p_admin_user_id: adminSession.user.id
  });
  if (begun.error || typeof begun.data !== "string") {
    throw new CloudFamilyError("Chưa bắt đầu được đặt lại PIN. Vui lòng thử lại.", 503);
  }
  const credentials = familyAuthCredentials(family.data.phone_e164, pin, config().pepper);
  const changed = await admin.auth.admin.updateUserById(familyIdInput, { password: credentials.password });
  if (changed.error) {
    // A network error cannot prove whether Auth changed the password. Keep the
    // reset exclusive and the account paused until an operator inspects it.
    throw new CloudFamilyError("Tài khoản đang tạm khóa vì chưa xác nhận được việc đổi PIN. Cần kiểm tra nhật ký quản trị.", 503);
  }
  const finished = await admin.rpc("sr_finish_pin_reset", {
    p_audit_id: begun.data, p_success: !changed.error,
    p_phone_bucket_hash: hmac("sr-auth-rate-v1", `phone:${family.data.phone_e164}`, config().pepper)
  });
  if (finished.error) {
    // Remain fail-closed: login_paused stays true if this final RPC did not run.
    throw new CloudFamilyError("Tài khoản đang tạm khóa sau khi đặt lại PIN. Cần kiểm tra nhật ký quản trị.", 503);
  }
  return cloudAdminFamilies(adminSession);
}
async function allRows(table: "sr_families" | "sr_students" | "sr_family_attempts", columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await secretClient().from(table).select(columns).order("id").range(offset, offset + 499);
    if (result.error) throw new CloudFamilyError("Chưa tải được danh sách quản trị.", 503);
    rows.push(...((result.data ?? []) as unknown as Record<string, unknown>[]));
    if (!result.data || result.data.length < 500) break;
  }
  return rows;
}
export async function cloudAdminFamilies(session: CloudSession) {
  if (session.user.id !== adminConfig().adminId) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
  const [families, students, attempts] = await Promise.all([
    allRows("sr_families", "id,parent_name,phone_e164,created_at"),
    allRows("sr_students", "id,family_id,name,archived_at"),
    allRows("sr_family_attempts", "id,student_id,client_attempted_at,received_at,sound_family_id,contrast_id,item_id,item_snapshot,mode,selected_id,correct_id,is_correct,latency_ms")
  ]);
  return families.map((family) => {
    const owned = students.filter((student) => student.family_id === family.id && !student.archived_at);
    const profiles = owned.map((student) => {
      const history = attempts.filter((row) => row.student_id === student.id).map(rowToAttempt)
        .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
      const report = reportSummary(history);
      return { id: String(student.id), name: String(student.name), answers: history.length,
        studyDays: report.studyDays, weeklyDays: report.weekly.completed,
        confirmed: report.confirmed, masteredFamilies: report.masteredFamilies,
        lastActiveAt: history.at(-1)?.at ?? null };
    });
    return { id: String(family.id), name: String(family.parent_name), phone: String(family.phone_e164),
      createdAt: String(family.created_at), answers: profiles.reduce((total, profile) => total + profile.answers, 0),
      lastActiveAt: profiles.map((profile) => profile.lastActiveAt).filter(Boolean).sort().at(-1) ?? null,
      students: profiles };
  });
}
