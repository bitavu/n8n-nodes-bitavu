const test = require('node:test');
const assert = require('node:assert/strict');
const { Bitavu } = require('../dist/nodes/Bitavu/Bitavu.node.js');
const { BitavuApi } = require('../dist/credentials/BitavuApi.credentials.js');
const pdf = Buffer.from('%PDF-1.7\nfictional test fixture');

function execution(config = {}) {
	const calls = [],
		binaries = [];
	const items = config.items || [{ json: { data: { invoice: { number: 'N8N-2087' } } } }];
	const parameters = {
		templateId: 'invoice',
		revision: 1,
		data: items[0]?.json.data,
		options: {},
		...config.parameters,
	};
	const context = {
		getInputData: () => items,
		getNode: () => ({
			id: 'node-1',
			name: 'Bitavu',
			type: 'n8n-nodes-bitavu.bitavu',
			typeVersion: 1,
			position: [0, 0],
		}),
		getExecutionId: () => config.executionId || '101',
		evaluateExpression: () => config.runIndex || 0,
		getNodeParameter: (name, index, fallback) =>
			typeof parameters[name] === 'function'
				? parameters[name](index)
				: (parameters[name] ?? fallback),
		continueOnFail: () => config.continueOnFail || false,
		helpers: {
			httpRequestWithAuthentication: async function (credential, options) {
				calls.push({ credential, options });
				if (config.networkError)
					throw new Error('request failed, Authorization: Bearer DO_NOT_EXPOSE');
				return typeof config.response === 'function'
					? config.response(calls.length)
					: config.response || {
							statusCode: 200,
							headers: { 'content-type': 'application/pdf' },
							body: pdf,
						};
			},
			prepareBinaryData: async (bytes, fileName, mimeType) => {
				binaries.push({ bytes, fileName, mimeType });
				return { data: bytes.toString('base64'), fileName, mimeType };
			},
		},
	};
	return { calls, binaries, run: () => new Bitavu().execute.call(context) };
}

