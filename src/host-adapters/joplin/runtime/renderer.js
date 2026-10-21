import {mount} from './feature/payload/feature.js';
const host=window.modkitComparison,root=document.querySelector('#feature'),status=document.querySelector('#status'),sources=document.querySelector('#sources');
let instance,unsubscribe,timer,closed=false;
function show(record){
 if(closed)return;const s=record.state,baseline=s.baseline?.text??'',messages=s.current?[baseline,s.current.text]:[baseline];
 const label=s.current?.uri??s.baseline?.uri??'Select text in Joplin';const selected=s.selected!==null&&s.selected<messages.length?s.selected:null;
 const input={topic:label.slice(-1000),messages,mode:s.mode,theme:s.theme,selected};
 if(instance)instance.update(input);else instance=mount(root,input,{clipboard:{writeText:text=>host.request({type:'copy',text})}});
 document.body.style.background=s.theme==='dark'?'#171b22':'#fafafa';document.body.style.color=s.theme==='dark'?'#e2e8ef':'#18212b';
 status.textContent=record.error||(!s.baseline?'No baseline yet. Select text in the editor and capture it.':!s.current?'Baseline captured. Select new text in Joplin, then compare.':'Comparing actual Joplin note selections.');
 sources.textContent='Baseline: '+(s.baseline?.uri??'none')+' · Current: '+(s.current?.uri??'none');
}
async function action(message){try{show(await host.request(message))}catch(e){status.textContent=e.message}}
for(const [id,kind] of [['capture-baseline','baseline'],['capture-current','current']])document.querySelector('#'+id).addEventListener('click',()=>action({type:'capture',kind}));
document.querySelector('#reset').addEventListener('click',()=>action({type:'reset'}));
function remember(){clearTimeout(timer);timer=setTimeout(()=>{if(!instance||closed)return;const s=instance.snapshot();host.request({type:'preferences',mode:s.mode,selected:s.selected}).catch(e=>status.textContent=e.message)},30);}
root.addEventListener('click',remember,true);root.addEventListener('keyup',remember,true);
unsubscribe=host.onState(show);host.request({type:'ready'}).then(show).catch(e=>status.textContent=e.message);
window.addEventListener('beforeunload',()=>{closed=true;clearTimeout(timer);unsubscribe?.();root.removeEventListener('click',remember,true);root.removeEventListener('keyup',remember,true);instance?.dispose();instance=null;},{once:true});
