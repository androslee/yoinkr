// Firefox host glue; this is not upstream Screenity code.
async function openStudio(){
  const url=browser.runtime.getURL('studio.html');
  const tabs=await browser.tabs.query({});
  const existing=tabs.find(tab=>tab.url===url);
  if(existing){await browser.tabs.update(existing.id,{active:true});await browser.windows.update(existing.windowId,{focused:true});}
  else await browser.tabs.create({url});
}
browser.action.onClicked.addListener(openStudio);
browser.runtime.onInstalled.addListener(openStudio);