test('uses a saved version, the production API and native PDF output without modifying the input', async () => {
	const items = [
		{
			json: { customerId: 'customer-fixture', data: { invoice: { number: 'N8N-2087' } } },
			binary: { original: { data: 'c2FtcGxl', mimeType: 'text/plain' } },
		},
	];
	const before = structuredClone(items),
		e = execution({ items });
	const [[result]] = await e.run();
	assert.equal(e.calls[0].credential, 'bitavuApi');
	assert.equal(e.calls[0].options.url, 'https://api.bitavu.com/v1/render');
	assert.equal(e.calls[0].options.disableFollowRedirect, true);
	assert.equal(e.calls[0].options.skipSslCertificateValidation, undefined);
	assert.deepEqual(JSON.parse(e.calls[0].options.body), {
		templateId: 'invoice',
		revision: 1,
		data: items[0].json.data,
	});
	assert.equal(result.json.customerId, 'customer-fixture');
	assert.deepEqual(result.pairedItem, { item: 0 });
	assert.deepEqual(items, before);
	assert.equal(result.binary.pdf.fileName, 'invoice.pdf');
	assert.deepEqual(result.binary.original, items[0].binary.original);
	assert.ok(e.binaries[0].bytes.equals(pdf));
});
test('automatic operation IDs survive a node retry and distinguish items, executions and loop iterations', async () => {
	const a = execution();
	await a.run();
	await a.run();
	const key = a.calls[0].options.headers['Idempotency-Key'];
	assert.equal(key, a.calls[1].options.headers['Idempotency-Key']);
	assert.match(key, /^[a-zA-Z0-9_-]{16,128}$/);
	for (const config of [
		{ executionId: '102' },
		{ runIndex: 1 },
		{ items: [{ json: {} }, { json: {} }], parameters: { data: {} } },
	]) {
		const other = execution(config);
		await other.run();
		assert.notEqual(key, other.calls.at(-1).options.headers['Idempotency-Key']);
	}
});
test('honors an upstream operation ID for retries across executions and custom file fields', async () => {
	const e = execution({
		parameters: {
			options: {
				operationId: 'invoice-operation-2087',
				fileName: 'N8N-2087.pdf',
				outputField: 'document',
			},
		},
	});
	const [[result]] = await e.run();
	assert.equal(e.calls[0].options.headers['Idempotency-Key'], 'invoice-operation-2087');
	assert.equal(result.binary.document.fileName, 'N8N-2087.pdf');
	assert.equal(result.binary.pdf, undefined);
});
test('validates configuration before spending a render credit', async () => {
	for (const parameters of [
		{ templateId: '../invoice' },
		{ revision: 0 },
		{ revision: 1.5 },
		{ data: '{' },
		{ data: [] },
		{ data: 'null' },
		{ data: '42' },
		{ options: { operationId: 'short' } },
		{ options: { fileName: '../invoice.pdf' } },
		{ options: { fileName: 'invoice.html' } },
		{ options: { outputField: '__proto__' } },
	]) {
		const e = execution({ parameters });
		await assert.rejects(e.run());
		assert.equal(e.calls.length, 0);
	}
});
test('handles JSON strings and per-item expressions without losing pairing', async () => {
	const e = execution({
		items: [{ json: {} }, { json: {} }],
		parameters: { data: (i) => JSON.stringify({ invoice: { number: `N8N-${2087 + i}` } }) },
	});
	const [results] = await e.run();
	assert.deepEqual(
		results.map((x) => x.pairedItem.item),
		[0, 1],
	);
	assert.equal(JSON.parse(e.calls[1].options.body).data.invoice.number, 'N8N-2088');
});
test('never exposes request credentials or arbitrary remote response text in errors', async () => {
	for (const config of [
		{ networkError: true },
		{
			response: {
				statusCode: 403,
				headers: {},
				body: Buffer.from(JSON.stringify({ code: 'KEY_REPORT', message: 'DO_NOT_EXPOSE' })),
			},
		},
		{ response: { statusCode: 500, headers: {}, body: Buffer.from('DO_NOT_EXPOSE') } },
	]) {
		const e = execution(config);
		await assert.rejects(
			e.run(),
			(error) =>
				!JSON.stringify(error).includes('DO_NOT_EXPOSE') &&
				!error.message.includes('DO_NOT_EXPOSE'),
		);
	}
});
test('rejects non-PDF success responses and respects continue-on-fail', async () => {
	const e = execution({
		continueOnFail: true,
		items: [{ json: {} }, { json: {} }],
		parameters: { data: {} },
		response: (count) => ({
			statusCode: 200,
			headers: { 'content-type': 'application/pdf' },
			body: count === 1 ? Buffer.from('not a PDF') : pdf,
		}),
	});
	const [results] = await e.run();
	assert.match(results[0].json.error, /unexpected response/);
	assert.deepEqual(results[0].pairedItem, { item: 0 });
	assert.ok(results[1].binary.pdf);
});
test('credential masks the API key and confines HTTP Request reuse to the production API', () => {
	const c = new BitavuApi();
	assert.equal(c.properties.find((x) => x.name === 'apiKey').typeOptions.password, true);
	assert.equal(c.properties.find((x) => x.name === 'allowedDomains').default, 'api.bitavu.com');
	assert.equal(c.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
	assert.ok(Object.hasOwn(new Bitavu().description, 'usableAsTool'));
	assert.equal(new Bitavu().description.usableAsTool, undefined);
});
test('declares the standard read-only credential test and rejects unsuccessful HTTP responses or missing authentication confirmation', () => {
	const credential = new BitavuApi();
	assert.equal(credential.test.request.method, 'GET');
	assert.equal(
		new URL(credential.test.request.url, credential.test.request.baseURL).href,
		'https://api.bitavu.com/v1/credentials/check',
	);
	assert.equal(credential.test.request.disableFollowRedirect, true);
	assert.equal(credential.test.request.skipSslCertificateValidation, undefined);
	assert.equal(credential.test.request.ignoreHttpStatusErrors, undefined);
	assert.equal(credential.test.request.body, undefined);
	assert.ok(
		credential.test.rules.some(
			(rule) =>
				rule.type === 'responseSuccessBody' &&
				rule.properties.key === 'authenticated' &&
				rule.properties.value === false,
		),
	);
	assert.ok(
		credential.test.rules.some(
			(rule) =>
				rule.type === 'responseSuccessBody' &&
				rule.properties.key === 'authenticated' &&
				rule.properties.value === undefined,
		),
	);
});
