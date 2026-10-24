import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectVsCodeHooks } from '../src/adapter-repair.js';
import { patchVsCodeWorkbench } from '../src/host-adapters/vscode.js';
const fixture = (broker = 'Vc') =>
  `const ns=globalThis.vscode,${broker}=ns.ipcRenderer;${broker}.on("vscode:runAction",async(t,...i)=>{let n=i[0],r=n.args||[];this.editorService.activeTextEditorControl;});class Host{constructor(n,r,a){this.titleService=n;this.themeService=r;this.notificationService=a;}capabilities(x){x.activeTextEditorControl;x.getModel;x.getSelection;x.getValueInRange;x.getColorTheme;x.onDidColorThemeChange;}}`;
test('structural analysis resolves renamed IPC broker through immutable global provenance', () => {
  const a = inspectVsCodeHooks(fixture()),
    b = inspectVsCodeHooks(fixture('Dc'));
  assert.deepEqual(a.constraints, b.constraints);
  assert.equal(a.hooks.broker, 'Vc');
  assert.equal(b.hooks.broker, 'Dc');
  assert.notEqual(a.sourceSha256, b.sourceSha256);
  assert.match(patchVsCodeWorkbench(fixture('Dc'), b.hooks), /Dc\.send\("vscode:modkit:selection"/);
});
test('multiple or missing handlers and constructor bindings are blocked', () => {
  for (const value of [
    fixture() + 'Vc.on("vscode:runAction",()=>{});',
    fixture().replace('vscode:runAction', 'other'),
    fixture().replace('this.themeService=r;', ''),
    fixture() + 'class Other{constructor(n,r,a){this.titleService=n;this.themeService=r;this.notificationService=a;}}'
  ])
    assert.throws(() => inspectVsCodeHooks(value), /Ambiguous or missing/);
});
test('missing capabilities, mutable/unresolved brokers and changed callback contracts block repair', () => {
  for (const value of [
    fixture().replace('x.getSelection', 'x.unknown'),
    fixture() + 'Vc=other;',
    fixture().replace('globalThis.vscode', 'other.vscode'),
    fixture().replace('async(t,...i)', 'async(t,...other)'),
    fixture().replace('this.themeService=r;', 'this.themeService=n;')
  ])
    assert.throws(() => inspectVsCodeHooks(value), /Missing required|mutable|provenance|callback|bindings/);
});
test('hash ranges point to exact source bytes; moving code alone does not change constraints', () => {
  const source = fixture(),
    a = inspectVsCodeHooks(source),
    b = inspectVsCodeHooks('// harmless offset\n' + source);
  assert.deepEqual(a.constraints, b.constraints);
  assert.notEqual(a.ranges.selection.start, b.ranges.selection.start);
  assert.equal(source.slice(a.ranges.theme.start, a.ranges.theme.end), a.hooks.theme);
  assert.throws(() => inspectVsCodeHooks('const = invalid'), /Unexpected token/);
});
