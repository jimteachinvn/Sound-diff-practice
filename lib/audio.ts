let activeAudio: HTMLAudioElement | null = null;

export function wordAudioUrl(word: string): string {
  if (!/^[a-z]+$/.test(word)) throw new Error(`Invalid audio word: ${word}`);
  return `/audio/words/${word}.mp3`;
}

export function supportsWordAudio(): boolean {
  return typeof document !== "undefined" && document.createElement("audio").canPlayType("audio/mpeg") !== "";
}

export function stopWordAudio(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
}

export function playWordAudio(word: string): Promise<boolean> {
  if (!supportsWordAudio()) return Promise.resolve(false);
  stopWordAudio();
  const audio = new Audio(wordAudioUrl(word));
  activeAudio = audio;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) activeAudio = null;
      resolve(played);
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    // Selecting an answer or another example intentionally stops this clip.
    // That cancellation should not display an audio failure on the old button.
    audio.onpause = () => { if (!audio.ended) finish(true); };
    void audio.play().catch(() => finish(false));
  });
}
