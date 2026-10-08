"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SpecialWelcome.module.css";
import { isRescueWelcome } from "@/lib/welcome-design";

/** Mount only while the selected student is inside their learning environment. */
export function SpecialWelcome({ studentId, endpoint = "/api/special-welcome", onInviteActiveChange }: { studentId: string; endpoint?: string; onInviteActiveChange?: (active: boolean) => void }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const notify = useRef(onInviteActiveChange);
  notify.current = onInviteActiveChange;
  useEffect(() => {
    if (!greeting || !dialog.current) return;
    const element = dialog.current;
    if (!element.open) element.showModal();
    if (isRescueWelcome(greeting)) title.current?.focus({ preventScroll: true });
    else continueButton.current?.focus({ preventScroll: true });
    element.scrollTop = 0;
    return () => { if (element.open) element.close(); };
  }, [greeting]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("welcome");
    if (!token) { notify.current?.(false); return; }
    notify.current?.(true);
    const controller = new AbortController();
    void fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint === "/api/welcome" ? { action: "redeem", studentId, token } : { studentId, token }), signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) { notify.current?.(false); return; }
      const value = await response.json() as { greeting?: string; studentName?: string };
      if (controller.signal.aborted) return;
      if (typeof value.greeting !== "string") { notify.current?.(false); return; }
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setStudentName(typeof value.studentName === "string" ? value.studentName : "Con");
      setReady(false);
      setGreeting(value.greeting);
    }).catch(() => { if (!controller.signal.aborted) notify.current?.(false); });
    return () => { controller.abort(); notify.current?.(false); };
  }, [studentId, endpoint]);
  const dismiss = () => { setGreeting(null); setReady(false); notify.current?.(false); };
  if (!greeting) return null;
  const rescue = isRescueWelcome(greeting);
  return <dialog ref={dialog} className={`${styles.dialog} ${rescue ? styles.rescue : ""}`} aria-labelledby="special-welcome-title" aria-describedby="special-welcome-message" onClose={dismiss}>
    {rescue ? <>
      <button className={styles.close} onClick={dismiss} aria-label="Đóng lời chào">×</button>
      <div className={`${styles.card} ${ready ? styles.motion : ""}`}>
        <div><p className={styles.eyebrow}>MỘT LỜI CHÀO RIÊNG CHO CON</p>
          <h1 ref={title} tabIndex={-1} className={styles.title} id="special-welcome-title">{studentName},<br/><em>cứu viện tới rồi!</em></h1>
          <p className={styles.message} id="special-welcome-message">Tiếng Anh làm khó con?<br/>Thầy làm luôn <strong>cả một ứng dụng.</strong></p>
          <p className={styles.aside}>Ừ, giải pháp hơi quá tay. Nhưng thầy đã lỡ làm rồi. 😏</p>
          <div className={styles.teacher}><p>Thầy lo phần làm app.<br/>Con lo phần… bấm nút.<br/>Công bằng quá còn gì.</p><span>— Thầy Jim, rất có tinh thần “chia việc”</span></div>
          <button ref={continueButton} className={styles.button} onClick={() => ready ? dismiss() : setReady(true)}>{ready ? "Bắt đầu học →" : "Được rồi, con học đây! →"}</button>
          <span className={styles.hint}>Sai thì nghe lại. Chưa biết thì thử. Bỏ qua cũng không sao.</span>
          {ready && <div className={styles.success} role="status"><strong>Tốt. Giờ đến lượt bọn EA lo lắng. 😏</strong></div>}
        </div>
        <div className={styles.art} aria-label="Ba cách đọc EA, với các từ mẫu clean, bread và great">
          <div className={styles.bubble}>“Hai chữ thôi mà thầy làm hẳn một app. Chúng con nổi tiếng thật.”</div>
          <div className={styles.letters} aria-hidden="true">ea<span className={styles.eyes}><span/><span/></span></div>
          <div className={styles.sounds}><div className={styles.sound}><span className={styles.ipa}>/iː/</span><span>cl<mark>ea</mark>n</span></div><div className={styles.sound}><span className={styles.ipa}>/e/</span><span>br<mark>ea</mark>d</span></div><div className={styles.sound}><span className={styles.ipa}>/eɪ/</span><span>gr<mark>ea</mark>t</span></div></div>
          <p className={styles.artNote}>Ba cách đọc. Một đối thủ.<br/>Lần này con có viện trợ.</p>
        </div>
      </div>
      <p className={styles.footerNote}><span aria-hidden="true">✦</span>Ứng dụng này bắt đầu từ con. Giờ mình học từng chút một nhé.</p>
    </> : <>
      <span className={styles.spark} aria-hidden="true">✦</span><p className={styles.eyebrow}>MỘT LỜI CHÀO RIÊNG CHO EM</p>
      <h1 className={styles.title} id="special-welcome-title">Chào mừng em!</h1><p className={styles.message} id="special-welcome-message">{greeting}</p>
      <button ref={continueButton} className={styles.button} onClick={dismiss}>Bắt đầu học</button>
    </>}
  </dialog>;
}
