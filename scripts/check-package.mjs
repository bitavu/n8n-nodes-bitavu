import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { assertPublicText } from './privacy-rules.mjs';

await mkdir('artifacts', { recursive: true });
assert.ok(process.env.npm_execpath, 'Run this check using npm run pack:check.');
const packed = JSON.parse(
	execFileSync(
		process.execPath,
		[
			process.env.npm_execpath,
			'pack',
			'--ignore-scripts',
			'--json',
			'--pack-destination',
			'artifacts',
		],
		{ encoding: 'utf8', windowsHide: true },
	),
)[0];
const bytes = await readFile(`artifacts/${packed.filename}`);
const tar = gunzipSync(bytes);
const allowed = new Set([
	'package/LICENSE',
	'package/README.md',
	'package/package.json',
	'package/dist/credentials/BitavuApi.credentials.js',
	'package/dist/nodes/Bitavu/Bitavu.node.js',
	'package/dist/nodes/Bitavu/Bitavu.node.json',
	'package/dist/nodes/Bitavu/BitavuApi.js',
	'package/dist/nodes/Bitavu/BitavuAction.js',
	'package/dist/nodes/BitavuListTemplates/BitavuListTemplates.node.js',
	'package/dist/nodes/BitavuListTemplates/BitavuListTemplates.node.json',
	'package/dist/nodes/BitavuListTemplateVersions/BitavuListTemplateVersions.node.js',
	'package/dist/nodes/BitavuListTemplateVersions/BitavuListTemplateVersions.node.json',
	'package/dist/nodes/BitavuGetTemplateVersion/BitavuGetTemplateVersion.node.js',
	'package/dist/nodes/BitavuGetTemplateVersion/BitavuGetTemplateVersion.node.json',
	'package/dist/nodes/BitavuSaveTemplateExample/BitavuSaveTemplateExample.node.js',
	'package/dist/nodes/BitavuSaveTemplateExample/BitavuSaveTemplateExample.node.json',
	'package/dist/nodes/Bitavu/bitavu.svg',
	'package/examples/bitavu-generate-pdf.json',
]);
const files = [];
for (let offset = 0; offset + 512 <= tar.length; ) {
	const header = tar.subarray(offset, offset + 512);
	if (header.every((value) => value === 0)) break;
	const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
	const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
	const content = tar.subarray(offset + 512, offset + 512 + size);
	assert.ok(allowed.has(name), 'Unexpected file in the npm tarball.');
	assertPublicText(content.toString(), name);
	files.push(name);
	offset += 512 + Math.ceil(size / 512) * 512;
}
assert.equal(files.length, allowed.size);
assert.equal(new Set(files).size, allowed.size);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.dependencies, undefined, 'No runtime dependencies allowed.');
assert.equal(manifest.name, '@bitavu/n8n-nodes-bitavu');
assert.equal(manifest.repository.url, 'git+https://github.com/bitavu/n8n-nodes-bitavu.git');
assert.deepEqual(manifest.author, {
	name: 'bitavu.com',
	email: 'integration+n8n@bitavu.com',
	url: 'https://bitavu.com',
});
const workflow = JSON.parse(await readFile('examples/bitavu-generate-pdf.json', 'utf8'));
assert.ok(
	workflow.nodes.every((node) => node.credentials === undefined),
	'Example must not embed credentials.',
);
const receipt = {
	package: packed.id,
	filename: packed.filename,
	sha256: createHash('sha256').update(bytes).digest('hex'),
	bytes: bytes.length,
	files,
	privatePatternsAbsent: true,
};
await writeFile('artifacts/package-audit.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
