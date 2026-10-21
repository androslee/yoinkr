// Yoinkr host code. Imports below are exact pinned Screenity originals.
import {fabric} from 'SCREENITY_SOURCE/fabricCompat.js';
import PenTool from 'SCREENITY_SOURCE/modules/PenTool.jsx';
import ArrowTool from 'SCREENITY_SOURCE/modules/ArrowTool.jsx';
import ShapeTool from 'SCREENITY_SOURCE/modules/ShapeTool.jsx';
import TextTool from 'SCREENITY_SOURCE/modules/TextTool.jsx';
import SelectTool from 'SCREENITY_SOURCE/modules/SelectTool.jsx';
import {saveCanvas,undoCanvas,redoCanvas} from 'SCREENITY_SOURCE/modules/History.jsx';

const $=selector=>document.querySelector(selector);
const width=960,height=540;
const canvas=new fabric.Canvas('drawing',{width,height,isDrawingMode:true,selection:false});
const state={current:{canvas,tool:'pen',shape:'rectangle',drawingMode:true,color:$('#color').value,strokeWidth:2,undoStack:[],redoStack:[]}};
function setState(next){state.current=typeof next==='function'?next(state.current):next;if(state.current.undoStack)state.current.undoStack=state.current.undoStack.slice(-60);}
const tools=[PenTool(canvas,state,setState,saveCanvas),ArrowTool(canvas,state,setState,saveCanvas),ShapeTool(canvas,state,setState,saveCanvas),TextTool(canvas,state,setState,saveCanvas),SelectTool(canvas,state,setState)];
saveCanvas(state,setState);
// Original modules call saveCanvas; bound retained history for long sessions.
function save(){saveCanvas(state,setState);state.current.undoStack=state.current.undoStack.slice(-60);}
canvas.on('object:modified',save);
const base=$('#base'),ctx=base.getContext('2d');
const composed=document.createElement('canvas');composed.width=width;composed.height=height;
const output=composed.getContext('2d',{alpha:false});
const capture=$('#capture');
let source=null,sourceMode=null,recorder=null,recordStream=null,recording=false,choosing=false,recordUrl=null,pngUrl=null,stopTimer=null,totalBytes=0,frameTimer=null,disposed=false;
function status(text){$('#status').textContent=text;}
function sync(){
  $('#share').disabled=choosing||recording;$('#demo').disabled=choosing||recording;
  $('#record').disabled=!sourceMode||recording||choosing;
  $('#pause').disabled=!recording;$('#stop').disabled=!recording;
  $('#disconnect').disabled=!sourceMode||recording;
}
function fail(error){console.error(error);status(`${error.name||'Error'}: ${error.message||error}`);sync();}
function tool(name){
  canvas.discardActiveObject();
  state.current={...state.current,tool:name};
  canvas.isDrawingMode=['pen','highlighter'].includes(name);canvas.selection=name==='select';
  for(const object of canvas.getObjects()){object.selectable=name==='select';object.evented=name==='select';}
  for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===name));
  canvas.requestRenderAll();
}
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>tool(button.dataset.tool);
$('#color').oninput=event=>{state.current={...state.current,color:event.target.value};};
$('#width').oninput=event=>{state.current={...state.current,strokeWidth:Number(event.target.value)};};
$('#undo').onclick=()=>undoCanvas(state,setState);
$('#redo').onclick=()=>redoCanvas(state,setState);
$('#clear').onclick=()=>{canvas.clear();save();};
function release(){
  const current=source;source=null;sourceMode=null;
  if(current)for(const track of current.getTracks())track.stop();
  capture.pause();capture.srcObject=null;sync();
}
function demoFrame(time){
  ctx.fillStyle='#17223b';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#c5b5ff';ctx.font='bold 42px system-ui';ctx.fillText('A little motion. A clear explanation.',48,100);
  ctx.fillStyle='#e1e8fa';ctx.font='22px system-ui';ctx.fillText('Draw an arrow, add a note, and record your walkthrough.',48,150);
  for(let index=0;index<5;index++){
    ctx.fillStyle=['#9a86df','#65c8b9','#eab874','#82a7ec','#d78aab'][index];
    ctx.beginPath();ctx.arc(100+index*185,320+Math.sin(time/650+index)*48,32,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#a6b4d1';ctx.font='18px system-ui';ctx.fillText('Synthetic demo • no screen, camera or microphone access',48,490);
}
function render(){
  if(disposed)return;
  if(sourceMode==='demo')demoFrame(performance.now());
  else if(sourceMode==='display'&&capture.readyState>=2){
    ctx.fillStyle='#10141e';ctx.fillRect(0,0,width,height);
    const scale=Math.min(width/capture.videoWidth,height/capture.videoHeight);
    const w=capture.videoWidth*scale,h=capture.videoHeight*scale;
    ctx.drawImage(capture,(width-w)/2,(height-h)/2,w,h);
  }else if(!sourceMode){ctx.fillStyle='#17223b';ctx.fillRect(0,0,width,height);ctx.fillStyle='#c4cee4';ctx.font='26px system-ui';ctx.fillText('Choose a screen or try the animated demo.',48,270);}
  // Record the underlying pixels plus original Fabric drawing output, never UI controls.
  output.drawImage(base,0,0);output.drawImage(canvas.lowerCanvasEl,0,0,width,height);
  frameTimer=setTimeout(render,1000/30);
}
$('#demo').onclick=()=>{release();sourceMode='demo';status('Animated demo ready. Add annotations, then Record.');sync();};
$('#share').onclick=async()=>{
  if(choosing||recording)return;
  choosing=true;sync();
  try{
    // Must be called from the real click gesture. Firefox owns source selection and consent.
    const selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:false});
    release();source=selected;capture.srcObject=selected;await capture.play();sourceMode='display';
    selected.getVideoTracks()[0].addEventListener('ended',()=>{if(source!==selected)return;if(recording)stop();release();status('Screen sharing ended. Any completed recording remains available below.');},{once:true});
    status('Screen ready. Annotations are drawn on this preview and included in the export.');
  }catch(error){release();fail(error);}
  finally{choosing=false;sync();}
};
$('#disconnect').onclick=()=>{release();status('Screen released. No capture is running.');};
function stop(){if(recorder&&recorder.state!=='inactive')recorder.stop();clearTimeout(stopTimer);}
$('#record').onclick=()=>{
  if(recording||!sourceMode)return;
  try{
    const mimeType=['video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mimeType)throw new Error('This Firefox build cannot record WebM.');
    recordStream=composed.captureStream(30);
    recorder=new MediaRecorder(recordStream,{mimeType,videoBitsPerSecond:4000000});
    const chunks=[];totalBytes=0;
    recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);totalBytes+=event.data.size;if(totalBytes>128*1024*1024){status('Recording stopped at the 128 MiB memory limit.');stop();}}};
    recorder.onerror=event=>{fail(event.error);stop();};
    recorder.onstop=()=>{
      clearTimeout(stopTimer);for(const track of recordStream?.getTracks()||[])track.stop();recordStream=null;recording=false;
      if(recordUrl)URL.revokeObjectURL(recordUrl);
      const blob=new Blob(chunks,{type:mimeType});recordUrl=URL.createObjectURL(blob);
      $('#playback').src=recordUrl;$('#playback').hidden=false;
      $('#download').href=recordUrl;$('#download').hidden=false;
      $('#pause').textContent='Pause';status(`Recording ready (${Math.round(blob.size/1024)} KiB). Save it before closing this tab.`);sync();
    };
    recorder.start(1000);recording=true;status('Recording locally • no audio • maximum 5 minutes / 128 MiB.');sync();
    stopTimer=setTimeout(stop,5*60*1000);
  }catch(error){for(const track of recordStream?.getTracks()||[])track.stop();recordStream=null;fail(error);}
};
$('#pause').onclick=()=>{if(!recorder)return;if(recorder.state==='recording'){recorder.pause();$('#pause').textContent='Resume';status('Recording paused.');}else if(recorder.state==='paused'){recorder.resume();$('#pause').textContent='Pause';status('Recording resumed.');}};
$('#stop').onclick=stop;
$('#snapshot').onclick=()=>{composed.toBlob(blob=>{if(!blob)return;if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(blob);const link=document.createElement('a');link.href=pngUrl;link.download='screenity-firefox.png';link.click();});};
window.addEventListener('beforeunload',event=>{if(recording){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(frameTimer);clearTimeout(stopTimer);if(recorder)recorder.onstop=null;stop();release();for(const track of recordStream?.getTracks()||[])track.stop();if(recordUrl)URL.revokeObjectURL(recordUrl);if(pngUrl)URL.revokeObjectURL(pngUrl);for(const item of tools)item?.removeEventListeners();canvas.dispose();});
sync();render();
