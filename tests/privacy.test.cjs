const test = require('node:test');
const assert = require('node:assert/strict');

test('public content allows approved business metadata and rejects other contact details', async () => {
	const { assertPublicText } = await import('../scripts/privacy-rules.mjs');
	assert.doesNotThrow(() => assertPublicText('bitavu.com https://bitavu.com'));
	assert.doesNotThrow(() => assertPublicText('bitavu.com <integration+n8n@bitavu.com>'));
	assert.throws(() => assertPublicText(['private-person', 'personal.example'].join('@')));
	assert.throws(() => assertPublicText(['private-person', 'personal\\.example'].join('@')));
});
test('public content rejects credentials and identifying machine paths', async () => {
	const { assertPublicText } = await import('../scripts/privacy-rules.mjs');
	for (const text of [
		'bk_' + 'test_' + 'a'.repeat(43),
		'bk_' + 'production_' + 'a'.repeat(43),
		'github_' + 'pat_' + 'a'.repeat(43),
		['C:', 'Users', 'ExampleOwner', 'project'].join('\\'),
		['https:/', 'localhost:8000', 'private'].join('/'),
	])
		assert.throws(() => assertPublicText(text));
});
test('public commit identities preserve the approved default GitHub attribution', async () => {
	const { assertPublicIdentity } = await import('../scripts/privacy-rules.mjs');
	assert.doesNotThrow(() =>
		assertPublicIdentity('muveaio', ['123+muveaio', 'users.noreply.github.com'].join('@')),
	);
	assert.throws(() =>
		assertPublicIdentity('Private Person', ['private', 'personal.example'].join('@')),
	);
});

test('rejected commit attribution never appears in diagnostic output', async () => {
	const { inspect } = require('node:util');
	const { assertPublicIdentity } = await import('../scripts/privacy-rules.mjs');
	const address = ['private-person', 'personal.example'].join('@');
	for (const name of ['muveaio', 'Private Person']) {
		let failure;
		try {
			assertPublicIdentity(name, address);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure);
		assert.equal(inspect(failure).includes(address), false);
		assert.equal(inspect(failure).includes('Private Person'), false);
	}
});
