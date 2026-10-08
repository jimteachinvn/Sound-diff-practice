/** Versioned, non-personal design selection stored within the existing greeting field. */
export const rescueWelcomeGreeting = '{"template":"rescue-v1"}';

export function isRescueWelcome(greeting: string): boolean {
  return greeting === rescueWelcomeGreeting;
}

export function welcomeGreetingForDesign(greeting: unknown, design: unknown): string {
  if (design === "rescue-v1") return rescueWelcomeGreeting;
  if (design !== undefined && design !== "plain") throw new Error("Mẫu lời chào chưa hợp lệ.");
  if (typeof greeting !== "string") throw new Error("Vui lòng nhập lời chào.");
  const value = greeting.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 120) throw new Error("Lời chào cần từ 2 đến 120 ký tự.");
  // Design markers are only generated through explicit design selection.
  if (isRescueWelcome(value)) throw new Error("Vui lòng chọn mẫu lời chào.");
  return value;
}
