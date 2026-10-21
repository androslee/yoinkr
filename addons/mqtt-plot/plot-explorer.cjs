const {Explorer:BaseExplorer}=require('./controller.cjs');const {PlotHistory}=require('./plot-history.cjs');
class Explorer extends BaseExplorer{
 constructor(notify){super(notify);this.plots=new PlotHistory();}
 receive(topic,bytes,packet={}){const before=this.topics.get(topic)?.count??0;super.receive(topic,bytes,packet);if((this.topics.get(topic)?.count??0)>before)this.plots.add(topic,bytes.toString('utf8'));}
 inspect(topic,mode){const detail=super.inspect(topic,mode);return detail?{...detail,plot:this.plots.series(topic)}:detail;}
 clearPlot(topic){if(typeof topic!=='string'||topic.length>1024)throw Error('Choose a topic');this.plots.clear(topic);}
 clear(){this.plots.clear();super.clear();}
 async dispose(){await super.dispose();this.plots.clear();}
}
module.exports={Explorer};
