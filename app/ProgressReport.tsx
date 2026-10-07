import { CalendarDays, ChartNoAxesColumn, Target } from "lucide-react";
import type { LearningState } from "@/lib/mastery";
import { reportSummary } from "@/lib/report";

export function ProgressReport({ learning, onPractice, sourceLabel }: { learning: LearningState; onPractice: (familyId: string) => void; sourceLabel?: string }) {
  const report = reportSummary(learning.attempts);
  return <div className="page-content report-page">
    <div className="eyebrow small">BÁO CÁO HỌC TẬP</div>
    <h1>Em đang tiến bộ ra sao?</h1>
    <p className="page-subtitle">{sourceLabel ?? "Số liệu từ câu trả lời đã lưu trên thiết bị này. Khi có tài khoản gia đình, mỗi em sẽ có báo cáo riêng."}</p>
    <div className="report-highlights">
      <section className="report-highlight"><CalendarDays aria-hidden="true" size={22}/><span>NGÀY HỌC</span><strong>{report.weekly.completed}/{report.weekly.goal}</strong><p>ngày đạt mục tiêu tuần này · {report.studyDays} ngày từ trước đến nay</p></section>
      <section className="report-highlight"><Target aria-hidden="true" size={22}/><span>CẶP ÂM NHỚ VỮNG</span><strong>{report.confirmed}/{report.contrasts}</strong><p>{report.masteredFamilies}/{report.families.length} họ âm đã vững toàn bộ cặp âm</p></section>
      <section className="report-highlight"><ChartNoAxesColumn aria-hidden="true" size={22}/><span>CÂU ĐÃ TRẢ LỜI</span><strong>{learning.attempts.length}</strong><p>Chỉ câu đã chọn đáp án mới được tính</p></section>
    </div>
    <section className="report-section" aria-labelledby="report-families-title">
      <div className="report-section-heading"><div><h2 id="report-families-title">Tiến độ theo họ âm</h2><p>Mỗi thanh nhỏ là tỉ lệ đúng trong 7 ngày, gồm cả câu nghe, xếp từ và chọn đáp án. Ngày bên dưới là ngày đầu khoảng đó (giờ Việt Nam).</p></div></div>
      <div className="report-family-grid">{report.families.map((family) => <article className="report-family" key={family.id}>
        <div className="report-family-head"><div><span className="report-grapheme">{family.grapheme}</span><h3>{family.title}</h3></div><strong>{family.confirmed}/{family.total} cặp vững</strong></div>
        <div className="report-confirm-track" role="img" aria-label={`${family.confirmed} trên ${family.total} cặp âm đã nhớ vững`}><span style={{ width: `${family.total ? family.confirmed / family.total * 100 : 0}%` }}/></div>
        <div className="report-family-bottom"><span>{family.answers ? `${family.correct}/${family.answers} câu đúng` : "Chưa có câu trả lời"}</span><button type="button" onClick={() => onPractice(family.id)}>Luyện họ âm này</button></div>
        <div className="report-week-bars" aria-label={`Tỉ lệ đúng trong bốn khoảng bảy ngày của ${family.title}`}>
          {family.weeks.map((week, index) => <div className="report-week" key={index} title={`${week.startDay} đến ${week.endDay}`}><div className="report-week-track"><span style={{ height: `${week.count ? week.correct / week.count * 100 : 0}%` }}/></div><small>{week.count ? `${Math.round(week.correct / week.count * 100)}%` : "—"}</small><small>{week.count} câu</small><small>{week.startDay.slice(8)}/{week.startDay.slice(5, 7)}</small></div>)}
        </div>
      </article>)}</div>
    </section>
    <p className="report-note">“Vững” cần trả lời đúng hai câu độc lập khác nhau cách nhau ít nhất 20 giờ. Nghe từ và xếp từ giúp luyện tập nhưng không tự xác nhận “Vững”.</p>
  </div>;
}
