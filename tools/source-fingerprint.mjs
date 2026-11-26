import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function sourceFingerprint(root,{includePublic=true,directories}={}){
  const files=['package.json','package-lock.json'];
  async function walk(rel){for(const entry of await fs.readdir(path.join(root,rel),{withFileTypes:true})){const next=rel+'/'+entry.name;if(entry.isDirectory())await walk(next);else if(entry.isFile())files.push(next);}}
  const dirs=directories??(includePublic?['apps','packages','public']:['apps','packages']);
  for(const dir of dirs)await walk(dir);
  const hash=createHash('sha256');for(const rel of files.sort()){hash.update(rel+'\0');hash.update(await fs.readFile(path.join(root,rel)));hash.update('\0');}
  return {algorithm:'SHA-256 of sorted runtime paths and bytes',scope:[...dirs,'package.json','package-lock.json'],files:files.length,sha256:hash.digest('hex')};
}
