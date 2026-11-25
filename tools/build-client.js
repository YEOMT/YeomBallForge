import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
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
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(path.join(root,'public'),out,{recursive:true});
for(const folder of ['content','protocol','sim']){
  const dest=path.join(out,'packages',folder);await mkdir(dest,{recursive:true});
  await cp(path.join(root,'packages',folder),dest,{recursive:true});
}
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(out,'config.js'),'window.BALLFORGE_CONFIG = '+JSON.stringify({version,requiresBackend:true,wsUrl})+';\n');
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Built DS Ball Forge '+version+' in dist/ · '+(wsUrl?'classroom server configured':'practice available, classroom server pending'));
