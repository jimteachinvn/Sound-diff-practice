import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateFamilyDeletionConfirmation} from '../lib/family-deletion.ts';
import {addStudent,deleteFamily,familyFromToken,getStudent,listFamiliesForAdmin,signInFamily,signUpFamily} from '../lib/local-family-store.ts';
import {createSpecialWelcomeInvite,greetingForInvite,removeFamilyWelcome} from '../lib/special-welcome.ts';
test('family removal requires the exact phone and removes only the chosen family and sessions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sr-delete-')),previous=process.env.LOCAL_FAMILY_DATA_DIR;
 process.env.LOCAL_FAMILY_DATA_DIR=dir;
 try {
  const a=signUpFamily('Disposable A','0865123456','583721'),b=signUpFamily('Disposable B','0865123457','583721');
  const student=addStudent(a.family.id,'Test student').students[0];
  const link=createSpecialWelcomeInvite(a.family.id,student.id,'Xin chào em!','http://127.0.0.1:3000');
  const token=new URL(link).hash.slice('#welcome='.length);
  assert.throws(()=>deleteFamily(a.family.id,b.family.phone));
  assert.ok(familyFromToken(a.token));
  removeFamilyWelcome(a.family.id);deleteFamily(a.family.id,a.family.phone);
  assert.equal(familyFromToken(a.token),null);assert.equal(getStudent(a.family.id,student.id),null);
  assert.equal(greetingForInvite(a.family.id,student.id,token),null);
  assert.throws(()=>signInFamily(a.family.phone,'583721'));
  assert.equal(listFamiliesForAdmin().length,1);assert.ok(familyFromToken(b.token));
  assert.throws(()=>deleteFamily(a.family.id,a.family.phone));
 } finally { if(previous===undefined) delete process.env.LOCAL_FAMILY_DATA_DIR;else process.env.LOCAL_FAMILY_DATA_DIR=previous;rmSync(dir,{recursive:true,force:true}); }
});
test('deletion confirmation cannot be bypassed by a missing or different phone',()=>{
 for(const value of [undefined,null,true,'','0865123456','+84865123457']) assert.throws(()=>validateFamilyDeletionConfirmation('+84865123456',value));
 assert.doesNotThrow(()=>validateFamilyDeletionConfirmation('+84865123456',' +84865123456 '));
});
