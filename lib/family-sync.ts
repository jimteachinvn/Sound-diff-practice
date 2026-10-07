import type { Attempt } from "./mastery.ts";
type UploadResult = Attempt[] | { attempts: Attempt[]; rejected: string[] };

/** One queue per selected student: acknowledge only server-persisted answers. */
export class FamilyAttemptSync {
  private acknowledged: Set<string>;
  private queue: Promise<unknown> = Promise.resolve();
  private needsRefresh = false;
  private rejected = new Set<string>();
  get hasRejected(): boolean { return this.rejected.size > 0; }
  private upload: (batch: Attempt[]) => Promise<UploadResult>;
  private refresh: () => Promise<Attempt[]>;

  constructor(initial: Attempt[], upload: (batch: Attempt[]) => Promise<UploadResult>, refresh: () => Promise<Attempt[]>) {
    this.acknowledged = new Set(initial.map((attempt) => attempt.id));
    this.upload = upload;
    this.refresh = refresh;
  }

  synchronize(attempts: Attempt[], refresh = false): Promise<Attempt[]> {
    const operation = this.queue.catch(() => undefined).then(async () => {
      const pending = attempts.filter((attempt) => !this.acknowledged.has(attempt.id) && !this.rejected.has(attempt.id));
      for (let offset = 0; offset < pending.length; offset += 200) {
        const batch = pending.slice(offset, offset + 200);
        const result = await this.upload(batch);
        const saved = Array.isArray(result) ? result : result.attempts;
        const rejectedIds = new Set(Array.isArray(result) ? [] : result.rejected);
        const savedIds = new Set(saved.map((attempt) => attempt.id));
        for (const attempt of batch) {
          if (rejectedIds.has(attempt.id)) { this.rejected.add(attempt.id); continue; }
          if (!savedIds.has(attempt.id)) throw new Error("Server did not acknowledge an answer");
          this.acknowledged.add(attempt.id);
        }
        this.needsRefresh = true;
      }
      if (!pending.length && !refresh && !this.needsRefresh) return [];
      const remote = await this.refresh();
      remote.forEach((attempt) => this.acknowledged.add(attempt.id));
      this.needsRefresh = false;
      return remote;
    });
    this.queue = operation;
    return operation;
  }
}
