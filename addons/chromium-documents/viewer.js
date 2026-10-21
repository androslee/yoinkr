import MarkdownIt from 'markdown-it';import DOMPurify from 'dompurify';
const parser=new MarkdownIt({html:false,linkify:false,breaks:false});const $=id=>document.getElementById(id);let generation=0;
// External images/links and embedded scripts never become active document content.
function markdown(source){const box=document.createElement('section');box.innerHTML=DOMPurify.sanitize(parser.render(source),{FORBID_TAGS:['img','iframe','object','embed','form','input','script','style'],FORBID_ATTR:['style']});for(const a of box.querySelectorAll('a')){const span=document.createElement('span');span.textContent=a.textContent+' ('+a.getAttribute('href')+')';a.replaceWith(span);}return box;}
export function parseDelimited(source,delimiter){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;if(rows.length>10000)throw Error('Table exceeds 10,000 rows');}if(quoted)throw Error('Unclosed quoted CSV field');if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
const pre=text=>{const node=document.createElement('pre');node.textContent=text;return node;};
export async function renderDocument(name,text){
 const target=$('document');target.replaceChildren();const extension=name.toLowerCase().split('.').pop();
 if(['md','markdown'].includes(extension))target.append(markdown(text));
 else if(extension==='ipynb'){
  const notebook=JSON.parse(text);if(!Array.isArray(notebook.cells)||notebook.cells.length>500)throw Error('Expected a notebook with up to 500 cells');
  for(const cell of notebook.cells){const section=document.createElement('section');section.className='cell';const source=Array.isArray(cell.source)?cell.source.join(''):String(cell.source??'');section.append(cell.cell_type==='markdown'?markdown(source):pre(source));
   for(const output of (cell.outputs??[]).slice(0,100)){const data=output.data??{};const shown=output.text??data['text/plain'];if(shown!==undefined)section.append(pre(Array.isArray(shown)?shown.join(''):String(shown)));if(data['image/png']&&typeof data['image/png']==='string'&&data['image/png'].length<4*1024*1024){const image=document.createElement('img');image.alt='Notebook output';image.src='data:image/png;base64,'+data['image/png'];section.append(image);}}
   target.append(section);
  }
 }else if(['csv','tsv'].includes(extension)){
  const rows=parseDelimited(text,extension==='csv'?',':'\t');if(rows.some(row=>row.length>256))throw Error('Table exceeds 256 columns');const table=document.createElement('table');let rendered=0;for(const row of rows.slice(0,2000)){const tr=document.createElement('tr');for(const cell of row){const td=document.createElement(rendered===0?'th':'td');td.textContent=cell;tr.append(td);}table.append(tr);rendered++;}target.append(table);if(rows.length>2000)target.append(pre('Showing the first 2,000 of '+rows.length+' rows.'));
 }else if(extension==='json')target.append(pre(JSON.stringify(JSON.parse(text),null,2)));
 else if(['txt','log'].includes(extension))target.append(pre(text));else throw Error('Supported: Markdown, .ipynb, CSV, TSV, JSON, text and log');
 $('status').textContent=name;
}
$('file').addEventListener('change',async()=>{const token=++generation,file=$('file').files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('Please choose a document under 8 MiB');const text=await file.text();if(token===generation)await renderDocument(file.name,text);}catch(e){if(token===generation){$('document').replaceChildren();$('status').textContent=e.message;}}});
$('demo').onclick=()=>renderDocument('example.md','# Your documents, locally\n\n- Markdown previews\n- Notebooks with text and PNG output\n- CSV / TSV tables\n- Formatted JSON and plain text\n\n| Source | Integration |\n| --- | --- |\n| VS Code preview styles | Chromium extension |');
$('theme').onclick=()=>{document.body.classList.toggle('light');document.body.classList.toggle('vscode-dark');};
if(new URL(location.href).searchParams.has('test'))window.__documentViewer={renderDocument,parseDelimited};
