import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {portabilityScope} from '../src/portability.js';
test('portability receipts report the actual platform and never promote native support',()=>{
 const value=portabilityScope();assert.equal(value.platform,process.platform);assert.equal(value.arch,process.arch);assert.equal(value.nativeRecipientAcceptance,'not-run');assert.equal(value.milestone24Complete,false);
});
test('CLI refuses a supplied/faked platform instead of producing a Windows receipt',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-portability.mjs',import.meta.url)),'--platform','win32','--out','unused'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/platform is measured/);
});
