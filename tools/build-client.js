import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'dist');
const wsUrl=(process.env.BALLFORGE_WS_URL || '').trim();
if(wsUrl){
  const url=new URL(wsUrl);
  if(url.protocol!=='wss:'||url.username||url.password||url.search||url.hash||url.pathname!=='/ws')
    throw new Error('BALLFORGE_WS_URL must be wss://your-server.example/ws');
}
await mkdir(out,{recursive:true});
await cp(path.join(root,'public'),out,{recursive:true});
for(const [folder,files] of Object.entries({content:['classes.js','economy.js'],sim:['arena.js','random.js']})){
  const dest=path.join(out,'packages',folder);await mkdir(dest,{recursive:true});
  for(const file of files)await cp(path.join(root,'packages',folder,file),path.join(dest,file));
}
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(out,'config.js'),'window.BALLFORGE_CONFIG = '+JSON.stringify({version,requiresBackend:true,wsUrl})+';\n');
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Built DS Ball Forge '+version+' in dist/ · '+(wsUrl?'classroom server configured':'practice available, classroom server pending'));
