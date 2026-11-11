import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {analyzePackage,SOURCE_FILE_PATTERNS} from '@n8n/scan-community-package/dist/scanner.js';

// Use the same source and tarball rules as n8n's vetting service, which ignores
// inline ESLint suppressions. Full registry/provenance scanning follows release.
const root=process.cwd(),manifest=JSON.parse(await readFile('package.json','utf8'));
const audit=JSON.parse(await readFile('artifacts/package-audit.json','utf8'));
assert.equal(audit.package,manifest.name+'@'+manifest.version);
await mkdir('.runtime',{recursive:true});
const directory=await mkdtemp(path.join(root,'.runtime','vetting-'));
const tar=gunzipSync(await readFile(path.join('artifacts',audit.filename))),allowed=new Set(audit.files);
for(let offset=0;offset+512<=tar.length;){
  const header=tar.subarray(offset,offset+512);if(header.every(value=>value===0))break;
  const name=header.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim(),8)||0;
  assert.ok(allowed.has(name),'Only audited files may be inspected.');
  assert.ok(header[156]===0||header[156]===48,'Package must contain regular files.');
  const target=path.resolve(directory,name);assert.ok(target.startsWith(directory+path.sep));
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,tar.subarray(offset+512,offset+512+size));
  offset+=512+Math.ceil(size/512)*512;
}
for(const [kind,location,patterns]of [['source',root,SOURCE_FILE_PATTERNS],['package',path.join(directory,'package'),['**/*.js','package.json']]]){
  const result=await analyzePackage(location,patterns);
  if(!result.passed){
    if(process.env.GITHUB_ACTIONS==='true')throw new Error(kind+' vetting failed. Reproduce the check locally for details.');
    const details=(result.details||result.message).replaceAll(root,'[workspace]').replaceAll(directory,'[package]');
    throw new Error(kind+' vetting failed:\n'+details);
  }
  console.log(JSON.stringify({check:kind,passed:true,scanner:'@n8n/scan-community-package@0.43.0'}));
}
