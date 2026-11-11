import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assertPublicText, assertPublicIdentity } from './privacy-rules.mjs';

const git = (args) =>
	execFileSync('git', ['-c', 'safe.directory=*', ...args], {
		encoding: 'utf8',
		windowsHide: true,
		maxBuffer: 15000000,
	});
const ref = process.argv[2];
const commits = git(['rev-list', ...(ref ? [ref] : ['--all'])])
	.trim()
	.split('\n')
	.filter(Boolean);
assert.ok(commits.length, 'A complete Git checkout is required for the history audit.');
const blobs = new Map();
const files = new Set();
const allowedFiles = new Set([
	'.github/workflows/ci.yml',
	'.github/workflows/publish.yml',
	'.gitignore',
	'.prettierrc.js',
	'CHANGELOG.md',
	'LICENSE',
	'README.md',
	'credentials/BitavuApi.credentials.ts',
	'eslint.config.mjs',
	'examples/bitavu-generate-pdf.json',
	'nodes/Bitavu/Bitavu.node.json',
	'nodes/Bitavu/Bitavu.node.ts',
	'nodes/Bitavu/bitavu.svg',
	'package-lock.json',
	'package.json',
	'scripts/check-package.mjs',
	'scripts/check-vetting.mjs',
	'scripts/publish-package.mjs',
	'scripts/check-privacy.mjs',
	'scripts/privacy-rules.mjs',
	'tests/bitavu.test.cjs',
	'tests/privacy.test.cjs',
	'tsconfig.json',
]);
for (const commit of commits) {
	const [an, ae, cn, ce, ...message] = git([
		'show',
		'-s',
		'--format=%an%n%ae%n%cn%n%ce%n%B',
		commit,
	]).split('\n');
	assertPublicIdentity(an, ae);
	assertPublicIdentity(cn, ce);
	assertPublicText(message.join('\n'), 'commit message');
	for (const row of git(['ls-tree', '-r', commit]).trim().split('\n').filter(Boolean)) {
		const match = /^\d+ blob ([a-f0-9]+)\t(.+)$/.exec(row);
		assert.ok(match, 'Only regular standalone integration files are permitted.');
		assert.ok(
			allowedFiles.has(match[2]),
			'Unexpected file in integration history; publication blocked.',
		);
		blobs.set(match[1], match[2]);
		files.add(match[2]);
	}
}
for (const [id, file] of blobs) assertPublicText(git(['cat-file', 'blob', id]), file);
for (const row of git(['for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags'])
	.trim()
	.split('\n')
	.filter(Boolean)) {
	const [type, id] = row.split(' ');
	if (type !== 'tag') continue;
	const text = git(['cat-file', 'tag', id]);
	const tagger = /^tagger (.+) <([^>]+)> \d+ [+-]\d+$/m.exec(text);
	assert.ok(tagger, 'Annotated tags must have approved attribution.');
	assertPublicIdentity(tagger[1], tagger[2]);
	assertPublicText(text, 'release tag');
}
console.log(
	JSON.stringify({
		commits: commits.length,
		uniqueBlobs: blobs.size,
		paths: files.size,
		approvedGitHubAttributionOnly: true,
		privatePatternsAbsent: true,
	}),
);
