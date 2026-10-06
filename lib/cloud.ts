import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emptyState, mergeLearningStates, recordAttempt, type Attempt, type LearningState } from "./mastery";

let client: SupabaseClient | null = null;
let syncChain: Promise<void> = Promise.resolve();
const syncedAttemptIds = new Map<string, Set<string>>();

export type CloudIdentity = { id: string; email: string | null; anonymous: boolean };

export function cloudConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

function getClient(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  return client;
}

export async function cloudIdentity(): Promise<CloudIdentity | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const existing = await supabase.auth.getUser();
  const user = existing.data.user ?? (existing.error ? (await supabase.auth.getSession()).data.session?.user : null);
  if (!user) return null;
  return { id: user.id, email: user.email ?? null, anonymous: !!user.is_anonymous };
}

export async function sendCloudEmail(email: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) throw new Error("Cloud sync is not configured");
  const identity = await cloudIdentity();
  const response = identity?.anonymous
    ? await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin })
    : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (response.error) throw response.error;
}

export async function signOutCloud(): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onCloudAuthChange(callback: () => void): () => void {
  const supabase = getClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") callback();
  });
  return () => data.subscription.unsubscribe();
}

async function syncOnce(state: LearningState, expectedStudentId: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const current = await supabase.auth.getUser();
  if (current.error || current.data.user?.id !== expectedStudentId) throw new Error("Cloud account changed during sync");
  const studentId = expectedStudentId;
  const synced = syncedAttemptIds.get(studentId) ?? new Set<string>();
  syncedAttemptIds.set(studentId, synced);
  const unsynced = state.attempts.filter((attempt) => !synced.has(attempt.id));
  if (!state.attempts.length) {
    const { error } = await supabase.from("sr_student_attempts").select("id").limit(1);
    if (error) throw error;
  }
  if (unsynced.length) {
    const { error } = await supabase.from("sr_student_attempts").upsert(unsynced.map((attempt) => ({
      id: attempt.id, student_id: studentId, item_snapshot: attempt.itemSnapshot ?? { itemId: attempt.itemId },
      family_id: attempt.familyId, contrast_id: attempt.contrastId, mode: attempt.mode,
      selected_id: attempt.selectedId, correct_id: attempt.correctId, is_correct: attempt.correct,
      latency_ms: attempt.latencyMs, attempted_at: attempt.at
    })), { onConflict: "id" });
    if (error) throw error;
    unsynced.forEach((attempt) => synced.add(attempt.id));
  }
}

export async function mergeCloudProgress(local: LearningState): Promise<LearningState> {
  const supabase = getClient();
  if (!supabase) return local;
  const identity = await cloudIdentity();
  if (!identity) return local;
  const studentId = identity.id;
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("sr_student_attempts")
      .select("id,attempted_at,family_id,contrast_id,item_snapshot,mode,selected_id,correct_id,is_correct,latency_ms")
      .eq("student_id", studentId).order("attempted_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  const remote: Attempt[] = rows.map((row) => ({
    id: String(row.id), at: String(row.attempted_at), familyId: String(row.family_id), contrastId: String(row.contrast_id),
    itemId: (row.item_snapshot as { itemId?: string })?.itemId ?? String(row.id),
    itemSnapshot: row.item_snapshot, mode: row.mode as Attempt["mode"], selectedId: String(row.selected_id),
    correctId: String(row.correct_id), correct: Boolean(row.is_correct), latencyMs: Number(row.latency_ms)
  }));
  const remoteState = remote.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).reduce(recordAttempt, emptyState);
  return mergeLearningStates(remoteState, local);
}

// Serialize account-bound attempt uploads; a failure must not block a later retry.
export async function queueCloudSync(state: LearningState, studentId?: string): Promise<"local" | "synced" | "failed"> {
  if (!cloudConfigured()) return "local";
  if (!studentId) return "local";
  const request = syncChain.catch(() => {}).then(() => syncOnce(state, studentId));
  syncChain = request;
  return request.then(() => "synced", () => "failed");
}
