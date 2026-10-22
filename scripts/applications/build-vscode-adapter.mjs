import {installVsCodeAdapter,planVsCodeAdapter,vsCodeAdapterStatus,rollbackVsCodeAdapter} from '../../src/host-adapters/vscode.js';
import {fileURLToPath} from 'node:url';
const flags={};for(let i=2;i<process.argv.length;i++){const k=process.argv[i];if(['--plan','--rollback','--dry-run'].includes(k)){flags[k.slice(2)]=true;continue}if(!['--source','--feature','--recipe','--out','--status','--workspace'].includes(k)||!process.argv[i+1])throw Error('Use --source <VS Code runtime> --feature <frozen package> --out <new adapter> [--plan] or --status <adapter> or --rollback --workspace <adapter> [--dry-run]');flags[k.slice(2)]=process.argv[++i];}
const recipe=flags.recipe??fileURLToPath(new URL('../../recipes/vscode-raw-diff/adapter.json',import.meta.url));
const result=flags.status?await vsCodeAdapterStatus(flags.status):flags.rollback?await rollbackVsCodeAdapter(flags.workspace,{dryRun:flags['dry-run']}):flags.plan?await planVsCodeAdapter(flags.source,flags.feature,recipe):await installVsCodeAdapter(flags.source,flags.feature,recipe,flags.out);
console.log(JSON.stringify(result,null,2));
