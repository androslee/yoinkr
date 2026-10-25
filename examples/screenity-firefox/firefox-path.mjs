import {join,dirname,resolve} from 'node:path';
import {stat,mkdir,cp} from 'node:fs/promises';

// Where the Firefox executable lives inside an application directory.
// macOS ships Firefox as an .app bundle with the executable in Contents/MacOS.
export function firefoxExecutable(directory,platform=process.platform){
  if(platform==='win32')return join(directory,'firefox.exe');
  if(platform==='darwin'&&directory.endsWith('.app'))return join(directory,'Contents','MacOS','firefox');
  return join(directory,'firefox');
}

// The lab's portable copy: .local/firefox/ on Linux/Windows, .local/firefox/Firefox.app on macOS.
export function portableFirefoxDirectory(local,platform=process.platform){
  return platform==='darwin'?join(local,'firefox','Firefox.app'):join(local,'firefox');
}

export async function preparePortableFirefox(supplied,local,platform=process.platform){
  const source=resolve(supplied);
  if(!(await stat(source)).isDirectory())throw new Error('Supply an extracted Firefox directory, not an installer.');
  if(platform==='darwin'&&!source.endsWith('.app'))throw new Error('On macOS, supply the full Firefox.app bundle.');
  if(!(await stat(firefoxExecutable(source,platform))).isFile())throw new Error('Firefox executable is not a file.');
  const destination=portableFirefoxDirectory(local,platform);
  try{
    await stat(destination);
    if(!(await stat(firefoxExecutable(destination,platform))).isFile())throw new Error('Existing portable Firefox is incomplete.');
    return {directory:destination,copied:false};
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    // An existing incomplete copy must not be overwritten.
    try{await stat(destination);throw new Error('Existing portable Firefox is incomplete; remove that generated copy before retrying.');}
    catch(existing){if(existing.code!=='ENOENT')throw existing;}
  }
  await mkdir(dirname(destination),{recursive:true});
  await cp(source,destination,platform==='darwin'?{recursive:true,verbatimSymlinks:true}:{recursive:true,dereference:true});
  return {directory:destination,copied:true};
}
