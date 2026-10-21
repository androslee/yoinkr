import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,validateRecoveryRecipe,recoverWebpackModules,verifyFeaturePackage} from '../src/feature-package.js';
import {sha256} from '../src/workspace.js';
const recipe=JSON.parse(await readFile(new URL('../recipes/mqtt-raw-diff/recipe.json',import.meta.url)));
const id='./src/panel.tsx';
function fixture({wrapper='(__unused_webpack_module, __webpack_exports__, __webpack_require__)',body='',source='export const value=1',map={},twice=false}={}){
 const raw={version:3,sources:['webpack://app/./src/panel.tsx'],sourcesContent:[source],mappings:'AAAA',names:[],...map};
 const text='__webpack_require__.r(__webpack_exports__);\n'+body+'\n//# sourceMappingURL=data:application/json;base64,'+Buffer.from(JSON.stringify(raw)).toString('base64');
 const module=`/***/ "${id}":\n/***/ (${wrapper} => {\n"use strict";\neval(${JSON.stringify(text)});\n/***/ })`;
 return Buffer.from('/* webpack eval-source-map */\n'+module+(twice?'\n'+module:''));
}
test('canonical digest ignores object property insertion order',()=>assert.equal(canonical({b:1,a:{z:2,c:3}}),canonical({a:{c:3,z:2},b:1})));
test('recovery recipe is strict and rejects traversal and duplicate boundaries',()=>{
 assert.equal(validateRecoveryRecipe(recipe).id,'mqtt-raw-diff');
 assert.throws(()=>validateRecoveryRecipe({...recipe,unexpected:true}));
 assert.throws(()=>validateRecoveryRecipe({...recipe,files:[{path:'../escape',sha256:'a'.repeat(64)}]}));
 assert.throws(()=>validateRecoveryRecipe({...recipe,boundaries:[...recipe.boundaries,recipe.boundaries[0]]}),/Duplicate/);
});
test('webpack recovery preserves exact original, wrapper, imports and byte range without execution',()=>{
 const bytes=fixture({body:'globalThis.MUST_NOT_EXECUTE = true; __webpack_require__("./node_modules/react/index.js");'});
 const m=recoverWebpackModules(bytes,{wanted:[id]}).get(id);
 assert.equal(m.source.toString(),'export const value=1');assert.deepEqual(m.references,['./node_modules/react/index.js']);assert.ok(m.range.end>m.range.start);assert.match(m.wrapper,/__webpack_exports__/);assert.equal(globalThis.MUST_NOT_EXECUTE,undefined);
});
test('unsupported bundles and missing original sources are refused',()=>{
 assert.throws(()=>recoverWebpackModules(Buffer.from('(()=>{})()'),{wanted:[id]}),/Unsupported bundle/);
 assert.throws(()=>recoverWebpackModules(fixture({map:{sourcesContent:[null]}}),{wanted:[id]}),/Unsupported source map/);
});
test('module/source map identity mismatch refused',()=>assert.throws(()=>recoverWebpackModules(fixture({map:{sources:['webpack://app/other.ts']}}),{wanted:[id]}),/identity differs/));
test('ambiguous duplicate module refused',()=>assert.throws(()=>recoverWebpackModules(fixture({twice:true}),{wanted:[id]}),/Duplicate/));
test('unrecognized factory bindings refused',()=>assert.throws(()=>recoverWebpackModules(fixture({wrapper:'(module, exports, loader)'}),{wanted:[id]}),/wrapper bindings/));
test('dynamic module closure and unsupported loader helpers refused',()=>{
 for(const body of ['__webpack_require__(someVariable);','__webpack_require__.e("chunk");','__webpack_require__.t("other");'])assert.throws(()=>recoverWebpackModules(fixture({body}),{wanted:[id]}),/dynamic|lazy|helper/);
});
async function packageFixture(t){const root=await mkdtemp(join(tmpdir(),'yoinkr-feature-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const files=[];for(const path of ['payload/feature.js','payload/index.html','RECIPE.json','DEPENDENCIES.json','TRANSFORMS.json','PROVENANCE.json','originals/panel.tsx']){await mkdir(join(root,path,'..'),{recursive:true});const b=Buffer.from(path);await writeFile(join(root,path),b);files.push({path,bytes:b.length,sha256:sha256(b)})}const semantic={schema:1,kind:'recovered-renderer-package',id:'mqtt-raw-diff',version:'1.0.0',route:'source',runtime:{renderer:'Chromium >=120',isolation:'own document/root; never share host React'},api:['mount','update','snapshot','dispose'],entry:'payload/feature.js',capabilities:recipe.capabilities,limits:recipe.limits,files};const digest=sha256(canonical(semantic));await writeFile(join(root,'FEATURE.json'),canonical({...semantic,digest}));return{root,digest};}
test('package verification binds external digest',async t=>{const {root,digest}=await packageFixture(t);assert.equal((await verifyFeaturePackage(root,{expectedDigest:digest})).status,'verified');await assert.rejects(verifyFeaturePackage(root,{expectedDigest:'a'.repeat(64)}),/digest changed/)});
for(const name of ['originals/panel.tsx','DEPENDENCIES.json','TRANSFORMS.json'])test('package refuses tampered '+name,async t=>{const {root}=await packageFixture(t);await writeFile(join(root,name),'changed');await assert.rejects(verifyFeaturePackage(root),/changed/)});
test('missing asset gets explicit file diagnostic',async t=>{const {root}=await packageFixture(t);await rm(join(root,'payload/index.html'));await assert.rejects(verifyFeaturePackage(root),/index.html/)});
test('untracked code refused',async t=>{const {root}=await packageFixture(t);await writeFile(join(root,'extra.js'),'0');await assert.rejects(verifyFeaturePackage(root),/Untracked/)});
test('symlinked original cannot escape package',async t=>{const {root}=await packageFixture(t);await rm(join(root,'originals/panel.tsx'));await symlink('/etc/hostname',join(root,'originals/panel.tsx'));await assert.rejects(verifyFeaturePackage(root),/escaped/)});
