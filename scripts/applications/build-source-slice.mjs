import {buildSourceSlice} from '../../src/feature-slices.js';
const [id,source,out,...extra]=process.argv.slice(2);if(!out||extra.length)throw Error('Use <element-search|gimp-smoothing> <local source directory> <new output>');
const result=await buildSourceSlice(id,source,out);console.log(JSON.stringify({directory:result.root,id:result.id,digest:result.digest,originalAppAcceptance:result.originalAppAcceptance},null,2));
