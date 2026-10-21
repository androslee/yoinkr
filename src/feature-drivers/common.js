import {captureFeatureObservation,formattedMessages} from '../feature-verify.js';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,message,ms=15000){const end=Date.now()+ms;for(;;){if(await fn())return;if(Date.now()>end)throw Error('Acceptance timed out: '+message);await delay(40)}}
export function commonDriver(driver){
 driver.showHistory=async()=>{if(!driver.messages?.length)return;const rows=driver.page.locator('div[tabindex="0"]:has(> div > span > pre)');if(await rows.count()===0)await driver.page.locator('[data-testid="message-history"]').first().click();await until(async()=>await rows.count()===driver.messages.length,'history opened')};
 driver.mode=async value=>{driver.modeValue=value;if(!driver.messages?.length)return;await driver.page.locator('#valueRendererDisplayMode-'+value).click();await until(async()=>await driver.page.locator('#valueRendererDisplayMode-'+value).getAttribute('aria-pressed')==='true','mode selected')};
 driver.history=async(index,messages)=>{await driver.showHistory();const target=messages[index];const rows=driver.page.locator('div[tabindex="0"]:has(> div > span > pre)');for(let i=0;i<await rows.count();i++)if(await rows.nth(i).locator('div > span > pre').last().innerText()===target){await rows.nth(i).click();await delay(40);return}throw Error('Requested history payload missing')};
 driver.selectCode=async()=>{await driver.showHistory();const wrapper=driver.page.locator('div[tabindex="0"]:has(> pre)').first();await wrapper.focus();await wrapper.press('Control+a');};
 driver.observe=async options=>captureFeatureObservation(driver.page,{...options,clipboard:options.clipboard?await driver.clipboard():undefined});
 driver.waitRendered=async()=>{const expected=formattedMessages(driver.messages).at(-1);await until(async()=>{const o=await driver.observe({});return o.blocks[0]?.lines.map(l=>l.text).join('\n')===expected},'current formatted value')};
 return driver;
}
