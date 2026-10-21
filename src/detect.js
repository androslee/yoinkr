// Find installed Electron apps: an install is anything with resources/app.asar
// or an unpacked resources/app/. Detection is deliberately shallow — one level
// under each candidate root, plus the flatpak/snap layouts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { readEntryJson } from './asar.js';

export function candidateRoots(platform = process.platform, home = homedir(), env = process.env) {
  if (platform === 'linux') {
    return ['/opt', '/usr/lib', '/usr/share', join(home, '.local/share'), '/var/lib/flatpak/app', '/snap'];
  }
  if (platform === 'darwin') return ['/Applications', join(home, 'Applications')];
  if (platform === 'win32') {
    return [env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : null, 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean);
  }
  return [];
}

export function inspectInstall(dir) {
  if(dir.endsWith('.app'))dir=join(dir,'Contents');
  const resources=join(dir,basename(dir)==='Contents'?'Resources':'resources');
  const asarPath=existsSync(join(resources,'app.asar'))?join(resources,'app.asar'):null;
  const unpackedDir=existsSync(join(resources,'app'))?join(resources,'app'):null;
  if (!asarPath && !unpackedDir) return null;

  let version = null;
  try {
    if (asarPath) version = readEntryJson(asarPath, 'package.json')?.version ?? null;
    if (!version && unpackedDir) version = JSON.parse(readFileSync(join(unpackedDir, 'package.json'), 'utf8')).version ?? null;
  } catch { version = null; }

  return {
    appId: (basename(dir)==='Contents'?basename(join(dir,'..')).replace(/\.app$/,''):basename(dir)).replace(/[^a-zA-Z0-9._-]/g,'-'),
    name: basename(dir),
    installDir: dir,
    asarPath,
    unpackedDir,
    version,
    executable: findExecutable(dir),
    modkitWritable: false, // this loader never writes target app files
  };
}

export function scan(roots = candidateRoots()) {
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries;
    try { entries = readdirSync(root); } catch { continue; }
    for (const entry of entries) {
      const dir = join(root, entry);
      try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
      // flatpak: <root>/<app>/current/active/files ; snap: /snap/<pkg>/current
      const nested = [dir, join(dir, 'current', 'active', 'files'), join(dir, 'current')];
      for (const candidate of nested) {
        const hit = inspectInstall(candidate);
        if (hit) { if(candidate!==dir)hit.appId=basename(dir);found.push(hit);break; }
      }
    }
  }
  return dedupe(found);
}

function findExecutable(dir) {
  let name=basename(dir),mainDir=dir;
  if(name==='Contents'){mainDir=join(dir,'MacOS');name=basename(join(dir,'..')).replace(/\.app$/,'');}
  const resources=join(dir,basename(dir)==='Contents'?'Resources':'resources');
  let pkg;try{pkg=existsSync(join(resources,'app.asar'))?readEntryJson(join(resources,'app.asar'),'package.json'):JSON.parse(readFileSync(join(resources,'app','package.json'),'utf8'));}catch{}
  const preferred=[name,pkg?.name,pkg?.productName].filter(Boolean);
  for(const n of preferred.filter(n=>typeof n==='string'&&basename(n)===n&&!n.includes('\\')))for(const candidate of [n,n+'.exe']){
   const file=join(mainDir,candidate);try{if(statSync(file).isFile()&&(process.platform==='win32'||(statSync(file).mode&0o111)))return file;}catch{}
  }

  try {
    for (const entry of readdirSync(mainDir).sort()) {
      const full = join(mainDir, entry);
      const st = statSync(full);
      if (st.isFile() && !/(crashpad|sandbox|helper|chrome)/i.test(entry) && (st.mode & 0o111) && !entry.includes('.')) return full;
      if(st.isFile()&&entry.toLowerCase().endsWith('.exe')&&!/(crashpad|helper|unins)/i.test(entry))return full;
      if (st.isFile() && entry.toLowerCase().endsWith('.appimage')) return full;
    }
  } catch { /* ignore */ }
  return null;
}

function dedupe(apps) {
  const seen = new Set();
  return apps.filter((a) => {
    const key = a.asarPath ?? a.unpackedDir;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
