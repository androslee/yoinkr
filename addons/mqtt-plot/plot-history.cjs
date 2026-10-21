// New host storage; conversion itself is compiled from the unchanged donor util.tsx.
class PlotHistory{
 constructor({points=240,topics=1000,convert}={}){if(!Number.isInteger(points)||points<2||points>240||!Number.isInteger(topics)||topics<1||topics>1000)throw Error('Invalid plot bounds');this.convert=convert??require('./donor-plot.cjs').toPlottableValue;if(typeof this.convert!=='function')throw Error('Numeric converter required');this.limit=points;this.topicLimit=topics;this.topics=new Map();}
 add(topic,text,time=Date.now()){
  if(typeof topic!=='string'||typeof text!=='string'||Buffer.byteLength(text)>262144||!Number.isFinite(time))return false;
  const value=this.convert(text);if(!Number.isFinite(value))return false;
  let ring=this.topics.get(topic);if(!ring){if(this.topics.size>=this.topicLimit)return false;ring={values:new Array(this.limit),next:0,size:0,received:0};this.topics.set(topic,ring);}
  ring.values[ring.next]={time,value};ring.next=(ring.next+1)%this.limit;ring.size=Math.min(this.limit,ring.size+1);ring.received++;return true;
 }
 series(topic){const ring=this.topics.get(topic);if(!ring)return {points:[],received:0,limit:this.limit};const start=(ring.next-ring.size+this.limit)%this.limit;return {points:Array.from({length:ring.size},(_,i)=>({...ring.values[(start+i)%this.limit]})),received:ring.received,limit:this.limit};}
 clear(topic){if(topic===undefined)this.topics.clear();else this.topics.delete(topic);}
}
module.exports={PlotHistory};
