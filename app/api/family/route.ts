import { isIP } from "node:net";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import {
  CloudFamilyError, addCloudStudent, cloudAdminFamilies, cloudFamilyEnabled,
  cloudStudent, familySummary, resetCloudFamilyPin, signInCloudAdmin, signInCloudFamily,
  signOutCloudSession, signUpCloudFamily, syncCloudStudent,
  takeAdminAuthLimit, verifyAdminSession, verifyCloudSession
} from "@/lib/cloud-family-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const familyAccess = "sr_cloud_family_at";
const familyRefresh = "sr_cloud_family_rt";
const adminAccess = "sr_cloud_admin_at";
const adminRefresh = "sr_cloud_admin_rt";
const noStore = { "Cache-Control": "no-store, private" };

function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
function fail(cause: unknown) {
  const error = cause instanceof CloudFamilyError ? cause : new CloudFamilyError("Chưa kết nối được tài khoản. Vui lòng thử lại.", 503);
  return json({ error: error.message }, error.status);
}
function sessionCookies(response: NextResponse, session: Session, admin = false) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(admin ? adminAccess : familyAccess, session.access_token,
    { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in });
  response.cookies.set(admin ? adminRefresh : familyRefresh, session.refresh_token,
    { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
}
function clearSession(response: NextResponse, admin = false) {
  response.cookies.delete(admin ? adminAccess : familyAccess);
  response.cookies.delete(admin ? adminRefresh : familyRefresh);
}
function checkedOrigin(request: Request) {
  const supplied = request.headers.get("origin");
  let source: URL;
  try { source = new URL(supplied ?? ""); }
  catch { throw new CloudFamilyError("Nguồn yêu cầu chưa hợp lệ.", 403); }
  const destination = new URL(request.url);
  const loopback = process.env.NODE_ENV === "development" && source.protocol === "http:" &&
    destination.protocol === "http:" && source.port === destination.port &&
    ["localhost", "127.0.0.1"].includes(source.hostname) &&
    ["localhost", "127.0.0.1"].includes(destination.hostname);
  if (source.origin !== destination.origin && !loopback) {
    throw new CloudFamilyError("Nguồn yêu cầu chưa hợp lệ.", 403);
  }
}
function trustedIp(request: Request): string {
  const supplied = request.headers.get("x-nf-client-connection-ip") ?? "";
  if (isIP(supplied)) return supplied;
  if (process.env.NODE_ENV === "development") return "local-preview";
  throw new CloudFamilyError("Chưa xác định được giới hạn đăng nhập an toàn.", 503);
}
async function parsedBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 1_000_000) throw new CloudFamilyError("Yêu cầu quá lớn.", 413);
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* handled below */ }
  throw new CloudFamilyError("Yêu cầu chưa hợp lệ.");
}
async function currentSession(admin = false) {
  const jar = await cookies();
  const access = jar.get(admin ? adminAccess : familyAccess)?.value;
  const refresh = jar.get(admin ? adminRefresh : familyRefresh)?.value;
  return admin ? verifyAdminSession(access, refresh) : verifyCloudSession(access, refresh);
}
function withRefresh(data: unknown, refreshed?: Session, admin = false, status = 200) {
  const response = json(data, status);
  if (refreshed) sessionCookies(response, refreshed, admin);
  return response;
}

export async function GET(request: Request) {
  if (!cloudFamilyEnabled()) return json({ error: "Tài khoản đám mây chưa được bật." }, 503);
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("admin")) {
      const session = await currentSession(true);
      if (!session) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
      return withRefresh({ families: await cloudAdminFamilies(session) }, session.refreshed, true);
    }
    const session = await currentSession();
    const studentId = url.searchParams.get("studentId");
    if (!session) {
      if (studentId) throw new CloudFamilyError("Phiên đăng nhập đã hết hạn.", 401);
      return json({ family: null });
    }
    if (studentId) return withRefresh({ student: await cloudStudent(session, studentId) }, session.refreshed);
    return withRefresh({ family: await familySummary(session) }, session.refreshed);
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  if (!cloudFamilyEnabled()) return json({ error: "Tài khoản đám mây chưa được bật." }, 503);
  try {
    checkedOrigin(request);
    const body = await parsedBody(request);
    if (body.action === "signup" || body.action === "login") {
      const ip = trustedIp(request);
      const result = body.action === "signup"
        ? await signUpCloudFamily(body.name, body.phone, body.pin, ip)
        : await signInCloudFamily(body.phone, body.pin, ip);
      return withRefresh({ family: result.family }, result.session);
    }
    if (body.action === "adminLogin") {
      await takeAdminAuthLimit(trustedIp(request));
      const session = await signInCloudAdmin(body.email, body.password);
      return withRefresh({ families: await cloudAdminFamilies({ token: session.access_token, user: session.user }) }, session, true);
    }
    if (body.action === "adminReset") {
      const session = await currentSession(true);
      if (!session) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
      return withRefresh({ families: await resetCloudFamilyPin(session, body.familyId, body.pin) }, session.refreshed, true);
    }
    if (body.action === "adminLogout" || body.action === "logout") {
      const admin = body.action === "adminLogout";
      await signOutCloudSession(await currentSession(admin), admin);
      const response = json({ ok: true }); clearSession(response, admin); return response;
    }
    const session = await currentSession();
    if (!session) throw new CloudFamilyError("Phiên đăng nhập đã hết hạn.", 401);
    if (body.action === "addStudent") {
      return withRefresh({ family: await addCloudStudent(session, body.name) }, session.refreshed);
    }
    if (body.action === "sync") {
      return withRefresh(await syncCloudStudent(session, String(body.studentId ?? ""), body.attempts), session.refreshed);
    }
    throw new CloudFamilyError("Yêu cầu chưa hợp lệ.");
  } catch (error) { return fail(error); }
}
