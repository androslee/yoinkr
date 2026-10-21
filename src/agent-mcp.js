import {YOINKR_VERSION} from './version.js';
import {McpServer} from '@modelcontextprotocol/server';
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {writeFile,realpath,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAgent,loadAgentConfig} from './agent.js';
import {reaInfo} from './rea.js';

export async function startAgentMcp(configPath){
 const agent=await createAgent(configPath);
 const server=new McpServer({name:'yoinkr',version:YOINKR_VERSION},{instructions:
  'Yoinkr investigates and transfers software features using retained REA Evidence. Start with yoinkr_catalog; use registered IDs. Long operations return job IDs: poll yoinkr_job, then read yoinkr_result pages. A succeeded job means the operation finished; inspect its result for verification passed/failed. Manual observations and static analysis do not prove runtime equivalence. Analyze unfamiliar code before explicitly enabling execution. Operation jobs persist until finished after request cancellation; poll rather than resubmit. REA is a separate optional MCP server; Yoinkr does not duplicate its catalog.'});
 for(const tool of agent.tools.values())server.registerTool(tool.name,{description:tool.description,inputSchema:tool.inputSchema,annotations:tool.annotations},async args=>{
  try{const result=await agent.call(tool.name,args);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
  catch(e){return {isError:true,content:[{type:'text',text:String(e.message).slice(0,4000)}]};}
 });
 try{await server.connect(new StdioServerTransport());}catch(e){await agent.close();throw e;}
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;await agent.close();await server.close();};
 return {agent,server,close};
}

// Generate a reviewable standard client fragment; never install or change a host's settings.
export async function writeMcpClientConfig(configPath,out,{includeRea=false}={}){
 const {path}=await loadAgentConfig(configPath),cli=fileURLToPath(new URL('./cli.js',import.meta.url));
 const mcpServers={yoinkr:{command:process.execPath,args:[cli,'mcp','--config',path]}};
 if(includeRea)mcpServers.rea={command:process.execPath,args:[reaInfo().script,'--mcp']};
 const destination=resolve(out);
 // wx also refuses existing files/symlinks; there is no automatic config merge.
 await writeFile(destination,JSON.stringify({mcpServers},null,2)+'\n',{flag:'wx',mode:0o600});
 return {file:await realpath(destination),bytes:(await stat(destination)).size,servers:Object.keys(mcpServers),installed:false,note:'Import or merge this fragment into your chosen MCP client after review. No host settings were changed.'};
}
