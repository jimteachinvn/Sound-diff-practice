"use client";

import { useState } from "react";

export function WelcomeInviteControl({ studentId, name, cloudMode }: { studentId: string; name: string; cloudMode: boolean }) {
  const [greeting, setGreeting] = useState("");
  const [design, setDesign] = useState("plain");
  const [qr, setQr] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true); setError(""); setQr(""); setLink("");
    try {
      const response = await fetch(cloudMode ? "/api/welcome" : "/api/local-family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cloudMode ? "create" : "createWelcome", studentId, greeting, design })
      });
      const data = await response.json();
      if (!response.ok || typeof data.link !== "string") throw new Error(data.error || "Chưa tạo được lời chào.");
      const url = new URL(data.link, window.location.origin).href;
      const QRCode = await import("qrcode");
      setQr(await QRCode.toDataURL(url, { width: 256, margin: 2, errorCorrectionLevel: "M" }));
      setLink(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa tạo được lời chào."); }
    finally { setBusy(false); }
  };
  return <details className="welcome-invite-control"><summary>Lời chào riêng cho em</summary>
    <label>Mẫu lời chào<select value={design} onChange={(event) => setDesign(event.target.value)}><option value="plain">Lời nhắn ngắn</option><option value="rescue-v1">Cứu viện tới rồi! · Thầy Jim</option></select></label>
    {design === "plain" ? <label>Lời chào cho {name}<textarea value={greeting} onChange={(event) => setGreeting(event.target.value)} maxLength={120} placeholder="Một lời chào vui dành riêng cho em…"/></label> : <p>Mẫu vui dùng tên trong hồ sơ, xưng “thầy” và gọi học sinh là “con”.</p>}
    <p>QR mở lời chào sau khi gia đình đăng nhập và chọn đúng học sinh. Tạo QR mới sẽ thay mã cũ.</p>
    <button className="secondary-button" onClick={create} disabled={busy || (design === "plain" && greeting.trim().length < 2)}>{busy ? "Đang tạo…" : "Tạo QR lời chào"}</button>
    {error && <p role="alert">{error}</p>}
    {qr && <div className="welcome-qr"><img src={qr} alt={`Mã QR lời chào dành cho ${name}`} width={256} height={256}/><a href={qr} download="loi-chao.png">Tải mã QR</a><a href={link} target="_blank" rel="noopener noreferrer">Mở thử lời chào</a><p>{cloudMode && new URL(link).protocol === "https:" ? "Có thể quét QR bằng điện thoại. Gia đình đăng nhập rồi chọn đúng tên học sinh để mở lời chào." : "QR dùng địa chỉ trên máy này. Hãy tạo lại trên trang chính thức trước khi gửi cho gia đình."}</p></div>}
  </details>;
}
