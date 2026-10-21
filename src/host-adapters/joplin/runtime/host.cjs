// Installed in the pinned app's existing startup task. No plugin API or test-only input path.
exports.install=({ipcRenderer,store,commands,Setting})=>{
 const theme=()=>Number(Setting.value('theme'))===1?'light':'dark';
 const notify=()=>ipcRenderer.send('joplin:modkit:theme',{theme:theme()});let last=theme();
 const unsubscribe=store.subscribe(()=>{const value=theme();if(value!==last){last=value;notify()}});
 const capture=async(_event,message)=>{try{let text;try{text=await commands.execute('selectedText')}catch{}const active=document.activeElement;if(!text&&Setting.value('isSafeMode')&&active?.tagName==='TEXTAREA')text=active.value.slice(active.selectionStart,active.selectionEnd);if(typeof text!=='string'||!text)throw Error('Select text in the Joplin note editor first');if(Buffer.byteLength(text,'utf8')>131072)throw Error('Selection exceeds 128 KiB');const state=store.getState(),id=state.selectedNoteIds?.[0]??'note';ipcRenderer.send('joplin:modkit:selection',{requestId:message.requestId,value:{text,uri:'joplin://note/'+id,language:'markdown'},theme:theme()})}catch(e){ipcRenderer.send('joplin:modkit:selection',{requestId:message.requestId,error:String(e.message).slice(0,500)})}};
 const setTheme=(_event,value)=>{if(!['light','dark'].includes(value))return;Setting.setValue('themeAutoDetect',false);Setting.setValue('theme',value==='light'?1:2);notify()};
 ipcRenderer.on('joplin:modkit:capture',capture);ipcRenderer.on('joplin:modkit:theme-set',setTheme);notify();
 window.addEventListener('beforeunload',()=>{unsubscribe();ipcRenderer.removeListener('joplin:modkit:capture',capture);ipcRenderer.removeListener('joplin:modkit:theme-set',setTheme)},{once:true});
};
