// This wrapper is original host glue. Imports are resolved to recovered donor files by the builder.
import {TreeNode} from 'MQTT_DONOR/backend/src/Model/TreeNode';
import {TreeNodeFactory} from 'MQTT_DONOR/backend/src/Model/TreeNodeFactory';
import {Base64Message} from 'MQTT_DONOR/backend/src/Model/Base64Message';
export {Base64Message};
export function createTopicTree(){const root=new TreeNode();root.isTree=true;root.edges=Object.create(null);return root;}
export function addMessage(root:any,topic:string,payload:Buffer,retain=false){
 const node=TreeNodeFactory.fromMessage({topic,payload:{base64Message:payload.toString('base64')},retain,qos:0});const first=node.firstNode();const normalize=(n:any)=>{n.edges=Object.assign(Object.create(null),Object.fromEntries(n.edgeArray.map((e:any)=>[e.name,e])));n.edgeArray.forEach((e:any)=>normalize(e.target));};normalize(first);root.updateWithNode(first);return root.findNode(topic);
}
export function formatPayload(payload:Buffer,type:'string'|'json'|'hex'){return Base64Message.fromBuffer(payload).format(type)[0];}
