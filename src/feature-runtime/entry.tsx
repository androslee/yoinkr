import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {Provider} from 'react-redux'
import {createStore} from 'redux'
import {ThemeProvider} from '@mui/material/styles'
import {ThemeProvider as LegacyThemeProvider, StylesProvider, createGenerateClassName} from '@mui/styles'
import {themes} from '@donor/app/src/theme'
import {Base64Message} from '@donor/backend/src/Model/Base64Message'
import ValueRenderer from '@donor/app/src/components/Sidebar/ValueRenderer/ValueRenderer'
import ActionButtons from '@donor/app/src/components/Sidebar/ValueRenderer/ActionButtons'
import HistoryDrawer from '@donor/app/src/components/Sidebar/HistoryDrawer'

export const contract = Object.freeze({schema:1,id:'mqtt-raw-diff',payloadBytes:131072,historyMessages:64,requiredCapabilities:['clipboard.writeText']})
let instanceSequence=0
const encoder = new TextEncoder()
function validated(input: any) {
  if (!input || typeof input.topic !== 'string' || input.topic.length > 1024 || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > contract.historyMessages) throw Error('Expected topic and 1–64 messages')
  let bytes=0
  for (const message of input.messages) {
    if (typeof message !== 'string') throw Error('Messages must be strings')
    bytes += encoder.encode(message).length
  }
  if (bytes > contract.payloadBytes) throw Error('Combined payload exceeds 128 KiB; no data was truncated')
  if (input.mode !== undefined && !['raw','diff'].includes(input.mode)) throw Error('Mode must be raw or diff')
  if (input.theme !== undefined && !['light','dark'].includes(input.theme)) throw Error('Theme must be light or dark')
  if (input.selected !== undefined && input.selected !== null && (!Number.isInteger(input.selected) || input.selected < 0 || input.selected >= input.messages.length)) throw Error('Selected history index is out of range')
  return {topic:input.topic,messages:[...input.messages],mode:input.mode ?? 'diff',theme:input.theme ?? 'dark',selected:input.selected ?? null}
}
export function mount(element: HTMLElement, initial: any, capabilities: any) {
  if (!(element instanceof HTMLElement) || element.childNodes.length) throw Error('Mount requires an empty element')
  if (typeof capabilities?.clipboard?.writeText !== 'function') throw Error('Missing required capability: clipboard.writeText')
  let state=validated(initial), disposed=false, copyError=''
  const root=createRoot(element)
  const generateClassName=createGenerateClassName({seed:'mqtt-feature-'+(++instanceSequence)})
  const settings=(mode: string)=>({get:(key: string)=>key === 'valueRendererDisplayMode' ? mode : undefined})
  const store=createStore((s:any={settings:settings(state.mode)},action:any)=>action.type === 'feature/mode' ? {settings:settings(action.value)} : s)
  function assertLive() {if(disposed) throw Error('Feature instance is disposed')}
  function render() {
    const messages=state.messages.map((v:string)=>Base64Message.fromString(v))
    const history={toArray:()=>messages,count:()=>messages.length}
    const current=messages[messages.length-1]
    let type='string';try {JSON.parse(current.toUnicodeString());type='json'} catch {}
    const node={type,path:()=>state.topic,messageHistory:history}
    const theme=state.theme === 'dark' ? themes.darkTheme : themes.lightTheme
    const copy=async()=>{try {await capabilities.clipboard.writeText(current.toUnicodeString());copyError=''} catch(e:any) {copyError=e.message || 'Clipboard failed'} if(!disposed) render()}
    flushSync(()=>root.render(<StylesProvider generateClassName={generateClassName}><ThemeProvider theme={theme}><LegacyThemeProvider theme={theme}><Provider store={store}>
      <section data-feature="mqtt-raw-diff" style={{color:theme.palette.text.primary,background:theme.palette.background.default,padding:16,fontFamily:'Arial, sans-serif'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}><strong data-testid="topic">{state.topic}</strong><ActionButtons/><button onClick={copy}>Copy payload</button></div>
        <p style={{fontSize:12}}>Original MQTT Explorer comparison UI · plain text / JSON only · charts unavailable</p>
        {copyError && <div role="alert">{copyError}</div>}
        <div data-testid="comparison"><ValueRenderer treeNode={node} message={current} compareWith={state.selected === null ? undefined : messages[state.selected]}/></div>
        <HistoryDrawer autoOpen items={messages.map((m:any,i:number)=>({key:String(i),title:`Message ${i+1}`,value:m.toUnicodeString(),selected:state.selected === i})).reverse()} onClick={(row:number)=>{const index=messages.length-1-row;state={...state,selected:state.selected === index ? null : index};render()}}/>
      </section>
    </Provider></LegacyThemeProvider></ThemeProvider></StylesProvider>))
  }
  const unsubscribe=store.subscribe(()=>{state={...state,mode:store.getState().settings.get('valueRendererDisplayMode')};render()})
  render()
  return Object.freeze({
    update(input:any) {assertLive();const next=validated(input);state=next;store.dispatch({type:'feature/mode',value:state.mode})},
    snapshot() {assertLive();return structuredClone({...state,copyError})},
    dispose() {if(disposed)return;disposed=true;unsubscribe();flushSync(()=>root.unmount());element.replaceChildren()},
  })
}
