import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { CloudFamilyError, cloudFamilyEnabled, type CloudSession } from "./cloud-family-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const yearMs = 365 * 24 * 60 * 60 * 1000;

function secretClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!cloudFamilyEnabled() || !url || !key) throw new CloudFamilyError("Lời chào đám mây chưa được cấu hình.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function digest(token: string) { return createHash("sha256").update(token).digest("hex"); }
function studentId(input: unknown): string {
  if (typeof input !== "string" || !uuid.test(input)) throw new CloudFamilyError("Hồ sơ học sinh chưa hợp lệ.");
  return input;
}
function greetingText(input: unknown): string {
  if (typeof input !== "string") throw new CloudFamilyError("Vui lòng nhập lời chào.");
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 120) throw new CloudFamilyError("Lời chào cần từ 2 đến 120 ký tự.");
  return value;
}

/** Replaces any previous invite for this student. Only the hash reaches the database. */
export async function createCloudWelcomeInvite(admin: CloudSession, studentInput: unknown, greetingInput: unknown): Promise<string> {
  if (admin.user.id !== process.env.FAMILY_ADMIN_USER_ID) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
  const id = studentId(studentInput), greeting = greetingText(greetingInput), client = secretClient();
  const student = await client.from("sr_students").select("id,family_id")
    .eq("id", id).is("archived_at", null).maybeSingle();
  if (student.error) throw new CloudFamilyError("Chưa kiểm tra được hồ sơ học sinh.", 503);
  if (!student.data) throw new CloudFamilyError("Không tìm thấy hồ sơ học sinh.", 404);
  const token = randomBytes(32).toString("base64url");
  const saved = await client.from("sr_welcome_invites").upsert({
    student_id: id, family_id: student.data.family_id,
    token_hash: digest(token), greeting,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + yearMs).toISOString()
  }, { onConflict: "student_id" });
  if (saved.error) throw new CloudFamilyError("Chưa tạo được lời chào. Hãy kiểm tra bảng lời mời.", 503);
  return `/#welcome=${token}`;
}

/** A valid invite reveals only its greeting, after normal family login. */
export async function redeemCloudWelcomeInvite(family: CloudSession, studentInput: unknown, tokenInput: unknown): Promise<string> {
  const id = studentId(studentInput);
  if (typeof tokenInput !== "string" || !tokenPattern.test(tokenInput)) {
    throw new CloudFamilyError("Mã chào mừng chưa phù hợp với hồ sơ này.", 403);
  }
  const client = secretClient();
  const owned = await client.from("sr_students").select("id").eq("id", id)
    .eq("family_id", family.user.id).is("archived_at", null).maybeSingle();
  if (owned.error) throw new CloudFamilyError("Chưa kiểm tra được hồ sơ học sinh.", 503);
  if (!owned.data) throw new CloudFamilyError("Mã chào mừng chưa phù hợp với hồ sơ này.", 403);
  const invite = await client.from("sr_welcome_invites").select("greeting")
    .eq("student_id", id).eq("family_id", family.user.id)
    .eq("token_hash", digest(tokenInput)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (invite.error) throw new CloudFamilyError("Chưa kiểm tra được lời chào.", 503);
  if (!invite.data) throw new CloudFamilyError("Mã chào mừng chưa phù hợp với hồ sơ này.", 403);
  return invite.data.greeting;
}
