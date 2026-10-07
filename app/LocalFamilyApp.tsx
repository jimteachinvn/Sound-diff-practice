"use client";

import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, ChartNoAxesColumn, LogOut, Plus, UserRound, UsersRound } from "lucide-react";
import { emptyState, recordAttempt, type Attempt } from "@/lib/mastery";
import { ProgressReport } from "./ProgressReport";
import { LocalAdminDashboard, type AdminFamily } from "./LocalAdminDashboard";

export type LocalProfile = { familyId: string; id: string; name: string; attempts: Attempt[]; startFamilyId?: string };
type StudentSummary = { id: string; name: string; answers: number };
type Family = { id: string; name: string; phone: string; students: StudentSummary[] };
type Screen = "auth" | "picker" | "student" | "parent" | "admin";
const zaloNumber = "+84 865 291 066";
const zaloUrl = "https://zalo.me/84865291066";
const cloudFamilyMode = process.env.NEXT_PUBLIC_FAMILY_BACKEND === "supabase";
const familyEndpoint = cloudFamilyMode ? "/api/family" : "/api/local-family";

async function api(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch(familyEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chưa thực hiện được. Hãy thử lại.");
  return data;
}
async function getJson(query = "") {
  const response = await fetch(`${familyEndpoint}${query}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chưa tải được dữ liệu.");
  return data;
}
function FamilyBrand() {
  return <div className="family-brand"><span className="brand-mark"><AudioLines size={24}/></span><div><strong>họ<span className="brand-dot">.</span>âm</strong><small>LUYỆN NHẬN BIẾT PHÁT ÂM</small></div></div>;
}

export function LocalFamilyApp({ renderStudent }: { renderStudent: (profile: LocalProfile, onSwitch: (saveFailed?: boolean) => void, onParent: (saveFailed?: boolean) => void) => React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>("auth");
  const [family, setFamily] = useState<Family | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [parentStudent, setParentStudent] = useState<LocalProfile | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [studentName, setStudentName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFamilies, setAdminFamilies] = useState<AdminFamily[]>([]);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [resetPins, setResetPins] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getJson().then((data) => {
      if (data.family) { setFamily(data.family); setScreen("picker"); }
    }).catch(() => setError("Chưa kết nối được cơ sở dữ liệu thử nghiệm.")).finally(() => setLoading(false));
  }, []);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await api(authMode === "signup" ? "signup" : "login", { name, phone, pin });
      setFamily(data.family); setPin(""); setScreen(authMode === "signup" ? "parent" : "picker");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa đăng nhập được."); }
    finally { setBusy(false); }
  };
  const selectStudent = async (studentId: string, target: "student" | "parent") => {
    setBusy(true); setError("");
    try {
      const data = await getJson(`?studentId=${encodeURIComponent(studentId)}`);
      const selected: LocalProfile = { familyId: family!.id, ...data.student };
      if (target === "student") { setProfile(selected); setScreen("student"); }
      else { setParentStudent(selected); setScreen("parent"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa mở được hồ sơ."); }
    finally { setBusy(false); }
  };
  const leaveStudent = async (target: "picker" | "parent", saveFailed = false) => {
    setProfile(null); setError(""); setNotice(saveFailed ? "Câu trả lời mới vẫn ở trên thiết bị này nhưng chưa lưu được vào tài khoản. Hãy đăng nhập lại hoặc kiểm tra kết nối để thử đồng bộ." : ""); setScreen(target);
    try {
      const data = await getJson();
      if (!data.family) { setFamily(null); setParentStudent(null); setScreen("auth"); setAuthMode("login"); return; }
      setFamily(data.family);
      if (target === "parent" && profile) {
        const selected = await getJson(`?studentId=${encodeURIComponent(profile.id)}`);
        setParentStudent({ familyId: profile.familyId, ...selected.student });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa cập nhật được tiến độ."); }
  };
  const add = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const data = await api("addStudent", { name: studentName }); setFamily(data.family); setStudentName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa thêm được học sinh."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError("");
    try { await api("logout"); setFamily(null); setProfile(null); setParentStudent(null); setScreen("auth"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa đăng xuất được."); }
    finally { setBusy(false); }
  };
  const openAdmin = async () => {
    setError(""); setScreen("admin");
    try { const data = await getJson("?admin=1"); setAdminFamilies(data.families); setAdminAuthenticated(true); }
    catch { setAdminFamilies([]); setAdminAuthenticated(false); }
  };
  const adminLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const data = await api("adminLogin", cloudFamilyMode ? { email: adminEmail, password: adminCode } : { code: adminCode }); setAdminFamilies(data.families); setAdminAuthenticated(true); setAdminCode(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa đăng nhập quản trị được."); }
    finally { setBusy(false); }
  };
  const resetPin = async (familyId: string) => {
    setBusy(true); setError("");
    try { const data = await api("adminReset", { familyId, pin: resetPins[familyId] }); setAdminFamilies(data.families); setResetPins((old) => ({ ...old, [familyId]: "" })); setNotice("Đã đặt lại PIN và đăng xuất các phiên cũ của gia đình."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa đặt lại mã PIN được."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="loading-screen"><AudioLines size={24}/> Đang mở tài khoản gia đình…</div>;
  if (screen === "student" && profile) return renderStudent(profile, (failed) => { void leaveStudent("picker", failed); }, (failed) => { void leaveStudent("parent", failed); });

  return <div className="family-screen"><div className="family-wrap"><header className="family-header"><FamilyBrand/>{family && <button className="family-text-button" onClick={logout} disabled={busy}><LogOut size={17}/> Đăng xuất</button>}</header>
    {error && <p className="family-error" role="alert">{error}</p>}
    {notice && <p className="family-notice" role="status">{notice}</p>}
    {screen === "auth" && <div className="family-auth-card">
      {authMode === "forgot" ? <><div className="eyebrow small">LẤY LẠI MÃ PIN</div><h1>Liên hệ thầy Jim trên Zalo</h1><p>Nhắn số điện thoại dùng để đăng nhập. Thầy sẽ xác nhận tài khoản với gia đình và đặt mã PIN mới. Ứng dụng không thể hiện lại mã PIN cũ.</p><a className="primary-button" href={zaloUrl} target="_blank" rel="noopener noreferrer">Nhắn qua Zalo <ArrowRight size={17}/></a><p className="family-contact">Số Zalo: <strong>{zaloNumber}</strong></p><button className="family-text-button" onClick={() => setAuthMode("login")}>← Quay lại đăng nhập</button></> : <>
        <div className="eyebrow small">TÀI KHOẢN GIA ĐÌNH</div><h1>{authMode === "signup" ? "Tạo tài khoản gia đình" : "Chào mừng trở lại"}</h1><p>Một số điện thoại và một mã PIN cho cả gia đình. Mỗi em có hồ sơ học tập riêng.</p>
        <div className="family-tabs"><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(""); }}>Đăng nhập</button><button className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setError(""); }}>Đăng ký</button></div>
        <form className="family-form" onSubmit={submitAuth}>{authMode === "signup" && <label>Họ tên phụ huynh<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required/></label>}<label>Số điện thoại<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="0865 123 456" required/></label><label>Mã PIN (4–8 số)<input type="password" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" pattern="[0-9]{4,8}" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required/></label><button className="primary-button" disabled={busy}>{busy ? "Đang xử lý…" : authMode === "signup" ? "Tạo tài khoản" : "Đăng nhập"} <ArrowRight size={17}/></button></form>
        <div className="family-auth-foot"><button className="family-text-button" onClick={() => setAuthMode("forgot")}>Quên mã PIN?</button><button className="family-text-button" onClick={openAdmin}>Quản trị</button></div>
        <p className="family-local-note">{cloudFamilyMode ? "Số điện thoại chỉ là tên đăng nhập, chưa được xác minh bằng SMS. Tiến độ được lưu trong tài khoản gia đình." : "Bản thử nghiệm trên máy này. Số điện thoại chỉ là tên đăng nhập, chưa được xác minh bằng SMS."}</p>
      </>}
    </div>}
    {screen === "picker" && family && <section className="family-panel"><div className="eyebrow small">GIA ĐÌNH {family.name.toLocaleUpperCase("vi")}</div><h1>Ai đang học hôm nay?</h1><p>Chọn đúng tên để câu trả lời được lưu vào hồ sơ của em.</p><div className="family-profile-grid">{family.students.map((student) => <button className="family-profile-card" key={student.id} onClick={() => selectStudent(student.id, "student")} disabled={busy}><UserRound size={25}/><strong>{student.name}</strong><span>{student.answers} câu đã lưu</span><ArrowRight size={17}/></button>)}</div><div className="family-picker-actions"><button className="secondary-button" onClick={() => setScreen("parent")}><UsersRound size={17}/> Phụ huynh</button>{!family.students.length && <p>Chưa có học sinh. Chọn “Phụ huynh” để thêm em đầu tiên.</p>}</div></section>}
    {screen === "parent" && family && <><section className="family-panel"><button className="family-text-button" onClick={() => { setParentStudent(null); setScreen("picker"); }}>← Chọn người học</button><div className="eyebrow small">GÓC PHỤ HUYNH</div><h1>Tiến độ của các con</h1><p>Tài khoản {family.name} · {family.phone}. Mỗi em có tiến độ riêng. Người biết mã PIN gia đình có thể xem báo cáo này.</p><form className="family-add-form" onSubmit={add}><label>Thêm học sinh<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Họ tên của em" required/></label><button className="primary-button" disabled={busy}><Plus size={17}/> Thêm em</button></form><div className="family-profile-grid">{family.students.map((student) => <div className="family-profile-card static" key={student.id}><UserRound size={24}/><strong>{student.name}</strong><span>{student.answers} câu đã lưu</span><div><button onClick={() => selectStudent(student.id, "parent")} disabled={busy}>Xem báo cáo</button><button onClick={() => selectStudent(student.id, "student")} disabled={busy}>Vào học</button></div></div>)}</div></section>{parentStudent && <div className="family-parent-report"><div className="family-report-title"><ChartNoAxesColumn size={20}/><strong>Báo cáo: {parentStudent.name}</strong></div><ProgressReport learning={parentStudent.attempts.reduce(recordAttempt, emptyState)} onPractice={(familyId) => { setProfile({ ...parentStudent, startFamilyId: familyId }); setScreen("student"); }} sourceLabel={`Báo cáo của ${parentStudent.name} từ các câu đã lưu ${cloudFamilyMode ? "trong tài khoản gia đình" : "trong bản thử nghiệm trên máy này"}.`}/></div>}</>}
    {screen === "admin" && <section className="family-panel"><button className="family-text-button" onClick={() => { setScreen(family ? "picker" : "auth"); setError(""); setNotice(""); }}>← Quay lại</button><div className="eyebrow small">{cloudFamilyMode ? "QUẢN TRỊ TÀI KHOẢN" : "QUẢN TRỊ TRÊN MÁY NÀY"}</div><h1>Gia đình và hỗ trợ PIN</h1>{!adminAuthenticated ? <form className="family-form" onSubmit={adminLogin}><p>{cloudFamilyMode ? "Đăng nhập bằng tài khoản quản trị riêng để hỗ trợ gia đình." : "Mã quản trị riêng được lưu trong thư mục dữ liệu thử nghiệm trên máy này."}</p>{cloudFamilyMode && <label>Email quản trị<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} autoComplete="username" required/></label>}<label>{cloudFamilyMode ? "Mật khẩu quản trị" : "Mã quản trị"}<input type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} autoComplete="off" required/></label><button className="primary-button" disabled={busy}>Mở quản trị</button></form> : <><LocalAdminDashboard families={adminFamilies} resetPins={resetPins} setResetPins={setResetPins} resetPin={resetPin} busy={busy} cloudMode={cloudFamilyMode}/><button className="family-text-button" onClick={async () => { await api("adminLogout"); setAdminFamilies([]); setAdminAuthenticated(false); setNotice(""); }}>Đóng quyền quản trị</button></>}</section>}
  </div></div>;
}
