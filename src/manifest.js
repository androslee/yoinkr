// Mod manifest: load, validate, and detect conflicts between mods.
// Spec: docs/manifest-spec.md

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { realpathSync, statSync } from 'node:fs';

export const SCHEMA_VERSION = 1;

const TOUCH_KEYS = ['dom', 'ipc', 'globals', 'files'];

export function loadManifest(dir) {
  const file = join(dir, 'mod.json');
  if (!existsSync(file)) throw new Error(`no mod.json in ${dir}`);
  return validateManifest(JSON.parse(readFileSync(file, 'utf8')), file);
}

export function validateManifest(raw, source = '<manifest>') {
  const errors = [];
  const warnings = [];
  const reqStr = (obj, key, where) => {
    if (typeof obj?.[key] !== 'string' || !obj[key]) errors.push(`${where}.${key}: required string`);
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false,errors:[`${source}: expected an object`],warnings,manifest:raw,source};
  if (typeof raw.id==='string'&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(raw.id)) errors.push(`${source}.id: invalid identifier`);
  if (typeof raw.entry==='string'&&(isAbsolute(raw.entry)||raw.entry.includes('\\')||raw.entry.split('/').includes('..'))) errors.push(`${source}.entry: must stay inside the mod directory`);
  if (raw.conflicts_with!==undefined&&(!Array.isArray(raw.conflicts_with)||raw.conflicts_with.some(x=>typeof x!=='string'))) errors.push(`${source}.conflicts_with: expected string array`);
  if (raw.exclusive!==undefined&&typeof raw.exclusive!=='boolean') errors.push(`${source}.exclusive: expected boolean`);
  if (raw?.schema !== SCHEMA_VERSION) errors.push(`${source}.schema: expected ${SCHEMA_VERSION}`);
  reqStr(raw, 'id', source);
  reqStr(raw, 'name', source);
  reqStr(raw, 'version', source);
  reqStr(raw, 'entry', source);

  if (!Array.isArray(raw?.targets) || raw.targets.length === 0) {
    errors.push(`${source}.targets: at least one target required`);
  } else {
    raw.targets.forEach((t, i) => {
      reqStr(t, 'app', `${source}.targets[${i}]`);
      if(!t||typeof t!=='object'){errors.push(`${source}.targets[${i}]: expected object`);return;}
      if(t.tested!==undefined&&(!Array.isArray(t.tested)||t.tested.some(v=>!validVersion(v))))errors.push(`${source}.targets[${i}].tested: expected exact versions`);
      if (typeof t.versions !== 'string' || !t.versions) {
        errors.push(`${source}.targets[${i}].versions: required (use "*" to allow any)`);
      }
      if(typeof t.versions==='string'&&!validRange(t.versions))errors.push(`${source}.targets[${i}].versions: unsupported range`);
      if (Array.isArray(t.tested) && t.tested.length === 0) {
        warnings.push(`${source}.targets[${i}]: nothing tested yet — treat as experimental`);
      }
    });
  }

  for (const key of TOUCH_KEYS) {
    const value = raw?.touches?.[key];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      errors.push(`${source}.touches.${key}: must be an array of strings`);
    }
  }

  if (raw?.provenance?.redistributes_app_files) {
    warnings.push(`${source}: redistributes app files — check the app's licence before shipping`);
  }
  if (!raw?.provenance?.source) {
    warnings.push(`${source}.provenance.source: unset — record where this mod's inputs came from`);
  }

  return { ok: errors.length === 0, errors, warnings, manifest: raw, source };
}

export function matchesTarget(manifest, appId, appVersion) {
  return (manifest.targets ?? []).some((t) => {
    if (t.app !== '*' && t.app !== appId) return false;
    if (t.versions === '*') return true;
    if (Array.isArray(t.tested) && t.tested.includes(appVersion)) return true;
    return satisfies(appVersion, t.versions);
  });
}

// Deliberately small: "*", exact, ">=x.y.z", "^x.y.z". No dependency needed.
const validVersion=v=>typeof v==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)&&v.split('.').every(n=>Number.isSafeInteger(Number(n)));
const validRange=r=>typeof r==='string'&&(r==='*'||validVersion(r.replace(/^(>=|\^)\s*/,'')));
export function satisfies(version, range) {
  if(!validVersion(version)||!validRange(range))return false;
  if(range==='*')return true;
  if(range.startsWith('>='))return compareVersion(version,range.slice(2).trim())>=0;
  if(range.startsWith('^')){
    const base=range.slice(1).trim(),a=base.split('.').map(Number),b=version.split('.').map(Number);
    const allowed=a[0]>0?b[0]===a[0]:a[1]>0?b[0]===0&&b[1]===a[1]:version===base;
    return allowed&&compareVersion(version,base)>=0;
  }
  return version===range;
}
export function compareVersion(a,b){
 if(!validVersion(a)||!validVersion(b))throw new Error('expected x.y.z versions');
 const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
 for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;
 return 0;
}
export function resolveModEntry(dir,entry){
 const root=realpathSync(dir),file=realpathSync(resolve(root,entry)),rel=relative(root,file);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||!statSync(file).isFile())throw new Error('mod entry escapes directory or is not a file');
 return file;
}

// Two mods conflict when they declare the same touch point, when either names
// the other in conflicts_with, or when both are exclusive.
export function detectConflicts(manifests) {
  const conflicts = [];
  const byTouch = new Map();
  for (const m of manifests) {
    for (const key of TOUCH_KEYS) {
      for (const value of m.touches?.[key] ?? []) {
        const label = `${key}:${value}`;
        if (!byTouch.has(label)) byTouch.set(label, []);
        byTouch.get(label).push(m.id);
      }
    }
  }
  for (const [label, ids] of byTouch) {
    if (ids.length > 1) {
      conflicts.push({ kind: 'touch_overlap', detail: label, mods: ids, severity: 'warning' });
    }
  }
  for (const m of manifests) {
    for (const other of m.conflicts_with ?? []) {
      if (manifests.some((x) => x.id === other)) {
        conflicts.push({ kind: 'declared', detail: `${m.id} conflicts_with ${other}`, mods: [m.id, other], severity: 'error' });
      }
    }
    if (m.exclusive && manifests.length > 1) {
      conflicts.push({ kind: 'exclusive', detail: `${m.id} declares exclusive`, mods: [m.id], severity: 'error' });
    }
  }
  return conflicts;
}
