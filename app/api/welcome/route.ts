import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { CloudFamilyError, cloudFamilyEnabled, verifyAdminSession, verifyCloudSession } from "@/lib/cloud-family-server";
import { createCloudWelcomeInvite, redeemCloudWelcomeInvite } from "@/lib/cloud-welcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, private" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: noStore }); }
function fail(cause: unknown) {
  const error = cause instanceof CloudFamilyError ? cause : new CloudFamilyError("Chưa mở được lời chào.", 503);
  return json({ error: error.message }, error.status);
}
function refreshCookies(response: NextResponse, session: Session, admin: boolean) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(admin ? "sr_cloud_admin_at" : "sr_cloud_family_at", session.access_token,
    { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in });
  response.cookies.set(admin ? "sr_cloud_admin_rt" : "sr_cloud_family_rt", session.refresh_token,
    { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
}
function requireSameOrigin(request: Request) {
  const supplied = request.headers.get("origin");
  let source: URL;
  try { source = new URL(supplied ?? ""); } catch { throw new CloudFamilyError("Nguồn yêu cầu chưa hợp lệ.", 403); }
  const target = new URL(request.url);
  const loopback = process.env.NODE_ENV === "development" && source.protocol === "http:" && target.protocol === "http:" &&
    source.port === target.port && ["localhost", "127.0.0.1"].includes(source.hostname) && ["localhost", "127.0.0.1"].includes(target.hostname);
  if (source.origin !== target.origin && !loopback) throw new CloudFamilyError("Nguồn yêu cầu chưa hợp lệ.", 403);
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 8_192) throw new CloudFamilyError("Yêu cầu quá lớn.", 413);
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* handled below */ }
  throw new CloudFamilyError("Yêu cầu chưa hợp lệ.");
}

export async function POST(request: Request) {
  if (!cloudFamilyEnabled()) return json({ error: "Tài khoản đám mây chưa được bật." }, 503);
  try {
    requireSameOrigin(request);
    const body = await bodyOf(request), jar = await cookies();
    if (body.action === "create") {
      const session = await verifyAdminSession(jar.get("sr_cloud_admin_at")?.value, jar.get("sr_cloud_admin_rt")?.value);
      if (!session) throw new CloudFamilyError("Cần đăng nhập quản trị.", 401);
      const link = await createCloudWelcomeInvite(session, body.studentId, body.greeting);
      const response = json({ link });
      if (session.refreshed) refreshCookies(response, session.refreshed, true);
      return response;
    }
    if (body.action === "redeem") {
      const session = await verifyCloudSession(jar.get("sr_cloud_family_at")?.value, jar.get("sr_cloud_family_rt")?.value);
      if (!session) throw new CloudFamilyError("Hãy đăng nhập tài khoản gia đình trước.", 401);
      const greeting = await redeemCloudWelcomeInvite(session, body.studentId, body.token);
      const response = json({ greeting });
      if (session.refreshed) refreshCookies(response, session.refreshed, false);
      return response;
    }
    throw new CloudFamilyError("Yêu cầu chưa hợp lệ.");
  } catch (error) { return fail(error); }
}
