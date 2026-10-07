import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { addStudent, familyFromToken, getStudent, isAdmin, listFamiliesForAdmin, mergeStudentAttempts, normalizePhone, prepareAdminCode, resetFamilyPin, signInAdmin, signInFamily, signUpFamily } from "../lib/local-family-store.ts";

test("local family accounts keep siblings separate and permit a verified manual reset", () => {
  const dir = mkdtempSync(join(tmpdir(), "sound-family-test-"));
  const previous = process.env.LOCAL_FAMILY_DATA_DIR;
  process.env.LOCAL_FAMILY_DATA_DIR = dir;
  try {
    assert.equal(normalizePhone("0865 123 456"), "+84865123456");
    const first = signUpFamily("Test Parent", "0865 123 456", "4826");
    assert.equal(first.family.phone, "+84865123456");
    assert.ok(!readFileSync(join(dir, "families.json"), "utf8").includes('"4826"'), "PIN is not stored as plaintext");
    assert.throws(() => signInFamily("0865 123 456", "1111"));
    assert.equal(signInFamily("+84865123456", "4826").family.id, first.family.id);
    const one = addStudent(first.family.id, "Student One").students[0];
    const two = addStudent(first.family.id, "Student Two").students[1];
    assert.throws(() => addStudent(first.family.id, "Student One"));
    const attempt = { id: randomUUID(), at: new Date().toISOString(), familyId: "ea", contrastId: "ea:e~i-long", itemId: "q1", mode: "odd", selectedId: "a", correctId: "a", correct: true, latencyMs: 1200 };
    assert.equal(mergeStudentAttempts(first.family.id, one.id, [attempt]).length, 1);
    assert.equal(mergeStudentAttempts(first.family.id, one.id, [attempt]).length, 1, "sync is idempotent");
    assert.equal(getStudent(first.family.id, two.id)?.attempts.length, 0);
    assert.equal(listFamiliesForAdmin().find((family) => family.id === first.family.id)?.students.find((student) => student.id === one.id)?.answers, 1);
    const other = signUpFamily("Other Parent", "0912 345 678", "2794");
    assert.equal(getStudent(other.family.id, one.id), null);
    prepareAdminCode();
    const code = readFileSync(join(dir, "admin-access.txt"), "utf8").trim();
    const adminToken = signInAdmin(code);
    assert.equal(isAdmin(adminToken), true);
    for (let i = 0; i < 5; i++) assert.throws(() => signInFamily("0865 123 456", "1111"));
    assert.throws(() => signInFamily("0865 123 456", "4826"), /15 phút/);
    resetFamilyPin(first.family.id, "5639");
    assert.equal(familyFromToken(first.token), null, "reset invalidates family sessions");
    assert.throws(() => signInFamily("0865 123 456", "4826"));
    assert.equal(signInFamily("0865 123 456", "5639").family.id, first.family.id);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_FAMILY_DATA_DIR;
    else process.env.LOCAL_FAMILY_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the request cap does not become a lifetime answer cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "sound-family-history-test-"));
  const previous = process.env.LOCAL_FAMILY_DATA_DIR;
  process.env.LOCAL_FAMILY_DATA_DIR = dir;
  try {
    const family = signUpFamily("Test Parent", "+84900000999", "2468").family;
    const student = addStudent(family.id, "Test Child").students[0];
    const base = { at: "2026-10-06T08:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long",
      mode: "odd" as const, selectedId: "a", correctId: "a", correct: true, latencyMs: 1000 };
    const batch = Array.from({ length: 5000 }, (_, index) => ({ ...base, id: randomUUID(), itemId: `q${index}` }));
    mergeStudentAttempts(family.id, student.id, batch);
    mergeStudentAttempts(family.id, student.id, [{ ...base, id: randomUUID(), itemId: "q5000" }]);
    assert.equal(getStudent(family.id, student.id)?.attempts.length, 5001);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_FAMILY_DATA_DIR;
    else process.env.LOCAL_FAMILY_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
