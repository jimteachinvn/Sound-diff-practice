"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChartNoAxesColumn, Search, ShieldCheck, UsersRound } from "lucide-react";
import { WelcomeInviteControl } from "./WelcomeInviteControl";

export type AdminFamily = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  answers: number;
  lastActiveAt: string | null;
  students: { id: string; name: string; answers: number; studyDays: number; weeklyDays: number; confirmed: number; masteredFamilies: number; lastActiveAt: string | null }[];
};

export function LocalAdminDashboard({ families, resetPins, setResetPins, resetPin, busy, cloudMode = false }: {
  families: AdminFamily[];
  resetPins: Record<string, string>;
  setResetPins: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  resetPin: (familyId: string) => void;
  busy: boolean;
  cloudMode?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => families.filter((family) =>
    `${family.name} ${family.phone} ${family.students.map((student) => student.name).join(" ")}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"))
  ), [families, query]);
  const students = families.flatMap((family) => family.students);
  const recent = students.filter((student) => student.lastActiveAt && Date.now() - new Date(student.lastActiveAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có câu trả lời";

  return <>
    <p>{cloudMode ? "Hãy xác nhận gia đình qua Zalo hoặc trực tiếp trước khi đặt lại PIN." : "Danh sách này chỉ có trên máy thử nghiệm. Hãy xác nhận gia đình qua Zalo hoặc trực tiếp trước khi đặt lại PIN."}</p>
    <div className="admin-overview" aria-label="Tổng quan học sinh">
      <div><UsersRound size={20}/><strong>{families.length}</strong><span>gia đình</span></div>
      <div><ShieldCheck size={20}/><strong>{students.length}</strong><span>học sinh</span></div>
      <div><CalendarDays size={20}/><strong>{recent}</strong><span>em trả lời trong 7 ngày</span></div>
      <div><ChartNoAxesColumn size={20}/><strong>{students.reduce((sum, student) => sum + student.answers, 0)}</strong><span>câu đã lưu</span></div>
    </div>
    <label className="admin-search"><Search size={18}/><span className="sr-only">Tìm gia đình hoặc học sinh</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên hoặc số điện thoại"/></label>
    <p className="admin-result-count">Hiển thị {filtered.length}/{families.length} gia đình</p>
    <div className="admin-list">{filtered.map((family) => <article key={family.id}>
      <div className="admin-family-info"><strong>{family.name}</strong><span>{family.phone}</span><small>Tham gia {dateLabel(family.createdAt)} · Hoạt động gần nhất: {dateLabel(family.lastActiveAt)}</small>
        <div className="admin-students">{family.students.length ? family.students.map((student) => <div key={student.id}><strong>{student.name}</strong><span>{student.answers} câu · {student.weeklyDays}/2 ngày tuần này · {student.confirmed} cặp âm vững · {student.masteredFamilies} họ âm hoàn tất</span><WelcomeInviteControl studentId={student.id} name={student.name} cloudMode={cloudMode}/></div>) : <span>Chưa có học sinh</span>}</div>
      </div>
      <div className="admin-reset"><label>PIN mới<input type="password" inputMode="numeric" pattern="[0-9]{4,8}" value={resetPins[family.id] ?? ""} onChange={(event) => setResetPins((old) => ({ ...old, [family.id]: event.target.value }))} placeholder="4–8 số"/></label><button className="secondary-button" onClick={() => resetPin(family.id)} disabled={busy || !/^\d{4,8}$/.test(resetPins[family.id] ?? "")}>Đặt lại PIN</button></div>
    </article>)}</div>
    {!filtered.length && <p>{families.length ? "Không tìm thấy gia đình phù hợp." : "Chưa có tài khoản gia đình."}</p>}
  </>;
}
