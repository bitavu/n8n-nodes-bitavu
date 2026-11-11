import assert from 'node:assert/strict';

const approvedGitNoReply = new RegExp(
	'^\\d+\\+' + 'muveaio' + '@' + 'users\\.noreply\\.github\\.com$',
);
const forbidden =
	/bk_(?:local|test|live|production)_[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:test|live)_[A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:C:|D:)\\Users\\|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(?=[:/\s])|credential\.private/i;

export function assertPublicText(text, label = 'public content') {
	assert.ok(!forbidden.test(text), `Private content detected in ${label}; publication blocked.`);
	const normalized = text.replaceAll('\\.', '.');
	for (const match of normalized.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
		assert.ok(
			['integration+n8n@bitavu.com', 'integration@bitavu.com', 'npm@bitavu.com'].includes(
				match[0].toLowerCase(),
			) || approvedGitNoReply.test(match[0]),
			`Unapproved contact metadata in ${label}; publication blocked.`,
		);
	}
}

export function assertPublicIdentity(name, email) {
	// Never pass untrusted identity values to assertions that print actual input.
	assert.ok(name === 'muveaio', 'Commit attribution failed the public identity policy.');
	assert.ok(approvedGitNoReply.test(email), 'Commit attribution failed the public email policy.');
}
