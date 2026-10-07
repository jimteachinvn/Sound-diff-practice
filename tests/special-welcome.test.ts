import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addStudent, signUpFamily } from "../lib/local-family-store.ts";
import { createSpecialWelcomeInvite, greetingForInvite } from "../lib/special-welcome.ts";

test("special greeting requires the invite, correct family and matching student", () => {
  const previous = process.env.LOCAL_FAMILY_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), "special-welcome-"));
  process.env.LOCAL_FAMILY_DATA_DIR = dir;
  try {
    const first = signUpFamily("Test Parent", "+84900000111", "2468").family;
    const sibling = addStudent(first.id, "First Child").students[0];
    const otherChild = addStudent(first.id, "Second Child").students[1];
    const otherFamily = signUpFamily("Another Parent", "+84900000222", "1357").family;
    const otherStudent = addStudent(otherFamily.id, "Third Child").students[0];
    const url = createSpecialWelcomeInvite(first.id, sibling.id, "Em là một ngôi sao!", "http://127.0.0.1:3000/");
    const token = new URLSearchParams(new URL(url).hash.slice(1)).get("welcome");
    assert.ok(token);
    assert.equal(greetingForInvite(first.id, sibling.id, token), "Em là một ngôi sao!");
    assert.equal(greetingForInvite(first.id, otherChild.id, token), null);
    assert.equal(greetingForInvite(otherFamily.id, otherStudent.id, token), null);
    assert.equal(greetingForInvite(first.id, sibling.id, "wrong"), null);
    assert.throws(() => createSpecialWelcomeInvite(first.id, sibling.id, "Hi", "https://example.com/"));
    const replacement = createSpecialWelcomeInvite(first.id, sibling.id, "Chào em!", "http://localhost:3000/");
    assert.equal(greetingForInvite(first.id, sibling.id, token), null);
    assert.equal(greetingForInvite(first.id, sibling.id, new URLSearchParams(new URL(replacement).hash.slice(1)).get("welcome")), "Chào em!");
  } finally {
    if (previous === undefined) delete process.env.LOCAL_FAMILY_DATA_DIR;
    else process.env.LOCAL_FAMILY_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
