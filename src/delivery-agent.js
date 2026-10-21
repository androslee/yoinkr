import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {loadDeliveryConfig,checkDelivery,exportDeliveryBundle,importDeliveryBundle,inspectDeliveryBundle,runDelivery,deliveryStatus,rollbackDelivery} from './delivery.js';
/** Registered configuration only: tool clients cannot select filesystem paths. */
export async function registerDeliveryTools({file,add,submit,newPath}){
 if(!file)return;const loaded=await loadDeliveryConfig(file),runs=new Map(),bundles=new Map([['reference',loaded.config.bundle]]);
 const key=z.string().regex(/^[A-Za-z0-9-]{1,80}$/),object=s=>z.object(s).strict();
 const pinned=async()=>{if((await loadDeliveryConfig(file)).sha256!==loaded.sha256)throw Error('Registered delivery config changed; review it and restart the client');};
 const runPath=id=>{const path=runs.get(id);if(!path)throw Error('Unknown session delivery run ID');return path;};
 const bundlePath=id=>{const path=bundles.get(id);if(!path)throw Error('Unknown session bundle ID');return path;};
 add('yoinkr_delivery_check','Check prerequisites for the registered portable delivery, without launching applications.',object({}),async()=>{await pinned();return checkDelivery(file);});
 add('yoinkr_delivery_inspect','Inspect a registered recipe-only bundle and integrity metadata.',object({bundleId:key.default('reference')}),async({bundleId})=>inspectDeliveryBundle(bundlePath(bundleId)));
 add('yoinkr_delivery_status','List this session’s runs, or inspect one run’s recorded acceptance and current package/adapter integrity.',object({runId:key.optional()}),async({runId})=>runId?deliveryStatus(runPath(runId)):{runs:[...runs.keys()],bundles:[...bundles.keys()]});
 add('yoinkr_delivery_export','Export public recipes only to a fresh agent-owned directory. No donor code, application binaries or profiles.',object({}),async()=>submit('yoinkr_delivery_export',{},async()=>{const path=newPath('public-recipes'),result=await exportDeliveryBundle(path),id='bundle-'+randomUUID();bundles.set(id,path);return {bundleId:id,...result};}),{write:true});
 add('yoinkr_delivery_import','Round-trip a registered bundle into a fresh agent-owned directory, checking every byte.',object({bundleId:key.default('reference')}),async args=>submit('yoinkr_delivery_import',args,async()=>{const path=newPath('imported-recipes'),result=await importDeliveryBundle(bundlePath(args.bundleId),path),id='bundle-'+randomUUID();bundles.set(id,path);return {bundleId:id,...result};}),{write:true});
 add('yoinkr_delivery_run','Build both fresh lab recipients and run original-donor/minimal/recipient native acceptance. Executes supplied application code with ordinary user permissions.',object({}),async()=>{await pinned();return submit('yoinkr_delivery_run',{},async()=>{const result=await runDelivery(file);runs.set(result.id,result.directory);return {runId:result.id,...result};});},{write:true,execution:true});
 add('yoinkr_delivery_rollback','Preflight and restore both lab copies for a session run. Refuses drift; original installations remain untouched.',object({runId:key}),async args=>submit('yoinkr_delivery_rollback',args,()=>rollbackDelivery(runPath(args.runId))),{write:true,execution:true});
}
