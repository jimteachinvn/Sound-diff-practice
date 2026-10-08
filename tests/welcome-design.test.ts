import test from "node:test";
import assert from "node:assert/strict";
import { isRescueWelcome, rescueWelcomeGreeting, welcomeGreetingForDesign } from "../lib/welcome-design.ts";

test("welcome design is explicit, versioned and compatible with the existing private greeting field", () => {
  assert.equal(welcomeGreetingForDesign(undefined, "rescue-v1"), rescueWelcomeGreeting);
  assert.ok(rescueWelcomeGreeting.length <= 120);
  assert.ok(isRescueWelcome(rescueWelcomeGreeting));
  assert.equal(welcomeGreetingForDesign("  Chào   con! ", undefined), "Chào con!");
  assert.equal(isRescueWelcome('{"template":"other"}'), false);
  assert.throws(() => welcomeGreetingForDesign("Hello", "unknown"));
  assert.throws(() => welcomeGreetingForDesign(rescueWelcomeGreeting, "plain"));
  assert.throws(() => welcomeGreetingForDesign("x".repeat(121), "plain"));
});
