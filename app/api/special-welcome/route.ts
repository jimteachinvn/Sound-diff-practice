import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { familyFromToken } from "@/lib/local-family-store";
import { greetingForInvite } from "@/lib/special-welcome";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Local preview only" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { return NextResponse.json({ error: "Nguồn yêu cầu chưa hợp lệ." }, { status: 403 }); }
    const requestPort = new URL(request.url).port || "80";
    if (source.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(source.hostname) || (source.port || "80") !== requestPort) {
      return NextResponse.json({ error: "Nguồn yêu cầu chưa hợp lệ." }, { status: 403 });
    }
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Yêu cầu chưa hợp lệ." }, { status: 400 }); }
  const jar = await cookies();
  const family = familyFromToken(jar.get("sr_local_family")?.value);
  if (!family) return NextResponse.json({ error: "Hãy đăng nhập tài khoản gia đình trước." }, { status: 401 });
  const studentId = typeof body.studentId === "string" ? body.studentId : "";
  const greeting = greetingForInvite(family.id, studentId, body.token);
  if (!greeting) return NextResponse.json({ error: "Mã chào mừng chưa phù hợp với hồ sơ học sinh này." }, { status: 403 });
  return NextResponse.json({ greeting }, { headers: { "Cache-Control": "no-store" } });
}
