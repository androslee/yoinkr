import {serveFeaturePackage} from '../feature-package.js';import {commonDriver,until} from './common.js';
export async function minimalFeatureDriver({featurePackage,playwright}){
 const preview=await serveFeaturePackage(featurePackage);let browser;try{browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--js-flags=--expose-gc']});const page=await browser.newPage({viewport:{width:1100,height:800},permissions:['clipboard-read','clipboard-write']});await page.goto(preview.url);await page.locator('[data-feature]').waitFor();
 const d=commonDriver({page,messages:[],modeValue:'diff',themeValue:'light',protectedRoots:[featurePackage],identity:{id:'minimal-host-v1',version:1,featureDigest:preview.verified.digest,selectorsVersion:1},clipboard:()=>page.evaluate(()=>navigator.clipboard.readText()),close:async()=>{try{await browser.close();}finally{await preview.close();}}});
 const update=()=>page.evaluate(s=>window.instance.update(s),{topic:d.topic??'empty',messages:d.messages.length?d.messages:[''],mode:d.modeValue,theme:d.themeValue});
 d.input=async(topic,messages)=>{const wanted=d.modeValue;d.topic=topic;d.messages=messages;await update();await d.mode('raw');await d.waitRendered();await d.mode(wanted)};const mode=d.mode;d.mode=async value=>{d.desiredMode=value;return mode(value)};
 d.clear=async()=>{d.messages=[];await update()};d.copy=async()=>{await page.evaluate(()=>navigator.clipboard.writeText('YOINKR-COPY-SENTINEL'));await page.getByRole('button',{name:'Copy payload',exact:true}).click();await until(async()=>await d.clipboard()===d.messages.at(-1),'minimal clipboard')};d.theme=async value=>{d.themeValue=value;await update()};d.resize=(width,height)=>page.setViewportSize({width,height});
 return d;
 }catch(error){try{await browser?.close();}finally{await preview.close();}throw error;}
}
