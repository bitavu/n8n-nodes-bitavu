import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const expectedDigest = process.env.APPROVED_PACKAGE_SHA256;
assert.ok(/^[a-f0-9]{64}$/.test(expectedDigest || ''), 'Provide the approved package SHA-256.');
const receipt = JSON.parse(await readFile('artifacts/package-audit.json', 'utf8'));
assert.equal(receipt.sha256, expectedDigest, 'The built package differs from the approved package.');
const file = path.resolve('artifacts', receipt.filename);
assert.match(receipt.filename, /^bitavu-n8n-nodes-bitavu-[0-9.]+(?:-[a-zA-Z0-9.-]+)?\.tgz$/);
assert.equal(
	createHash('sha256')
		.update(await readFile(file))
		.digest('hex'),
	receipt.sha256,
);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.ok(manifest.private !== true, 'This package is marked private.');
assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`);
assert.equal(process.env.GITHUB_REPOSITORY, 'bitavu/n8n-nodes-bitavu');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run publish:artifact inside the release workflow.');
execFileSync(
	process.execPath,
	[
		npmCli,
		'publish',
		file,
		'--provenance',
		'--access',
		'public',
		'--registry=https://registry.npmjs.org',
	],
	{ stdio: 'inherit', windowsHide: true },
);
