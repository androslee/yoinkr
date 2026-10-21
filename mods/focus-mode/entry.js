// One behavior, two explicit adapters. No vendor code or generic IPC access.
(function () {
 const adapters=[
  {detect:()=>document.querySelector('[data-app="fixture-a"]'),panels:'.sidebar, .statusbar'},
  {detect:()=>document.querySelector('[data-app="fixture-b"]'),panels:'.navigation, .footer'}
 ];
 function install(adapter){
  let active=false;const original=new Map();
  const apply=()=>{for(const node of document.querySelectorAll(adapter.panels)){
   if(!original.has(node))original.set(node,{value:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display')});
   node.style.setProperty('display','none','important');node.setAttribute('data-yoinkr-focus-hidden','');
  }};
  const restore=()=>{for(const [node,style] of original){if(style.value)node.style.setProperty('display',style.value,style.priority);else node.style.removeProperty('display');node.removeAttribute('data-yoinkr-focus-hidden');}original.clear();};
  const observer=new MutationObserver(()=>{if(active)apply();});
  const toggle=()=>{active=!active;if(active){apply();observer.observe(document.body,{childList:true,subtree:true});}else{observer.disconnect();restore();}return active;};
  const key=e=>{if(e.altKey&&e.shiftKey&&e.code==='KeyF'){e.preventDefault();toggle();}};
  addEventListener('keydown',key);
  window.__modkitFocus={toggle,get active(){return active;},dispose(){observer.disconnect();removeEventListener('keydown',key);active=false;restore();delete window.__modkitFocus;}};
 }
 const start=()=>{const adapter=adapters.find(a=>a.detect());if(adapter)install(adapter);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
