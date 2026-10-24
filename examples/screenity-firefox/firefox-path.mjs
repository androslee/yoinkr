import {join} from 'node:path';

// Where the Firefox executable lives inside an application directory.
// macOS ships Firefox as an .app bundle with the executable in Contents/MacOS.
export function firefoxExecutable(directory){
  if(process.platform==='win32')return join(directory,'firefox.exe');
  if(process.platform==='darwin'&&directory.endsWith('.app'))return join(directory,'Contents','MacOS','firefox');
  return join(directory,'firefox');
}

// The lab's portable copy: .local/firefox/ on Linux/Windows, .local/firefox/Firefox.app on macOS.
export function portableFirefoxDirectory(local){
  return process.platform==='darwin'?join(local,'firefox','Firefox.app'):join(local,'firefox');
}
