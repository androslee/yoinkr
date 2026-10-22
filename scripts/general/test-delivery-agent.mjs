// Official MCP stdio client against the real registered delivery tools; no DSH.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {saveJson,sha256} from '../../src/workspace.js';
const flags={};for(let i=2;i<process.argv.length;i+=2){if(!['--config','--out'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --config <delivery.local.json> --out <new proof>');flags[process.argv[i].slice(2)]=resolve(process.argv[i+1]);}assert.ok(flags.config&&flags.out);await mkdir(flags.out,{mode:0o700});
const config=join(flags.out,'agent.json');await writeFile(config,JSON.stringify({schema:1,deliveryConfig:flags.config,outputRoot:'agent-output',allowWrites:true,allowExecution:true}));const original=await readFile(config),checks=[];let client;
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);};
const complete=async job=>{for(let i=0;i<1000;i++){const j=await call('yoinkr_job',{jobId:job.id});if(j.status!=='running'){assert.equal(j.status,'succeeded',j.error);let raw='',offset=0,last;do{last=await call('yoinkr_result',{jobId:job.id,offset});raw+=last.text;offset=last.nextOffset;}while(offset!==null);assert.equal(sha256(raw),last.sha256);return JSON.parse(raw);}await new Promise(r=>setTimeout(r,10));}throw Error('MCP delivery deadline');};
try{
 client=new Client({name:'yoinkr-delivery-acceptance',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../../src/cli.js',import.meta.url)),'mcp','--config',config],stderr:'pipe'}));
 const listed=await client.listTools();for(const name of ['check','inspect','status','export','import','run','rollback'])assert.ok(listed.tools.some(t=>t.name==='yoinkr_delivery_'+name));checks.push('Official MCP client discovers all seven delivery operations');
 assert.equal((await call('yoinkr_delivery_check')).status,'ready');checks.push('Registered delivery prerequisite check returns ready through stdio');
 const inspected=await call('yoinkr_delivery_inspect');assert.equal(inspected.status,'integrity-verified');checks.push('Registered recipe integrity can be inspected without paths from the client');
 const exported=await complete(await call('yoinkr_delivery_export')),imported=await complete(await call('yoinkr_delivery_import',{bundleId:exported.bundleId}));assert.equal(exported.digest,imported.digest);checks.push('Export/import jobs preserve digest through paged results');
 const rejected=await client.callTool({name:'yoinkr_delivery_inspect',arguments:{bundleId:'../../private'}});assert.ok(rejected.isError);checks.push('Unregistered/path-traversal bundle ID is refused');
 assert.deepEqual(await readFile(config),original);checks.push('No agent configuration is changed by delivery operations');
 await saveJson(join(flags.out,'RESULT.json'),{schema:1,status:'passed',checks,checksPassed:checks.length,scope:'Real stdio transport and registered delivery tools. Native execution is verified separately through the shared CLI/workbench implementation.'});console.log(JSON.stringify({status:'passed',checks},null,2));
}finally{await client?.close();}
