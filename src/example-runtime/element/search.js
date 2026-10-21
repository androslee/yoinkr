// New host/controller code around Element's unchanged highlighting algorithm.
import {BaseHighlighter} from './highlighter.js';
class TokenHighlighter extends BaseHighlighter {
 processSnippet(text,match){return {text,match};}
}
export function queryTerms(query){
 if(typeof query!=='string'||query.length>256)throw Error('Search is limited to 256 characters');
 const terms=[...new Set(query.trim().split(/\s+/u).filter(Boolean))];
 if(terms.length>12||terms.some(t=>t.length>64))throw Error('Use up to 12 terms, each at most 64 characters');
 return terms.sort((a,b)=>b.length-a.length);
}
export function highlightText(text,query){
 if(typeof text!=='string'||text.length>4000)throw Error('Message text limit');
 const terms=queryTerms(query);return terms.length?new TokenHighlighter('match').applyHighlights(text,terms):[{text,match:false}];
}
export function parseTranscript(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>2*1024*1024)throw Error('Transcript exceeds 2 MiB');
 const data=JSON.parse(raw);if(!Array.isArray(data)||data.length>2000)throw Error('Expected an array of up to 2,000 messages');
 return data.map((m,i)=>{if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['id','room','sender','text'].includes(k)))throw Error('Invalid message '+i);for(const k of ['id','room','sender','text'])if(typeof m[k]!=='string'||!m[k]||m[k].length>(k==='text'?4000:128))throw Error('Invalid '+k+' in message '+i);return {id:m.id,room:m.room,sender:m.sender,text:m.text};});
}
export function searchTranscript(messages,query,room=''){
 const terms=queryTerms(query);return messages.filter(m=>(!room||m.room===room)&&terms.every(t=>(m.sender+' '+m.text).toLowerCase().includes(t.toLowerCase()))).map(m=>({...m,tokens:highlightText(m.text,query)}));
}
