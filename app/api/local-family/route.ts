import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { addStudent, deleteFamily, familyFromToken, getStudent, isAdmin, listFamiliesForAdmin, mergeStudentAttempts, prepareAdminCode, publicFamily, resetFamilyPin, revokeToken, signInAdmin, signInFamily, signUpFamily } from "@/lib/local-family-store";
import { createSpecialWelcomeInvite, removeFamilyWelcome } from "@/lib/special-welcome";
import { welcomeGreetingForDesign } from "@/lib/welcome-design";

export const runtime = "nodejs";
const familyCookie = "sr_local_family";
const adminCookie = "sr_local_admin";
const unavailable = () => NextResponse.json({ error: "Local preview only" }, { status: 404 });
const fail = (error: unknown, status = 400) => NextResponse.json({ error: error instanceof Error ? error.message : "Có lỗi xảy ra." }, { status });
function setSession(response: NextResponse, name: string, token: string) {
  response.cookies.set(name, token, { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 30 * 24 * 60 * 60 });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const jar = await cookies(), url = new URL(request.url);
  try {
    if (url.searchParams.has("admin")) {
      prepareAdminCode();
      if (!isAdmin(jar.get(adminCookie)?.value)) return fail(new Error("Cần đăng nhập quản trị."), 401);
      return NextResponse.json({ families: listFamiliesForAdmin() });
    }
    const family = familyFromToken(jar.get(familyCookie)?.value);
    const studentId = url.searchParams.get("studentId");
    if (!family) return studentId ? fail(new Error("Phiên đăng nhập đã hết hạn."), 401) : NextResponse.json({ family: null });
    if (studentId) {
      const student = getStudent(family.id, studentId);
      if (!student) return fail(new Error("Không tìm thấy hồ sơ học sinh."), 404);
      return NextResponse.json({ student: { id: student.id, name: student.name, attempts: student.attempts } });
    }
    return NextResponse.json({ family: publicFamily(family) });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const origin = request.headers.get("origin");
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { return fail(new Error("Nguồn yêu cầu chưa hợp lệ."), 403); }
    const requestPort = new URL(request.url).port || "80";
    if (source.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(source.hostname) || (source.port || "80") !== requestPort) {
      return fail(new Error("Nguồn yêu cầu chưa hợp lệ."), 403);
    }
  }
  const jar = await cookies();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail(new Error("Yêu cầu chưa hợp lệ.")); }
  try {
    if (body.action === "signup" || body.action === "login") {
      const result = body.action === "signup" ? signUpFamily(body.name, body.phone, body.pin) : signInFamily(body.phone, body.pin);
      const response = NextResponse.json({ family: result.family }); setSession(response, familyCookie, result.token); return response;
    }
    if (body.action === "adminLogin") {
      const token = signInAdmin(body.code);
      const response = NextResponse.json({ families: listFamiliesForAdmin() }); setSession(response, adminCookie, token); return response;
    }
    if (body.action === "adminLogout") {
      revokeToken(jar.get(adminCookie)?.value);
      const response = NextResponse.json({ ok: true }); response.cookies.delete(adminCookie); return response;
    }
    if (body.action === "adminDelete") {
      if (!isAdmin(jar.get(adminCookie)?.value)) return fail(new Error("Cần đăng nhập quản trị."), 401);
      // Validate before removing the optional local greeting file.
      const family = listFamiliesForAdmin().find((item) => item.id === body.familyId);
      if (!family || typeof body.confirmPhone !== "string" || body.confirmPhone.trim() !== family.phone) return fail(new Error("Hãy nhập đúng số điện thoại của gia đình để xác nhận xóa."));
      removeFamilyWelcome(family.id);
      deleteFamily(family.id, body.confirmPhone);
      return NextResponse.json({ families: listFamiliesForAdmin() });
    }
    if (body.action === "adminReset") {
      if (!isAdmin(jar.get(adminCookie)?.value)) return fail(new Error("Cần đăng nhập quản trị."), 401);
      resetFamilyPin(String(body.familyId ?? ""), body.pin);
      return NextResponse.json({ families: listFamiliesForAdmin() });
    }
    if (body.action === "createWelcome") {
      if (!isAdmin(jar.get(adminCookie)?.value)) return fail(new Error("Cần đăng nhập quản trị."), 401);
      const family = listFamiliesForAdmin().find((item) => item.students.some((student) => student.id === body.studentId));
      if (!family || typeof body.studentId !== "string") return fail(new Error("Hồ sơ hoặc lời chào chưa hợp lệ."));
      return NextResponse.json({ link: createSpecialWelcomeInvite(family.id, body.studentId, welcomeGreetingForDesign(body.greeting, body.design), new URL(request.url).origin) });
    }
    if (body.action === "logout") {
      revokeToken(jar.get(familyCookie)?.value);
      const response = NextResponse.json({ ok: true }); response.cookies.delete(familyCookie); return response;
    }
    const family = familyFromToken(jar.get(familyCookie)?.value);
    if (!family) return fail(new Error("Phiên đăng nhập đã hết hạn."), 401);
    if (body.action === "addStudent") return NextResponse.json({ family: addStudent(family.id, body.name) });
    if (body.action === "sync") return NextResponse.json({ attempts: mergeStudentAttempts(family.id, String(body.studentId ?? ""), body.attempts) });
    return fail(new Error("Yêu cầu chưa hợp lệ."));
  } catch (error) { return fail(error); }
}
