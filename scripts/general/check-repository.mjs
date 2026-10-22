// Audit tracked public files; generated copies and profiles must stay local.
import {execFileSync} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(?:node_modules|\.local|\.local-notes|\.tools|builds|backups|cases|evidence|reports|findings|web-ext-artifacts)(\/|$)/;
const credentials=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/AKIA[0-9A-Z]{16}/];
const problems=[];let bytes=0;
for(const file of files){
 if(forbidden.test(file))problems.push(`Generated/private path tracked: ${file}`);
 if(/(^|\/)\.env(?:\.|$)/.test(file))problems.push(`Environment file tracked: ${file}`);
 const path=join(root,file);let data,info;
 try{info=await lstat(path);data=await readFile(path);}catch(error){if(error.code==='ENOENT'){problems.push(`Tracked file is missing; stage its removal: ${file}`);continue;}throw error;}
 if(info.isSymbolicLink())problems.push(`Review tracked symbolic link: ${file}`);
 bytes+=data.length;
 if(data.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46]))||data.subarray(0,2).toString()==='MZ'||/\.(?:so(?:\.\d+)*|dll|exe|appimage|deb|rpm|msi|dmg|tgz)$/i.test(file))problems.push(`Executable/runtime artifact tracked: ${file}`);
 if(data.length>5*1024*1024)problems.push(`Unexpected file above 5 MiB: ${file}`);
 const text=data.toString('utf8');
 if(credentials.some(pattern=>pattern.test(text)))problems.push(`Credential-like content: ${file}`);
 if(file.endsWith('.md')&&/\/home\/[^\s/]+\//.test(text))problems.push(`Workstation-specific home path in guide: ${file}`);
 if(file==='README.md'||/^examples\/.*\.md$/.test(file)){
  for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
   const target=match[1].split('#')[0];if(!target||/^\w+:/.test(target))continue;
   try{await lstat(resolve(dirname(path),decodeURI(target)));}catch{problems.push(`Broken guide link: ${file} → ${target}`);}
  }
 }
}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}
else console.log(`Public repository audit passed: ${files.length} tracked files, ${bytes} bytes; no generated/private paths, credential patterns, large files or broken example links.`);
