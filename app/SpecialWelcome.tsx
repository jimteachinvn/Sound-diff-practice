"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SpecialWelcome.module.css";

/** Mount only while the selected student is inside their learning environment. */
export function SpecialWelcome({ studentId, endpoint = "/api/special-welcome", onInviteActiveChange }: { studentId: string; endpoint?: string; onInviteActiveChange?: (active: boolean) => void }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const notify = useRef(onInviteActiveChange);
  notify.current = onInviteActiveChange;
  useEffect(() => {
    if (!greeting || !dialog.current) return;
    const element = dialog.current;
    if (!element.open) element.showModal();
    continueButton.current?.focus();
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
      const value = await response.json() as { greeting?: string };
      if (controller.signal.aborted) return;
      if (typeof value.greeting !== "string") { notify.current?.(false); return; }
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setGreeting(value.greeting);
    }).catch(() => { if (!controller.signal.aborted) notify.current?.(false); });
    return () => { controller.abort(); notify.current?.(false); };
  }, [studentId, endpoint]);
  const dismiss = () => { setGreeting(null); notify.current?.(false); };
  if (!greeting) return null;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="special-welcome-title" aria-describedby="special-welcome-message" onClose={dismiss}>
    <span className={styles.spark} aria-hidden="true">✦</span><p className={styles.eyebrow}>MỘT LỜI CHÀO RIÊNG CHO EM</p>
    <h1 className={styles.title} id="special-welcome-title">Chào mừng em!</h1><p className={styles.message} id="special-welcome-message">{greeting}</p>
    <button ref={continueButton} className={styles.button} onClick={dismiss}>Bắt đầu học</button>
  </dialog>;
}
