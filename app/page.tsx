"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, AudioLines, BookOpen, ChartNoAxesColumn, Check, ChevronRight, Clock3, GraduationCap, Headphones, HelpCircle, LogOut, RotateCcw, Shuffle, Sparkles, Target, UserRound, Volume2, X } from "lucide-react";
import { exampleForOutcome, families, familyById, occurrences, wordsFor, type WordOccurrence } from "@/lib/content";
import { contrastId, generateOdd, generateSort, highlighted, pickPracticeWords, type OddItem, type SortItem } from "@/lib/exercises";
import { dueContrasts, emptyState, loadState, masteryScore, mergeLearningStates, recordAttempt, saveState, wordExposure, type Attempt, type LearningState } from "@/lib/mastery";
import { cloudConfigured, cloudIdentity, mergeCloudProgress, onCloudAuthChange, queueCloudSync, sendCloudEmail, signOutCloud, type CloudIdentity } from "@/lib/cloud";
import { playWordAudio, stopWordAudio, supportsWordAudio } from "@/lib/audio";
import { familyEvidence } from "@/lib/progress";
import { OnboardingDialog, StudyMotivation } from "./StudyMotivation";
import { ProgressReport } from "./ProgressReport";
import { LocalFamilyApp, type LocalProfile } from "./LocalFamilyApp";
import { SpecialWelcome } from "./SpecialWelcome";
import { FamilyAttemptSync } from "@/lib/family-sync";

type View = "home" | "report" | "lesson" | "odd" | "sort" | "listen" | "review" | "exam";
type ExamAnswer = { item: OddItem; selectedId: string };
const letters = ["A", "B", "C", "D"];
const teachingOrder = ["s-ending", "ed-ending", "ea", "i", "oo", "ow", "th", "c"];
const curriculum = [...teachingOrder.map(familyById), ...families.filter((family) => !teachingOrder.includes(family.id))];
const stages = ["SEE", "HEAR", "SORT", "CHOOSE", "RETEST"] as const;
const stageLabels: Record<typeof stages[number], string> = { SEE: "NHÌN", HEAR: "NGHE", SORT: "XẾP TỪ", CHOOSE: "CHỌN", RETEST: "ÔN LẠI" };
const viewLabels: Record<View, string> = { home: "LỘ TRÌNH HỌC", report: "BÁO CÁO HỌC TẬP", lesson: "BÀI HỌC ÂM", odd: "CHỌN TỪ KHÁC ÂM", sort: "PHÂN LOẠI", listen: "NGHE VÀ PHÂN LOẠI", review: "ÔN LẠI", exam: "THI BẤM GIỜ" };
const kindLabels = { rule: "QUY TẮC", tendency: "XU HƯỚNG", lexical: "HỌC THEO TỪ" } as const;
const cloudFamilyMode = process.env.NEXT_PUBLIC_FAMILY_BACKEND === "supabase";
const familyEndpoint = cloudFamilyMode ? "/api/family" : "/api/local-family";

function StagePath({ active, onSelect, examLocked = false, allowCurrent = false }: { active: typeof stages[number]; onSelect: (stage: typeof stages[number]) => void; examLocked?: boolean; allowCurrent?: boolean }) {
  return <nav className="stage-path" aria-label="Chọn cách luyện">{stages.map((stage, index) => <button type="button" className={`stage-step ${stage === active ? "current" : ""}`} aria-current={stage === active ? "step" : undefined} aria-label={`${String(index + 1).padStart(2, "0")}. ${stageLabels[stage]}${examLocked ? ", hãy thoát bài thi để đổi cách luyện" : ""}`} onClick={() => onSelect(stage)} disabled={examLocked || (stage === active && !allowCurrent)} key={stage}><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span>{stageLabels[stage]}</span>{index < stages.length - 1 && <ChevronRight size={15} aria-hidden="true"/>}</button>)}</nav>;
}

function Word({ item }: { item: WordOccurrence }) {
  const parts = highlighted(item);
  return <span><span lang="en-GB">{parts.before}<mark>{parts.target}</mark>{parts.after}</span><span className="sr-only">, phần tô sáng {parts.target}, bắt đầu ở chữ cái thứ {item.start + 1}</span></span>;
}

function AudioButton({ word, compact = false, onPlayStart, sample = false }: { word: string; compact?: boolean; onPlayStart?: () => void; sample?: boolean }) {
  const [available, setAvailable] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setAvailable(supportsWordAudio()); }, []);
  const label = `${sample ? "Nghe cả từ mẫu" : "Nghe từ"} ${word}`;
  return <button type="button" className={`audio-button ${compact ? "compact" : ""}`} onClick={() => { onPlayStart?.(); setFailed(false); void playWordAudio(word).then((played) => setFailed(!played)); }} disabled={!available} aria-label={label} title={failed ? "Không phát được âm thanh" : available ? label : "Trình duyệt này không hỗ trợ âm thanh"}><Volume2 size={compact ? 16 : 18} /></button>;
}

function ExamReview({ answers }: { answers: ExamAnswer[] }) {
  if (!answers.length) return <p>Em chưa trả lời câu nào trong lượt này.</p>;
  return <div className="exam-review" aria-label="Xem lại câu đã làm">{answers.map(({ item, selectedId }, index) => {
    const family = familyById(item.familyId);
    const correctWord = item.options.find((word) => word.id === item.oddId)?.word;
    return <div className="exam-review-item" key={`${item.id}:${index}`}><div className="exam-review-title"><strong>Câu {index + 1} · {family.grapheme.toUpperCase()}</strong><span className={selectedId === item.oddId ? "review-correct" : "review-wrong"}>{selectedId === item.oddId ? "Đúng" : `Cần ôn · ${correctWord}`}</span></div><div className="exam-review-groups">{family.outcomes.filter((outcome) => item.options.some((word) => word.outcomeId === outcome.id)).map((outcome) => <span key={outcome.id}><strong>{outcome.ipa}</strong> {item.options.filter((word) => word.outcomeId === outcome.id).map((word) => word.word).join(" · ")}</span>)}</div></div>;
  })}</div>;
}

