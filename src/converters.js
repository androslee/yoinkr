// Fixed-format, deterministic transformations. No donor code, hooks, or URLs are executed.
import { posix } from 'node:path';
import { safeRelative } from './research.js';
export const converterVersion = '1.0.0';
export const converterKinds = ['vscode-theme-css', 'vscode-snippets-json'];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function parseJSONC(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024) throw Error('JSONC exceeds 4 MiB');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let clean = '',
    string = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      next = text[i + 1];
    if (string) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') string = false;
      continue;
    }
    if (c === '"') {
      string = true;
      clean += c;
    } else if (c === '/' && next === '/') {
      clean += '  ';
      i++;
      while (i + 1 < text.length && !['\n', '\r'].includes(text[i + 1])) {
        clean += ' ';
        i++;
      }
    } else if (c === '/' && next === '*') {
      clean += '  ';
      i++;
      let closed = false;
      while (i + 1 < text.length) {
        i++;
        if (text[i] === '*' && text[i + 1] === '/') {
          clean += '  ';
          i++;
          closed = true;
          break;
        }
        clean += ['\n', '\r'].includes(text[i]) ? text[i] : ' ';
      }
      if (!closed) throw Error('unterminated JSONC comment');
    } else clean += c;
  }
  // Ignore trailing commas only outside strings; JSON.parse remains the grammar validator.
  let result = '';
  string = false;
  escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (string) {
      result += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') string = false;
    } else if (c === '"') {
      string = true;
      result += c;
    } else if (c === ',') {
      let j = i + 1;
      while (/\s/.test(clean[j] ?? '') && j < clean.length) j++;
      result += ['}', ']'].includes(clean[j]) ? ' ' : c;
    } else result += c;
  }
  return JSON.parse(result);
}
export const themeMapping = {
  'editor.background': ['--mk-background', '#171b22'],
  'editor.foreground': ['--mk-foreground', '#d7e0ee'],
  'sideBar.background': ['--mk-panel', '#202735'],
  'button.background': ['--mk-accent', '#376fc3'],
  'button.foreground': ['--mk-accent-text', '#ffffff'],
  focusBorder: ['--mk-border', '#598bd1'],
  'input.background': ['--mk-input', '#151b25']
};
function theme(input, inputs) {
  const dependencies = [],
    stack = new Set(),
    origins = new Map();
  const load = (name, depth) => {
    if (depth > 8) throw Error('theme include depth exceeds 8');
    if (stack.has(name)) throw Error('theme include cycle');
    const text = inputs.get(name);
    if (text === undefined) throw Error('theme dependency is not pinned: ' + name);
    stack.add(name);
    const data = parseJSONC(text);
    if (!object(data)) throw Error('theme must be an object');
    let colors = Object.create(null);
    if (data.include !== undefined) {
      if (
        typeof data.include !== 'string' ||
        data.include.includes('\\') ||
        data.include.includes(':') ||
        posix.isAbsolute(data.include)
      )
        throw Error('invalid theme include');
      const child = posix.normalize(posix.join(posix.dirname(name), data.include));
      safeRelative(child);
      colors = load(child, depth + 1);
    }
    if (data.colors !== undefined && !object(data.colors)) throw Error('theme colors must be an object');
    const entries = Object.entries(data.colors ?? {});
    if (entries.length > 4096) throw Error('theme exceeds 4096 color tokens');
    for (const [k, v] of entries) {
      if (k.length > 200) throw Error('color key too long');
      colors[k] = v;
      origins.set(k, name);
    }
    stack.delete(name);
    if (!dependencies.includes(name)) dependencies.push(name);
    return colors;
  };
  const colors = load(input, 0),
    mapped = [],
    fallbacks = [],
    lines = [];
  for (const [key, [variable, fallback]] of Object.entries(themeMapping)) {
    const value = Object.hasOwn(colors, key) ? colors[key] : fallback;
    if (typeof value !== 'string' || !/^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value))
      throw Error('unsupported color value: ' + key);
    if (!Object.hasOwn(colors, key)) fallbacks.push(key);
    mapped.push({ key, variable, value, source: origins.get(key) ?? null });
    lines.push('  ' + variable + ': ' + value.toLowerCase() + ';');
  }
  return {
    bytes: Buffer.from(':root {\n' + lines.join('\n') + '\n}\n'),
    mediaType: 'text/css',
    dependencies,
    details: {
      mapped,
      fallbacks,
      unmappedKeys: Object.keys(colors)
        .filter(k => !Object.hasOwn(themeMapping, k))
        .sort(),
      omitted: ['TextMate token rules', 'semantic token rules', 'non-mapped workbench tokens'],
      scope: 'Seven recipient CSS variables, not a full VS Code theme engine'
    }
  };
}
function snippets(input, inputs) {
  const data = parseJSONC(inputs.get(input));
  if (!object(data) || Object.keys(data).length > 512)
    throw Error('snippets must be an object with at most 512 entries');
  const rows = [],
    ignored = [];
  const text = (v, name, max = 262144) => {
    if (typeof v !== 'string' || v.length > max) throw Error('invalid snippet ' + name);
    return v;
  };
  for (const name of Object.keys(data).sort()) {
    text(name, 'name', 200);
    const s = data[name];
    if (!object(s)) throw Error('snippet entry must be an object');
    const prefixes = Array.isArray(s.prefix) ? s.prefix : [s.prefix];
    if (!prefixes.length || prefixes.length > 32) throw Error('snippet needs 1–32 prefixes');
    for (const p of prefixes) if (!text(p, 'prefix', 200)) throw Error('empty snippet prefix');
    const body = Array.isArray(s.body) ? s.body.map(v => text(v, 'body')).join('\n') : text(s.body, 'body');
    text(body, 'body');
    const description =
      s.description === undefined
        ? ''
        : Array.isArray(s.description)
          ? s.description.map(v => text(v, 'description', 4000)).join('\n')
          : text(s.description, 'description', 4000);
    text(description, 'description', 4000);
    if (s.scope !== undefined) text(s.scope, 'scope', 400);
    if (s.isFileTemplate !== undefined && typeof s.isFileTemplate !== 'boolean')
      throw Error('invalid file template flag');
    rows.push({
      name,
      prefixes: [...new Set(prefixes)],
      body,
      description,
      scope: s.scope ?? '',
      fileTemplate: s.isFileTemplate ?? false
    });
    for (const field of Object.keys(s))
      if (!['prefix', 'body', 'description', 'scope', 'isFileTemplate'].includes(field)) ignored.push({ name, field });
  }
  return {
    bytes: Buffer.from(JSON.stringify({ schema: 1, format: 'modkit-snippets', snippets: rows }, null, 2) + '\n'),
    mediaType: 'application/json',
    dependencies: [input],
    details: {
      count: rows.length,
      ignoredFields: ignored,
      scope: 'Portable literal templates; placeholders and variables are preserved, not evaluated or expanded'
    }
  };
}
export function convertAsset(kind, input, inputs) {
  safeRelative(input);
  if (!inputs.has(input)) throw Error('input is not pinned: ' + input);
  if (kind === 'vscode-theme-css') return theme(input, inputs);
  if (kind === 'vscode-snippets-json') return snippets(input, inputs);
  throw Error('unsupported converter: ' + kind);
}
