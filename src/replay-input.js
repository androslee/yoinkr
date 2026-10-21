// Explicit data cases only. Prose/action sequences are never executed or inferred.
export function validateReplay(value){
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['args','expected','expectedError'].includes(k)))throw Error('replay needs args and expected or expectedError');
 if(!Array.isArray(value.args)||value.args.length>32)throw Error('replay args must be an array of up to 32 values');
 if(Object.hasOwn(value,'expected')===Object.hasOwn(value,'expectedError'))throw Error('declare exactly one replay expected value or expectedError');
 const json=(v,depth=0)=>{if(depth>16)throw Error('replay JSON exceeds nesting limit');if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){for(const item of v)json(item,depth+1);return;}if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){for(const item of Object.values(v))json(item,depth+1);return;}throw Error('replay values must be finite JSON data');};
 json(value);
 if(value.expectedError){const e=value.expectedError;if(typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['name','message'].includes(k))||typeof e.name!=='string'||!e.name||e.name.length>100||typeof e.message!=='string'||e.message.length>1000)throw Error('expectedError needs bounded name and message');}
 else if(Object.hasOwn(value,'expectedError'))throw Error('expectedError needs name and message');
 if(Buffer.byteLength(JSON.stringify(value))>16000)throw Error('replay data exceeds 16,000 bytes');return value;
}
