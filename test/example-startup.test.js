import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readlink, symlink, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  firefoxExecutable,
  portableFirefoxDirectory,
  preparePortableFirefox
} from '../examples/screenity-firefox/firefox-path.mjs';

test('Firefox paths distinguish macOS bundle, Linux directory and Windows executable', () => {
  assert.equal(firefoxExecutable('Firefox.app', 'darwin'), join('Firefox.app', 'Contents', 'MacOS', 'firefox'));
  assert.equal(firefoxExecutable('browser', 'win32'), join('browser', 'firefox.exe'));
  assert.equal(firefoxExecutable('browser', 'linux'), join('browser', 'firefox'));
  assert.equal(portableFirefoxDirectory('local', 'darwin'), join('local', 'firefox', 'Firefox.app'));
});
test(
  'macOS portable copy preserves the entire bundle and symlinks, and keeps an existing copy',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'yoinkr-firefox-'));
    try {
      const source = join(root, 'Firefox.app');
      await mkdir(join(source, 'Contents', 'MacOS'), { recursive: true });
      await mkdir(join(source, 'Contents', 'Resources'));
      await writeFile(join(source, 'Contents', 'MacOS', 'firefox'), 'fixture');
      await writeFile(join(source, 'Contents', 'Resources', 'signature-fixture'), 'preserve');
      await symlink('Resources', join(source, 'Contents', 'linked-resources'));
      const result = await preparePortableFirefox(source, join(root, 'local'), 'darwin');
      assert.equal(result.copied, true);
      assert.equal(await readlink(join(result.directory, 'Contents', 'linked-resources')), 'Resources');
      assert.equal(
        await readFile(join(result.directory, 'Contents', 'Resources', 'signature-fixture'), 'utf8'),
        'preserve'
      );
      await writeFile(join(source, 'Contents', 'MacOS', 'firefox'), 'changed');
      assert.equal((await preparePortableFirefox(source, join(root, 'local'), 'darwin')).copied, false);
      assert.equal(await readFile(firefoxExecutable(result.directory, 'darwin'), 'utf8'), 'fixture');
      await assert.rejects(
        preparePortableFirefox(join(source, 'Contents'), join(root, 'bad'), 'darwin'),
        /full Firefox.app/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
test('fresh Screenity launch refuses an unbuilt example with an actionable message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-launch-'));
  try {
    for (const name of ['launch.mjs', 'firefox-path.mjs'])
      await cp(new URL('../examples/screenity-firefox/' + name, import.meta.url), join(root, name));
    const child = spawnSync(process.execPath, [join(root, 'launch.mjs')], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, YOINKR_FIREFOX: join(root, 'absent') }
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Build the example.*README/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
