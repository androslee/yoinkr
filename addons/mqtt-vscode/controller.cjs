const mqtt=require('mqtt');
const {createTopicTree,addMessage,formatPayload}=require('./donor-core.cjs');
class Explorer {
 constructor(notify=()=>{}){this.notify=notify;this.client=null;this.root=createTopicTree();this.topics=new Map();this.state='Disconnected';this.generation=0;this.connectionRequest=0;this.timer=null;this.rejected=0;}
 emit(){this.notify(this.snapshot());}
 snapshot(){return{state:this.state,rejected:this.rejected,topics:[...this.topics.values()].map(({bytes,...row})=>row)};}
 receive(topic,bytes,packet={}){
  if(Buffer.byteLength(topic)>1024||topic.split('/').length>64||bytes.length>262144||(!this.topics.has(topic)&&this.topics.size>=1000)){this.rejected++;return;}
  addMessage(this.root,topic,bytes,!!packet.retain);const prior=this.topics.get(topic);this.topics.set(topic,{topic,bytes:Buffer.from(bytes),count:(prior?.count??0)+1,retain:!!packet.retain,qos:packet.qos??0,at:new Date().toISOString(),text:bytes.subarray(0,4096).toString('utf8')});
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.emit();},120);
 }
 async connect({url,username,password,filter='#'}){
  if(typeof url!=='string'||!['mqtt:','mqtts:','ws:','wss:'].includes(new URL(url).protocol))throw Error('Use mqtt://, mqtts://, ws:// or wss://');
  if(typeof filter!=='string'||!filter||filter.length>1024)throw Error('Give a subscription filter');
  const request=++this.connectionRequest;await this.disconnect(false);if(request!==this.connectionRequest)return;const generation=++this.generation;this.state='Connecting';this.emit();
  const client=mqtt.connect(url,{username:username||undefined,password:password||undefined,connectTimeout:8000,reconnectPeriod:2000,clean:true,rejectUnauthorized:true});this.client=client;
  client.on('connect',()=>{if(generation!==this.generation)return;client.subscribe(filter,{qos:0},err=>{if(generation!==this.generation)return;this.state=err?'Subscribe failed: '+err.message:'Connected';this.emit();});});
  client.on('message',(topic,bytes,packet)=>{if(generation===this.generation)this.receive(topic,bytes,packet);});
  client.on('error',err=>{if(generation!==this.generation)return;this.state='Connection error: '+err.message;this.emit();});
  client.on('reconnect',()=>{if(generation===this.generation){this.state='Reconnecting';this.emit();}});
  client.on('close',()=>{if(generation===this.generation){this.state='Disconnected (retrying)';this.emit();}});
 }
 async publish({topic,payload,retain=false,qos=0}){
  if(!this.client?.connected)throw Error('Connect first');if(typeof topic!=='string'||!topic||/[#+\0]/.test(topic)||Buffer.byteLength(topic)>1024)throw Error('Give a concrete publish topic without wildcards');
  if(typeof payload!=='string'||Buffer.byteLength(payload)>262144)throw Error('Payload must be text, up to 256 KiB');if(![0,1,2].includes(qos))throw Error('Invalid QoS');
  await new Promise((resolve,reject)=>this.client.publish(topic,payload,{retain:!!retain,qos},err=>err?reject(err):resolve()));
 }
 inspect(topic,mode='json'){if(!['json','hex','string'].includes(mode))throw Error('Unknown payload mode');const row=this.topics.get(topic);if(!row)return null;return{topic,payload:formatPayload(row.bytes,mode),mode,count:row.count};}
 clear(){this.root.destroy();this.root=createTopicTree();this.topics.clear();this.emit();}
 async disconnect(cancelPending=true){if(cancelPending)this.connectionRequest++;this.generation++;const c=this.client;this.client=null;if(c){await new Promise(resolve=>c.end(true,{},resolve));c.removeAllListeners();}if(this.timer){clearTimeout(this.timer);this.timer=null;}this.state='Disconnected';this.emit();}
 async dispose(){await this.disconnect();this.root.destroy();this.topics.clear();}
}
module.exports={Explorer};
