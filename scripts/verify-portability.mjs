#!/usr/bin/env node
import {verifyPortability} from '../src/portability.js';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out'||!args[1])throw Error('Use --out <new directory outside the checkout>; platform is measured, never supplied as an argument');
const result=await verifyPortability(args[1]);console.log(JSON.stringify(result,null,2));if(result.status!=='passed')process.exitCode=1;
