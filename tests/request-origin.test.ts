import test from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedRequestOrigin} from '../lib/request-origin.ts';
const canonical='https://ho-am-tieng-anh.netlify.app';
const request=(origin?:string,host='https://deployment-alias.netlify.app')=>new Request(host+'/api/family',{headers:origin?{Origin:origin}: {}});
test('canonical hosted origin survives a deployment alias without trusting caller headers',()=>{
  assert.equal(isAllowedRequestOrigin(request(canonical),canonical),true);
  assert.equal(isAllowedRequestOrigin(request('https://deployment-alias.netlify.app'),canonical),true);
  assert.equal(isAllowedRequestOrigin(request('https://example.com'),canonical),false);
  assert.equal(isAllowedRequestOrigin(request(),canonical),false);
  assert.equal(isAllowedRequestOrigin(request('null'),canonical),false);
  assert.equal(isAllowedRequestOrigin(new Request('https://deployment-alias.netlify.app/api/family',{headers:{Origin:'https://example.com','X-Forwarded-Host':'example.com'}}),canonical),false);
});
test('loopback hostname equivalence is restricted to development and the same port',()=>{
  assert.equal(isAllowedRequestOrigin(request('http://localhost:3000','http://127.0.0.1:3000'),canonical,true),true);
  assert.equal(isAllowedRequestOrigin(request('http://localhost:3000','http://127.0.0.1:3000'),canonical,false),false);
  assert.equal(isAllowedRequestOrigin(request('http://localhost:3001','http://127.0.0.1:3000'),canonical,true),false);
});
