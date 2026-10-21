const vscode=require('vscode');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {Explorer}=require('./controller.cjs');
function activate(context){
 let panel=null,explorer=null;const output=vscode.window.createOutputChannel('Yoinkr MQTT Explorer');context.subscriptions.push(output);
 const open=()=>{
  if(panel){panel.reveal();return explorer;}
  panel=vscode.window.createWebviewPanel('modkitMqtt','MQTT Explorer',vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[vscode.Uri.file(context.extensionPath)],retainContextWhenHidden:true});
  const nonce=crypto.randomBytes(16).toString('hex');const uri=name=>panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath,name))).toString();
  panel.webview.html=fs.readFileSync(path.join(context.extensionPath,'panel.html'),'utf8').replaceAll('{{CSP}}',panel.webview.cspSource).replaceAll('{{NONCE}}',nonce).replaceAll('{{SCRIPT}}',uri('panel.js')).replaceAll('{{STYLE}}',uri('panel.css'));
  explorer=new Explorer(snapshot=>{panel?.webview.postMessage({type:'snapshot',snapshot});});
  panel.webview.onDidReceiveMessage(async m=>{try{
   if(!m||typeof m!=='object')return;
   if(m.type==='connect')await explorer.connect(m.connection);
   else if(m.type==='disconnect')await explorer.disconnect();else if(m.type==='clear')explorer.clear();
   else if(m.type==='publish')await explorer.publish(m.message);
   else if(m.type==='inspect')panel?.webview.postMessage({type:'detail',detail:explorer.inspect(m.topic,m.mode)});
   else if(m.type==='ready')explorer.emit();
  }catch(e){panel?.webview.postMessage({type:'error',message:e.message});output.appendLine(e.message);}});
  panel.onDidDispose(()=>{const old=explorer;panel=null;explorer=null;old?.dispose();});return explorer;
 };
 context.subscriptions.push(vscode.commands.registerCommand('yoinkr.mqtt.open',open));
 context.subscriptions.push({dispose(){panel?.dispose();explorer?.dispose();}});
 return{open,get explorer(){return explorer;}};
}
module.exports={activate};