function attemptFor(item: OddItem, selectedId: string, mode: Attempt["mode"], startedAt: number): Attempt {
  return {
    id: crypto.randomUUID(), at: new Date().toISOString(), familyId: item.familyId, pendingCloud: cloudFamilyMode,
    contrastId: item.contrastId, itemId: item.id, mode, selectedId,
    correctId: item.oddId, correct: selectedId === item.oddId,
    latencyMs: Math.max(0, Date.now() - startedAt),
    itemSnapshot: { itemId: item.id, familyId: item.familyId, contrastId: item.contrastId, version: item.version, oddId: item.oddId,
      options: item.options.map((word) => ({ id: word.id, word: word.word, outcomeId: word.outcomeId, start: word.start, end: word.end })) }
  };
}

function createFamilySync(profile: LocalProfile): FamilyAttemptSync {
  return new FamilyAttemptSync(profile.attempts, async (attempts) => {
    const response = await fetch(familyEndpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", studentId: profile.id, attempts }) });
    if (!response.ok) throw new Error("local sync failed");
    const data = await response.json();
    if (!Array.isArray(data.attempts)) throw new Error("local sync response invalid");
    return { attempts: data.attempts, rejected: Array.isArray(data.rejected) ? data.rejected : [] };
  }, async () => {
    const response = await fetch(`${familyEndpoint}?studentId=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("family refresh failed");
    const data = await response.json();
    if (!Array.isArray(data.student?.attempts)) throw new Error("family refresh response invalid");
    return data.student.attempts;
  });
}
function needsAttemptMerge(current: Attempt[], remote: Attempt[]): boolean {
  const byId = new Map(current.map((attempt) => [attempt.id, attempt]));
  return remote.some((attempt) => {
    const old = byId.get(attempt.id);
    return !old || old.at !== attempt.at || old.receivedAt !== attempt.receivedAt || old.correct !== attempt.correct || old.correctId !== attempt.correctId ||
      old.itemId !== attempt.itemId || old.contrastId !== attempt.contrastId || old.familyId !== attempt.familyId;
  });
}

function HomePage({ profile, onSwitch, onParent, welcomeActive = false }: { profile?: LocalProfile; onSwitch?: (saveFailed?: boolean) => void; onParent?: (saveFailed?: boolean) => void; welcomeActive?: boolean }) {
  const familySync = useRef<FamilyAttemptSync | null>(null);
  if (profile && !familySync.current) familySync.current = createFamilySync(profile);
  const [view, setView] = useState<View>(profile?.startFamilyId ? "lesson" : "home");
  const [familyId, setFamilyId] = useState(profile?.startFamilyId ?? "s-ending");
  const [learning, setLearning] = useState<LearningState>(emptyState);
  const learningRef = useRef<LearningState>(emptyState);
  learningRef.current = learning;
  const [ready, setReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"local" | "connecting" | "synced" | "failed">(cloudConfigured() ? "connecting" : "local");
  const [cloudUser, setCloudUser] = useState<CloudIdentity | null>(null);
  const cloudUserId = useRef<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [listenPlaying, setListenPlaying] = useState(false);
  const [listenAudioFailed, setListenAudioFailed] = useState(false);
  const [odd, setOdd] = useState<OddItem | null>(null);
  const [oddChoice, setOddChoice] = useState<string | null>(null);
  const [sort, setSort] = useState<SortItem | null>(null);
  const [sortAnswers, setSortAnswers] = useState<Record<string, string>>({});
  const [sortCorrections, setSortCorrections] = useState<Record<string, string>>({});
  const [sortActive, setSortActive] = useState<string | null>(null);
  const [sortFeedbackId, setSortFeedbackId] = useState<string | null>(null);
  const [listenWord, setListenWord] = useState<WordOccurrence | null>(null);
  const [listenChoice, setListenChoice] = useState<string | null>(null);
  const listenPlaybackToken = useRef(0);
  const [startedAt, setStartedAt] = useState(0);
  const [examLeft, setExamLeft] = useState(75);
  const [examCount, setExamCount] = useState(0);
  const [examScore, setExamScore] = useState(0);
  const [examDone, setExamDone] = useState(false);
  const [examDeadline, setExamDeadline] = useState(0);
  const [examAnswers, setExamAnswers] = useState<ExamAnswer[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const family = familyById(familyId);
  const due = useMemo(() => dueContrasts(learning, new Date(now)), [learning, now]);
  const exposure = useMemo(() => wordExposure(learning.attempts), [learning.attempts]);
  const nextFamilyId = learning.attempts.at(-1)?.familyId ?? "ea";
  const weakestAlternative = (correctId: string): string | undefined => family.outcomes
    .filter((candidate) => candidate.id !== correctId)
    .sort((a, b) => {
      const left = learning.mastery[contrastId(familyId, correctId, a.id)];
      const right = learning.mastery[contrastId(familyId, correctId, b.id)];
      return (left ? masteryScore(left) : 0) - (right ? masteryScore(right) : 0);
    })[0]?.id;

  useEffect(() => {
    if (profile) {
      const scope = `family:${profile.familyId}:${profile.id}`;
      const fromServer = profile.attempts.reduce(recordAttempt, emptyState);
      setLearning(mergeLearningStates(loadState(scope), fromServer));
      setCloudStatus("connecting");
      setReady(true);
      return;
    }
    let active = true;
    let initialized = false;
    const refresh = async () => {
      const identity = await cloudIdentity();
      if (!active) return;
      if (initialized && identity?.id === cloudUserId.current) { setCloudUser(identity); return; }
      initialized = true;
      setReady(false);
      cloudUserId.current = identity?.id ?? null;
      const guest = loadState();
      const own = identity ? loadState(identity.id) : guest;
      let local = own;
      if (identity && guest.attempts.length) {
        try {
          const claimedBy = window.localStorage.getItem("sound-families:guest-claimed-by:v1");
          if (!claimedBy || claimedBy === identity.id) {
            local = mergeLearningStates(own, guest);
          }
        } catch { /* The account cache still works if guest storage is blocked. */ }
      }
      try {
        const merged = identity ? await mergeCloudProgress(local) : local;
        if (active) { setCloudUser(identity); setLearning(merged); setCloudStatus(identity ? "connecting" : "local"); }
      } catch {
        if (active) { setCloudUser(identity); setLearning(local); setCloudStatus("failed"); }
      } finally { if (active) setReady(true); }
    };
    void refresh();
    const unsubscribe = onCloudAuthChange(() => { void refresh(); });
    return () => { active = false; unsubscribe(); };
  // Auth events use the current account id ref to avoid reloading practice on token refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  useEffect(() => {
    if (!ready) return;
    if (profile) {
      setStorageFailed(!saveState(learning, `family:${profile.familyId}:${profile.id}`));
      void familySync.current!.synchronize(learning.attempts)
        .then((merged) => {
          setCloudStatus(familySync.current!.hasRejected ? "failed" : "synced");
          if (needsAttemptMerge(learningRef.current.attempts, merged)) setLearning((current) => mergeLearningStates(current, merged.reduce(recordAttempt, emptyState)));
        })
        .catch(() => setCloudStatus("failed"));
      return;
    }
    setStorageFailed(!saveState(learning, cloudUser?.id));
    if (!cloudUser) return;
    void queueCloudSync(learning, cloudUser.id).then((status) => {
      setCloudStatus(status);
      if (status === "synced") {
        try {
          const claimedBy = window.localStorage.getItem("sound-families:guest-claimed-by:v1");
          if (!claimedBy || claimedBy === cloudUser.id) {
            window.localStorage.setItem("sound-families:guest-claimed-by:v1", cloudUser.id);
            if (saveState(emptyState)) window.localStorage.removeItem("sound-families:guest-claimed-by:v1");
          }
        } catch { /* The per-account cache remains available. */ }
      }
    });
  }, [learning, ready, cloudUser, profile]);
  useEffect(() => {
    if (profile) {
      const studentId = profile.id;
      const refreshLocal = () => {
        if (document.visibilityState === "hidden") return;
        void fetch(`${familyEndpoint}?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" })
          .then(async (response) => { if (!response.ok) throw new Error("local refresh failed"); return response.json(); })
          .then((data) => {
            if (!Array.isArray(data.student?.attempts)) return;
            if (needsAttemptMerge(learningRef.current.attempts, data.student.attempts)) setLearning((current) => mergeLearningStates(current, data.student.attempts.reduce(recordAttempt, emptyState)));
          }).catch(() => setCloudStatus("failed"));
      };
      window.addEventListener("focus", refreshLocal);
      document.addEventListener("visibilitychange", refreshLocal);
      return () => { window.removeEventListener("focus", refreshLocal); document.removeEventListener("visibilitychange", refreshLocal); };
    }
    if (!ready || !cloudUser) return;
    const studentId = cloudUser.id;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void mergeCloudProgress(learningRef.current).then((merged) => {
        if (cloudUserId.current !== studentId) return;
        setLearning((current) => {
          const currentIds = new Set(current.attempts.map((attempt) => attempt.id));
          return merged.attempts.some((attempt) => !currentIds.has(attempt.id)) ? mergeLearningStates(current, merged) : current;
        });
      }).catch(() => setCloudStatus("failed"));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [ready, cloudUser, profile]);

  const leaveLocalStudent = async (destination?: (saveFailed?: boolean) => void) => {
    if (!profile || !destination) return;
    setCloudStatus("connecting");
    try {
      await familySync.current!.synchronize(learningRef.current.attempts, true);
      destination(familySync.current!.hasRejected);
    } catch {
      setCloudStatus("failed");
      destination(true);
    }
  };

  const submitAccountEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountBusy(true); setAccountMessage("");
    try {
      await sendCloudEmail(accountEmail.trim());
      setAccountMessage("Đã gửi email. Mở liên kết trên thiết bị này để hoàn tất, rồi dùng cùng email trên thiết bị khác.");
    } catch { setAccountMessage("Chưa gửi được email. Hãy kiểm tra địa chỉ và thử lại."); }
    finally { setAccountBusy(false); }
  };

  const leaveAccount = async () => {
    setAccountBusy(true); setAccountMessage("");
    try {
      if (cloudUser && loadState().attempts.length) window.localStorage.setItem("sound-families:guest-claimed-by:v1", cloudUser.id);
      await signOutCloud(); setAccountOpen(false); setAccountEmail("");
    }
    catch { setAccountMessage("Chưa đăng xuất được. Hãy thử lại."); }
    finally { setAccountBusy(false); }
  };
  useEffect(() => { setAudioAvailable(supportsWordAudio()); }, []);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { setShowOnboarding(window.localStorage.getItem("sound-families:onboarding:v1") !== "seen"); }
    catch { setShowOnboarding(true); }
  }, [ready]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    try { window.localStorage.setItem("sound-families:onboarding:v1", "seen"); } catch { /* Practice remains available. */ }
  };

  const beginOdd = useCallback((id: string, targetView: View = "odd", requestedContrast?: string) => {
    setFamilyId(id);
    setOdd(generateOdd(id, Math.random, requestedContrast, exposure, learning.attempts.length));
    setOddChoice(null);
    setStartedAt(Date.now());
    setView(targetView);
  }, [exposure, learning.attempts.length]);

  const beginSort = (id: string) => {
    setFamilyId(id); setSort(generateSort(id, Math.random, exposure, learning.attempts.length)); setSortAnswers({}); setSortCorrections({}); setSortFeedbackId(null); setSortActive(null); setView("sort"); setStartedAt(Date.now());
  };

  const beginListen = (id: string) => {
    listenPlaybackToken.current++;
    setFamilyId(id); setListenWord(pickPracticeWords(wordsFor(id), 1, Math.random, exposure, learning.attempts.length)[0]);
    stopWordAudio(); setListenChoice(null); setListenPlaying(false); setListenAudioFailed(false); setView("listen"); setStartedAt(Date.now());
  };

  const playListenWord = () => {
    if (!listenWord) return;
    const token = ++listenPlaybackToken.current;
    setListenPlaying(true);
    setListenAudioFailed(false);
    void playWordAudio(listenWord.word).then((played) => {
      if (listenPlaybackToken.current !== token) return;
      setListenPlaying(false);
      setListenAudioFailed(!played);
    });
  };

  const beginExam = () => {
    setExamLeft(75); setExamDeadline(Date.now() + 75000); setExamCount(0); setExamScore(0); setExamDone(false); setExamAnswers([]);
    beginOdd(families[Math.floor(Math.random() * families.length)].id, "exam");
  };

  useEffect(() => {
    if (view !== "exam" || examDone || !examDeadline) return;
    const update = () => setExamLeft(Math.max(0, Math.ceil((examDeadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [view, examDone, examDeadline]);
  useEffect(() => { if (view === "exam" && examLeft === 0) setExamDone(true); }, [view, examLeft]);

  const submitOdd = (id: string) => {
    if (!odd || oddChoice || (view === "exam" && examDone)) return;
    if (view === "exam" && Date.now() >= examDeadline) { setExamLeft(0); setExamDone(true); return; }
    setOddChoice(id);
    const attempt = attemptFor(odd, id, view === "exam" ? "exam" : "odd", startedAt);
    setLearning((previous) => recordAttempt(previous, attempt));
    if (view === "exam") { setExamAnswers((previous) => [...previous, { item: odd, selectedId: id }]); setExamCount((n) => n + 1); if (attempt.correct) setExamScore((n) => n + 1); }
  };

  const nextOdd = () => {
    if (view === "exam") {
      if (Date.now() >= examDeadline) { setExamLeft(0); setExamDone(true); return; }
      if (examCount >= 8) { setExamDone(true); return; }
      beginOdd(families[Math.floor(Math.random() * families.length)].id, "exam");
    } else if (view === "review") {
      const next = dueContrasts(learning)[0];
      if (next) beginOdd(next.split(":")[0], "review", next);
      else beginOdd(familyId, "review");
    } else beginOdd(familyId);
  };

  const answerSort = (outcomeId: string) => {
    if (!sort || !sortActive || sortAnswers[sortActive]) return;
    const word = sort.words.find((candidate) => candidate.id === sortActive);
    if (!word) return;
    setSortAnswers((previous) => ({ ...previous, [word.id]: outcomeId }));
    setSortFeedbackId(outcomeId === word.outcomeId ? null : word.id);
    setSortActive(null);
    const other = weakestAlternative(word.outcomeId);
    const contrasted = outcomeId === word.outcomeId ? other : outcomeId;
    if (contrasted) setLearning((previous) => recordAttempt(previous, {
      id: crypto.randomUUID(), at: new Date().toISOString(), familyId,
      contrastId: contrastId(familyId, word.outcomeId, contrasted), itemId: `sort:${word.id}`,
      mode: "sort", selectedId: outcomeId, correctId: word.outcomeId,
      correct: outcomeId === word.outcomeId, latencyMs: Math.max(0, Date.now() - startedAt)
    }));
  };

  const answerListen = (outcomeId: string) => {
    if (!listenWord || listenChoice) return;
    listenPlaybackToken.current++;
    stopWordAudio();
    setListenPlaying(false);
    setListenChoice(outcomeId);
    const other = weakestAlternative(listenWord.outcomeId);
    const contrasted = outcomeId === listenWord.outcomeId ? other : outcomeId;
    if (contrasted) setLearning((previous) => recordAttempt(previous, {
      id: crypto.randomUUID(), at: new Date().toISOString(), familyId,
      contrastId: contrastId(familyId, listenWord.outcomeId, contrasted), itemId: `listen:${listenWord.id}`,
      mode: "listen", selectedId: outcomeId, correctId: listenWord.outcomeId,
      correct: outcomeId === listenWord.outcomeId, latencyMs: Math.max(0, Date.now() - startedAt)
    }));
  };

  const resetToHome = () => { listenPlaybackToken.current++; stopWordAudio(); setView("home"); };
  const exitExam = () => { setExamDone(true); resetToHome(); };
  const chooseStage = (stage: typeof stages[number]) => {
    if (view === "exam") return;
    const targetFamilyId = view === "home" ? nextFamilyId : familyId;
    listenPlaybackToken.current++;
    stopWordAudio();
    if (stage === "SEE") setView("lesson");
    if (stage === "SEE") setFamilyId(targetFamilyId);
    if (stage === "HEAR") beginListen(targetFamilyId);
    if (stage === "SORT") beginSort(targetFamilyId);
    if (stage === "CHOOSE") beginOdd(targetFamilyId);
    if (stage === "RETEST") {
      const target = due[0];
      beginOdd(target?.split(":")[0] ?? targetFamilyId, "review", target);
    }
  };
  const completedSort = !!sort && Object.keys(sortAnswers).length === sort.words.length;
  const sortFeedbackWord = sort?.words.find((word) => word.id === sortFeedbackId);
  const examActive = view === "exam";

  if (!ready) return <div className="loading-screen"><span className="brand-mark"><AudioLines size={24}/></span><strong>Đang tải các họ âm…</strong></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={resetToHome} disabled={examActive} aria-label="Về trang chủ Họ âm"><span className="brand-mark"><AudioLines size={24} strokeWidth={2.4} /></span><span><strong>họ<span className="brand-dot">.</span>âm</strong><small>LUYỆN NHẬN BIẾT PHÁT ÂM</small></span></button>
      <div className="side-label">GÓC HỌC TẬP</div>
      <nav className="side-nav" aria-label="Điều hướng chính">
        <button className={view === "home" ? "active" : ""} onClick={resetToHome} disabled={examActive}><BookOpen size={18}/> Lộ trình học</button>
        <button className={view === "report" ? "active" : ""} onClick={() => setView("report")} disabled={examActive}><ChartNoAxesColumn size={18}/> Báo cáo học tập</button>
        {profile && <><button onClick={() => { void leaveLocalStudent(onSwitch); }} disabled={examActive}><UserRound size={18}/> Đổi người học</button><button onClick={() => { void leaveLocalStudent(onParent); }} disabled={examActive}><GraduationCap size={18}/> Phụ huynh</button></>}
        <button className={view === "lesson" ? "active" : ""} onClick={() => setView("lesson")} disabled={examActive}><Sparkles size={18}/> Bài học âm</button>
        <button className={view === "odd" || view === "sort" || view === "listen" ? "active" : ""} onClick={() => beginOdd(familyId)} disabled={examActive}><Target size={18}/> Luyện tập</button>
        <button className={view === "review" ? "active" : ""} onClick={() => due.length && beginOdd(due[0].split(":")[0], "review", due[0])} disabled={examActive || !due.length}><RotateCcw size={18}/> Ôn âm đến hạn <span className="nav-count">{due.length}</span></button>
        <button className={view === "exam" ? "active" : ""} onClick={beginExam} disabled={examActive}><Clock3 size={18}/> Thi bấm giờ</button>
      </nav>
      <div className="sidebar-bottom"><div className="accent-pill"><span className="accent-dot"/> Giọng Anh Anh trong bài học</div><p>Nhìn cách viết. Nghe âm. Chọn đáp án.</p></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">HỌ ÂM TIẾNG ANH <ChevronRight size={14}/> {viewLabels[view]}</div><div className="topbar-right">{profile && <span className="profile-chip"><UserRound size={16}/>{profile.name}</span>}{!profile && cloudConfigured() && <button className="help-button" onClick={() => setAccountOpen((open) => !open)} disabled={examActive} aria-label={cloudUser?.anonymous ? "Giữ tiến độ bằng email" : cloudUser ? "Xem tài khoản học tập" : "Lưu tiến độ bằng email"} aria-expanded={accountOpen} aria-controls="cloud-account"><UserRound size={17}/><span>{cloudUser?.anonymous ? "Giữ tiến độ" : cloudUser ? "Tài khoản" : "Lưu tiến độ"}</span></button>}<button className="help-button" onClick={() => setShowOnboarding(true)} disabled={examActive} aria-label="Xem hướng dẫn cách học"><HelpCircle size={17}/> <span>Cách học</span></button><div className="top-meta"><span className="top-meta-dot"/> {storageFailed ? "Không lưu được trên thiết bị" : profile ? `${learning.attempts.length} câu · ${cloudStatus === "failed" ? "chưa lưu được" : cloudStatus === "connecting" ? "đang lưu" : cloudFamilyMode ? "đã đồng bộ" : "đã lưu thử nghiệm"}` : `${learning.attempts.length} lượt trả lời đã lưu${cloudConfigured() ? !cloudUser ? " trên thiết bị này · chưa đăng nhập" : cloudStatus === "failed" ? " · không đồng bộ được" : cloudStatus === "connecting" ? " · đang kết nối" : " · đã đồng bộ" : " trên thiết bị này"}`}</div></div></header>
      {cloudConfigured() && accountOpen && !examActive && <section className="cloud-account" id="cloud-account" aria-label="Tài khoản học tập"><h2>{cloudUser?.anonymous ? "Giữ tiến độ của em" : cloudUser ? "Tiến độ của em" : "Lưu tiến độ trên nhiều thiết bị"}</h2>{cloudUser && !cloudUser.anonymous ? <><p>Đã đăng nhập bằng {cloudUser.email ?? "thư điện tử"}. Tiến độ sẽ đồng bộ khi có mạng.</p><button className="secondary-button" type="button" onClick={leaveAccount} disabled={accountBusy}>Đăng xuất</button></> : <><p>Nhập địa chỉ thư điện tử để nhận liên kết đăng nhập. {cloudUser?.anonymous ? "Xác nhận địa chỉ để giữ tài khoản tạm thời hiện có." : "Em vẫn có thể luyện trên thiết bị này khi chưa đăng nhập."}</p><form onSubmit={submitAccountEmail}><label htmlFor="account-email">Địa chỉ thư điện tử</label><input id="account-email" type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} autoComplete="email" required/><button className="primary-button" type="submit" disabled={accountBusy}>{accountBusy ? "Đang gửi…" : "Gửi liên kết"}</button></form></>}{cloudUser && cloudStatus === "failed" && <p role="alert">Chưa đồng bộ được. Câu trả lời vẫn được giữ trên thiết bị này. <button type="button" className="cloud-retry" onClick={() => { setCloudStatus("connecting"); void queueCloudSync(learning, cloudUser.id).then(setCloudStatus); }}>Thử lại</button></p>}{accountMessage && <p role="status">{accountMessage}</p>}</section>}

      {view === "home" && <div className="page-content">
        <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> LUYỆN BÀI KIỂM TRA PHÁT ÂM TRÊN GIẤY</div><h1>Nhìn cách viết.<br/><em>Nhận ra âm.</em><br/>Chọn đáp án.</h1><p>Hiểu nhóm âm để làm tốt dạng bài “chọn từ có phần gạch chân phát âm khác”.</p><div className="hero-actions"><button className="primary-button" onClick={() => { setFamilyId("ea"); setView("lesson"); }}>Bắt đầu với EA <ArrowRight size={18}/></button><button className="secondary-button" onClick={() => beginOdd("ea")}>Thử câu hỏi trắc nghiệm</button></div></div><div className="hero-art" aria-hidden="true"><div className="art-mini">MỘT CÁCH VIẾT <span>BA CÁCH ĐỌC</span></div><div className="art-letters">e<span>a</span></div><div className="art-row"><span>/iː/</span><span>clean · meat</span></div><div className="art-row"><span>/e/</span><span>bread · head</span></div><div className="art-row"><span>/eɪ/</span><span>great · break</span></div><div className="art-foot">Nhận ra nhóm âm trước khi chọn.</div></div></section>
        <StagePath active="SEE" onSelect={chooseStage} allowCurrent/>
        <div className="home-focus"><div><span className="micro-label">BƯỚC TIẾP THEO</span><h2>{due.length ? `${due.length} cặp âm cần ôn lại` : learning.attempts.length ? "Tiếp tục luyện các họ âm" : "Bắt đầu với họ âm đầu tiên"}</h2><p>{due.length ? "Ôn lại một cặp âm em đã luyện." : learning.attempts.length ? "Tiếp tục với một họ âm em đã học." : "Học bài ngắn, phân loại từ rồi thử câu hỏi trắc nghiệm."}</p></div><button className="primary-button" onClick={() => { if (due.length) beginOdd(due[0].split(":")[0], "review", due[0]); else { setFamilyId(nextFamilyId); setView("lesson"); } }}>{due.length ? "Ôn ngay" : learning.attempts.length ? "Tiếp tục học" : "Học EA"} <ArrowRight size={17}/></button></div>
        <StudyMotivation learning={learning}/>
        <div className="section-heading"><div><div className="eyebrow small">LỘ TRÌNH HỌC CỦA EM</div><h2>Chọn một họ âm</h2></div><span className="section-note">{families.length} họ âm · {occurrences.length} lượt từ đã kiểm duyệt</span></div>
        <div className="family-grid">{curriculum.map((item, index) => {
          const evidence = familyEvidence(learning.attempts, item.id);
          return <button className="family-card" key={item.id} onClick={() => { setFamilyId(item.id); setView("lesson"); }}>
            <div className="family-top"><span className="family-num">{String(index + 1).padStart(2, "0")}</span><span className={`family-kind ${item.kind}`}>{kindLabels[item.kind]}</span></div>
            <div className="family-grapheme">{item.grapheme}</div><h3>{item.title}</h3><p>{item.vietnamese}</p>
            {evidence.attempted > 0 && <div className="family-progress">Đã luyện {evidence.attempted}/{evidence.total} cặp · Vững {evidence.confirmed}/{evidence.total}</div>}
            <div className="family-bottom"><span className="family-examples"><span className="sr-only">Từ mẫu: </span>{item.outcomes.map((outcome) => <span className="family-example" key={outcome.id}><Word item={exampleForOutcome(item.id, outcome.id)}/><span className="family-example-ipa">{outcome.ipa}</span></span>)}</span><ArrowRight size={18} aria-hidden="true"/></div>
          </button>;
        })}</div>
        <section className="mode-strip"><div><span className="mode-icon"><GraduationCap size={20}/></span><div><strong>Sẵn sàng luyện tốc độ làm bài?</strong><p>8 câu hỏi mới, 75 giây, giải thích nhóm âm ngay sau khi trả lời.</p></div></div><button onClick={beginExam}>Bắt đầu thi bấm giờ <ArrowRight size={17}/></button></section>
      </div>}

      {view === "report" && <ProgressReport learning={learning} onPractice={(id) => beginOdd(id)} sourceLabel={profile ? `Báo cáo của ${profile.name} từ các câu đã lưu ${cloudFamilyMode ? "trong tài khoản gia đình" : "trong bản thử nghiệm trên máy này"}.` : undefined}/>}

      {view === "lesson" && <div className="page-content narrow"><button className="back-link" onClick={resetToHome}>← Tất cả họ âm</button><StagePath active="SEE" onSelect={chooseStage}/><div className="lesson-head"><div className="eyebrow small">BÀI HỌC HỌ ÂM · {kindLabels[family.kind]}</div><h1><span className="lesson-grapheme">{family.grapheme}</span> {family.title}</h1><p>{family.vietnamese}</p></div><div className="family-switcher">{curriculum.map((item) => <button className={item.id === familyId ? "selected" : ""} key={item.id} onClick={() => setFamilyId(item.id)}>{item.grapheme}</button>)}</div><div className="rule-card"><span className="rule-icon"><Sparkles size={20}/></span><div><strong>Điểm cần nhớ</strong><p>{family.rule}</p></div></div><div className="sound-group-caption"><span className="micro-label">XEM CÁC NHÓM ÂM</span><span>Chạm vào biểu tượng loa để nghe từ</span></div><div className="lesson-grid">{family.outcomes.map((outcome) => <section className="outcome-card" key={outcome.id}><div className="outcome-head"><strong>{outcome.ipa}</strong><span>{outcome.label}</span></div><div className="word-list">{wordsFor(familyId).filter((item) => item.outcomeId === outcome.id).slice(0, 8).map((item) => <div key={item.id}><span><Word item={item}/></span><span className="word-ipa">{item.ipa}</span><AudioButton word={item.word} compact/></div>)}</div></section>)}</div><div className="lesson-actions"><button className="primary-button" onClick={() => beginSort(familyId)}>Phân loại các từ này <Shuffle size={17}/></button><button className="secondary-button" onClick={() => beginOdd(familyId)}>Thử tìm từ khác âm <ArrowRight size={17}/></button></div></div>}

      {(view === "odd" || view === "review" || view === "exam") && <div className={`page-content practice-page ${view === "exam" ? "exam-page" : ""}`}><StagePath active={view === "review" ? "RETEST" : "CHOOSE"} onSelect={chooseStage} examLocked={view === "exam"}/><div className="practice-head"><div><div className="eyebrow small">{view === "exam" ? "THI BẤM GIỜ · 8 CÂU" : view === "review" ? "ÔN LẠI · CẶP ÂM CẦN LUYỆN" : "CHỌN · TÌM TỪ KHÁC ÂM"}</div><h1>{view === "exam" ? "Chọn từ có âm khác." : family.title}</h1><p>Chọn từ có phần được tô sáng phát âm khác các từ còn lại.</p></div>{view === "exam" && <div className={`timer ${examLeft < 15 ? "urgent" : ""}`}><Clock3 size={19}/>{examLeft}s</div>}</div>{view === "exam" && <button className="exam-exit" onClick={exitExam}><LogOut size={16}/> Thoát bài thi</button>}
        {view === "exam" && <div className="exam-progress"><span>CÂU {Math.min(examCount + (oddChoice ? 0 : 1), 8)} / 8</span><div className="exam-progress-track"><span style={{ width: `${Math.min(examCount / 8, 1) * 100}%` }}/></div><span>{examScore} CÂU ĐÚNG</span></div>}
        {view === "exam" && examDone ? <div className="result-card"><span className="result-icon"><GraduationCap size={30}/></span><h2>Đã hoàn thành bài thi</h2><p>Em trả lời đúng {examScore}/{examCount} câu đã làm. Xem lại nhóm âm của từng câu bên dưới.</p><ExamReview answers={examAnswers}/><button className="primary-button" onClick={beginExam}>Làm lượt khác <ArrowRight size={17}/></button></div> : odd && <><div className="question-card"><div className="question-label">TRỌNG TÂM: <strong>{family.grapheme.toUpperCase()}</strong><span>·</span> MỘT TỪ KHÁC ÂM</div><div className="choice-grid">{odd.options.map((item, index) => { const isCorrect = oddChoice && item.id === odd.oddId; const isWrong = oddChoice === item.id && !isCorrect; return <button key={item.id} className={`choice ${isCorrect ? "correct" : ""} ${isWrong ? "incorrect" : ""}`} onClick={() => submitOdd(item.id)} disabled={!!oddChoice}><span className="choice-letter">{letters[index]}</span><span className="choice-word"><Word item={item}/></span>{isCorrect ? <Check size={20}/> : isWrong ? <X size={20}/> : null}</button>; })}</div></div>
        {oddChoice && <div className="feedback-card"><div className="feedback-heading"><span className={oddChoice === odd.oddId ? "feedback-icon right" : "feedback-icon wrong"}>{oddChoice === odd.oddId ? <Check size={19}/> : <X size={19}/>}</span><div><strong>{oddChoice === odd.oddId ? "Chính xác!" : "Hãy xem lại các nhóm âm."}</strong><p>Phần được tô sáng ở một từ có âm khác. Chạm vào loa để nghe và so sánh.</p></div></div><div className="feedback-groups">{family.outcomes.filter((outcome) => odd.options.some((word) => word.outcomeId === outcome.id)).map((outcome) => <div key={outcome.id}><span className="feedback-ipa">{outcome.ipa}</span><span className="feedback-words">{odd.options.filter((word) => word.outcomeId === outcome.id).map((word) => <span className="feedback-word" key={word.id}>{word.word}<AudioButton word={word.word} compact/></span>)}</span></div>)}</div><div className="feedback-footer"><span>Từ khác âm: <strong>{odd.options.find((word) => word.id === odd.oddId)?.word}</strong></span><button className="primary-button" onClick={nextOdd}>{view === "exam" && examCount >= 8 ? "Xem kết quả" : "Câu tiếp theo"} <ArrowRight size={17}/></button></div></div>}</>}
        {view !== "exam" && <div className="practice-mode-links"><button onClick={() => beginSort(familyId)}><Shuffle size={16}/> Phân loại từ</button><button onClick={() => beginListen(familyId)}><Headphones size={16}/> Nghe và phân loại</button><button onClick={() => { setFamilyId(familyId); setView("lesson"); }}><BookOpen size={16}/> Xem lại bài học</button></div>}
      </div>}

      {view === "sort" && sort && <div className="page-content practice-page">
        <StagePath active="SORT" onSelect={chooseStage}/>
        <div className="eyebrow small">PHÂN LOẠI TỪ · {family.grapheme.toUpperCase()}</div>
        <h1>Xếp mỗi từ vào đúng nhóm âm.</h1>
        <p className="page-subtitle">Chạm vào một từ, rồi chọn âm của phần được tô sáng.</p>
        <div className="sort-bank"><div className="sort-bank-head"><span className="micro-label">NGÂN HÀNG TỪ</span><span>{Object.keys(sortAnswers).length} / {sort.words.length} ĐÃ XẾP</span></div><div className="sort-bank-words">{sort.words.map((word) => <button key={word.id} className={`sort-word ${sortActive === word.id ? "selected" : ""} ${sortAnswers[word.id] ? "placed" : ""}`} onClick={() => setSortActive(word.id)} disabled={!!sortAnswers[word.id] || !!sortFeedbackWord}><Word item={word}/></button>)}</div></div>
        <div className="sort-instruction">{sortActive ? "Bây giờ chọn nhóm âm phù hợp ↓" : "Chọn một từ ở trên để bắt đầu ↓"}</div>
        <div className="sort-columns">{family.outcomes.map((outcome) => <button key={outcome.id} className="sort-column" onClick={() => answerSort(outcome.id)} disabled={!sortActive || !!sortFeedbackWord}><strong>{outcome.ipa}</strong><span>{outcome.label}</span><div>{sort.words.filter((word) => (sortCorrections[word.id] ?? sortAnswers[word.id]) === outcome.id).map((word) => <span key={word.id} className={sortCorrections[word.id] ? "placed-repaired" : word.outcomeId === outcome.id ? "placed-correct" : "placed-wrong"}>{word.word}{sortCorrections[word.id] ? " ↺" : word.outcomeId === outcome.id ? " ✓" : " ✕"}</span>)}</div></button>)}</div>
        {sortFeedbackWord && <div className="sort-repair" role="status"><div><strong>Hãy nghe và sửa từ này</strong><p><Word item={sortFeedbackWord}/> có phần tô sáng đọc {family.outcomes.find((outcome) => outcome.id === sortFeedbackWord.outcomeId)?.ipa}. <AudioButton word={sortFeedbackWord.word} compact/></p></div><button className="secondary-button" onClick={() => { setSortCorrections((previous) => ({ ...previous, [sortFeedbackWord.id]: sortFeedbackWord.outcomeId })); setSortFeedbackId(null); }}>Đưa về nhóm đúng <ArrowRight size={16}/></button></div>}
        {completedSort && !sortFeedbackWord && <div className="completion"><strong>Đã phân loại xong.</strong><span>{sort.words.filter((word) => sortAnswers[word.id] === word.outcomeId).length}/{sort.words.length} từ đúng ở lần chọn đầu.</span><button className="primary-button" onClick={() => beginSort(familyId)}>Phân loại lại <RotateCcw size={17}/></button><button className="secondary-button" onClick={() => beginOdd(familyId)}>Thử câu hỏi trắc nghiệm <ArrowRight size={17}/></button></div>}
      </div>}

      {view === "listen" && listenWord && <div className="page-content practice-page">
        <StagePath active="HEAR" onSelect={chooseStage}/>
        <div className="eyebrow small">NGHE VÀ PHÂN LOẠI · {family.grapheme.toUpperCase()}</div>
        <h1>Em nghe thấy âm nào?</h1>
        <p className="page-subtitle">Nghe từ cần trả lời, so sánh với từ mẫu rồi chạm thẻ âm để chọn. Em có thể chọn bất cứ lúc nào.</p>
        <div className="listen-card">
          <div className="listen-target"><span className="micro-label">PHẦN CHỮ CẦN NGHE</span><strong><Word item={listenWord}/></strong></div>
          <button className="listen-play" onClick={playListenWord} disabled={!audioAvailable} aria-label="Nghe từ cần trả lời"><AudioLines size={38}/><span>Nghe từ cần trả lời</span></button>
          {(!audioAvailable || listenAudioFailed) && <p className="audio-unavailable">Không phát được bản ghi trên thiết bị này. Em vẫn có thể chọn âm theo phần chữ tô sáng, hoặc chuyển sang cách luyện khác.</p>}
          {!listenChoice && <p className="listen-choice-hint" role="status">{listenPlaying ? "Đang phát từ cần trả lời… Em có thể nghe hết rồi chọn âm." : "Chạm vào thẻ âm để chọn đáp án; loa dưới thẻ chỉ phát từ mẫu."}</p>}
          <div className="listen-options">{family.outcomes.map((outcome) => {
            const example = exampleForOutcome(family.id, outcome.id);
            return <div className="listen-option" key={outcome.id}>
              <button type="button" className={`listen-choice ${listenChoice === outcome.id ? (outcome.id === listenWord.outcomeId ? "correct" : "incorrect") : ""}`} aria-label={`Chọn âm ${outcome.ipa}, ${outcome.label}`} onClick={() => answerListen(outcome.id)} disabled={!!listenChoice}>{outcome.ipa}<span>{outcome.label}</span></button>
              <div className="listen-example"><span className="listen-example-label">NGHE CẢ TỪ MẪU</span><div className="listen-example-word"><AudioButton word={example.word} compact sample onPlayStart={() => { listenPlaybackToken.current++; setListenPlaying(false); }}/><span><Word item={example}/></span></div></div>
            </div>;
          })}</div>
          {listenChoice && <div className="listen-answer"><strong>{listenChoice === listenWord.outcomeId ? "Đúng âm rồi!" : "Nghe lại và so sánh nhé."}</strong><p><Word item={listenWord}/> → {family.outcomes.find((outcome) => outcome.id === listenWord.outcomeId)?.ipa} · {listenWord.ipa}</p><button className="primary-button" onClick={() => beginListen(familyId)}>Từ tiếp theo <ArrowRight size={17}/></button></div>}
        </div>
      </div>}
    </main>
    {showOnboarding && !welcomeActive && <OnboardingDialog onClose={closeOnboarding}/>}
  </div>;
}

export default function Page() {
  if (process.env.NODE_ENV === "development" || cloudFamilyMode) return <LocalFamilyApp renderStudent={(profile, onSwitch, onParent) => <StudentEnvironment key={profile.id} profile={profile} onSwitch={onSwitch} onParent={onParent}/>}/>;
  return <HomePage/>;
}

function StudentEnvironment({ profile, onSwitch, onParent }: { profile: LocalProfile; onSwitch: (failed?: boolean) => void; onParent: (failed?: boolean) => void }) {
  const [welcomeActive, setWelcomeActive] = useState(true);
  return <><SpecialWelcome studentId={profile.id} endpoint={cloudFamilyMode ? "/api/welcome" : "/api/special-welcome"} onInviteActiveChange={setWelcomeActive}/><HomePage profile={profile} onSwitch={onSwitch} onParent={onParent} welcomeActive={welcomeActive}/></>;
}
