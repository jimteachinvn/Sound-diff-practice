"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Compass, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { earnedBadges, weeklyGoal, type BadgeId } from "@/lib/progress";
import type { LearningState } from "@/lib/mastery";

const badgeDetails: Array<{ id: BadgeId; title: string; description: string; icon: typeof Sparkles; tone: string }> = [
  { id: "first-session", title: "Bước đầu", description: "Hoàn thành một buổi học ngắn", icon: Sparkles, tone: "mint" },
  { id: "three-modes", title: "Khám phá", description: "Thử 3 cách luyện khác nhau", icon: Compass, tone: "blue" },
  { id: "weekly-goal", title: "Đều đặn", description: "Học 2 ngày trong một tuần", icon: CalendarDays, tone: "gold" },
  { id: "durable-sound", title: "Nhớ vững", description: "Nhận đúng một cặp âm sau khi ôn lại", icon: ShieldCheck, tone: "coral" }
];

export function StudyMotivation({ learning }: { learning: LearningState }) {
  const weekly = weeklyGoal(learning.attempts);
  const earnedIds = earnedBadges(learning);
  const earned = new Set(earnedIds);
  const [newlyEarned, setNewlyEarned] = useState<BadgeId[]>([]);
  const badgeKey = earnedIds.join("|");
  useEffect(() => {
    try {
      const storageKey = "sound-families:seen-badges:v1";
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) {
        const seen = new Set<BadgeId>(JSON.parse(saved));
        setNewlyEarned(earnedIds.filter((id) => !seen.has(id)));
      }
      window.localStorage.setItem(storageKey, JSON.stringify(earnedIds));
    } catch { setNewlyEarned([]); }
  // The earned badge set is a compact, stable trigger for this announcement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgeKey]);
  const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  return <section className="motivation-panel" aria-label="Mục tiêu học và huy hiệu">
    <div className="weekly-card">
      <div className="weekly-heading"><span className="weekly-symbol"><CalendarDays size={22}/></span><div><span className="micro-label">NHỊP HỌC TUẦN NÀY</span><h2>Hai ngày học, nhớ lâu hơn</h2></div></div>
      <p>Chỉ cần làm ít nhất 3 câu trong một ngày. Nghỉ một ngày không làm mất tiến bộ của em.</p>
      <div className="weekly-days" aria-label={`${weekly.completed}/${weekly.goal} ngày học trong tuần`}>
        {dayLabels.map((label, index) => <span className={`weekly-day ${weekly.days[index] ? "done" : ""}`} key={label}><span>{weekly.days[index] ? <Check size={15}/> : index + 1}</span><small>{label}</small></span>)}
      </div>
      <div className="weekly-footer"><strong>{Math.min(weekly.completed, weekly.goal)}/{weekly.goal} ngày</strong><span>{weekly.nextStep}</span></div>
    </div>
    <div className="badges-card"><div className="badges-heading"><span className="micro-label">HUY HIỆU CỦA EM</span><h2>Cột mốc học tập</h2><p>Huy hiệu ghi nhận việc em luyện tập và nhớ âm qua nhiều ngày.</p></div><div className="sr-only" role="status" aria-live="polite">{newlyEarned.map((id) => `Em vừa đạt huy hiệu ${badgeDetails.find((badge) => badge.id === id)?.title}.`).join(" ")}</div><div className="badge-grid">{badgeDetails.map(({ id, title, description, icon: Icon, tone }) => <div className={`badge-tile ${tone} ${earned.has(id) ? "unlocked" : "locked"} ${newlyEarned.includes(id) ? "newly-earned" : ""}`} key={id} aria-label={`${title}: ${earned.has(id) ? "đã đạt" : "chưa đạt"}. ${description}`}><div className="badge-emblem"><Icon size={22} strokeWidth={1.9}/></div><div><strong>{title}</strong><span>{description}</span></div><small>{earned.has(id) ? "ĐÃ ĐẠT" : "CHƯA ĐẠT"}</small></div>)}</div></div>
  </section>;
}

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab" && event.shiftKey && document.activeElement === closeRef.current) {
      event.preventDefault(); startRef.current?.focus();
    } else if (event.key === "Tab" && !event.shiftKey && document.activeElement === startRef.current) {
      event.preventDefault(); closeRef.current?.focus();
    }
  };
  return <div className="onboarding-backdrop" role="presentation"><div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-description" onKeyDown={onDialogKeyDown}>
    <button ref={closeRef} className="onboarding-close" onClick={onClose} aria-label="Đóng hướng dẫn"><X size={20}/></button>
    <span className="micro-label">BẮT ĐẦU THẬT DỄ</span><h2 id="onboarding-title">Học theo cách của em</h2>
    <p id="onboarding-description">Chọn một họ âm, rồi thử bất kỳ cách luyện nào. Em có thể đổi cách luyện bất cứ lúc nào.</p>
    <div className="onboarding-points"><div><span><Compass size={21}/></span><strong>Tự chọn cách luyện</strong><p>Nhìn, nghe, xếp từ, chọn đáp án hoặc ôn lại. Bỏ qua một bước không bị trừ điểm.</p></div><div><span><RotateCcw size={21}/></span><strong>Ôn lại để nhớ lâu</strong><p>Ứng dụng nhắc em luyện lại các cặp âm vào ngày khác. Chỉ câu đã trả lời mới được tính.</p></div><div><span><ShieldCheck size={21}/></span><strong>Huy hiệu có ý nghĩa</strong><p>Luyện hai ngày mỗi tuần để giữ nhịp học. “Nhớ vững” cần làm đúng câu mới sau khi ôn lại.</p></div></div>
    <button ref={startRef} className="primary-button onboarding-start" onClick={onClose}>Bắt đầu học <Check size={18}/></button>
  </div></div>;
}
