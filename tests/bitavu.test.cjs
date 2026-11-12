const test = require('node:test');
const assert = require('node:assert/strict');
const { Bitavu } = require('../dist/nodes/Bitavu/Bitavu.node.js');
const { BitavuListTemplates } = require('../dist/nodes/BitavuListTemplates/BitavuListTemplates.node.js');
const { BitavuListTemplateVersions } = require('../dist/nodes/BitavuListTemplateVersions/BitavuListTemplateVersions.node.js');
const { BitavuGetTemplateVersion } = require('../dist/nodes/BitavuGetTemplateVersion/BitavuGetTemplateVersion.node.js');
const { BitavuSaveTemplateExample } = require('../dist/nodes/BitavuSaveTemplateExample/BitavuSaveTemplateExample.node.js');
const { BitavuApi } = require('../dist/credentials/BitavuApi.credentials.js');
const { NodeHelpers } = require('n8n-workflow');
const pdf = Buffer.from('%PDF-1.7\nfictional test fixture');
const requestId = '1040b100-41bd-4a11-8eee-24a99fa0e121';
const summary = {
	id: 'invoice',
	name: 'Sample invoice',
	revision: 3,
	createdAt: null,
	updatedAt: null,
	studioUrl: 'https://studio.bitavu.com/templates/invoice',
};
const template = {
	...summary,
	bindings: [{ path: 'invoice.number', type: 'text', required: true }],
	exampleJson: { invoice: { number: 'EXAMPLE-001' } },
	inputReview: { missing: [], unused: [] },
};

function jsonResponse(body, statusCode = 200, headers = {}) {
	return {
		statusCode,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
		body: Buffer.from(JSON.stringify(body)),
	};
}

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
		getCurrentNodeParameter: (name) => parameters[name],
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
	const Node = config.node ?? Bitavu;
	const node = new Node();
	return {
		calls,
		binaries,
		run: () => node.execute.call(context),
		searchTemplates: (filter) => node.methods.listSearch.searchTemplates.call(context, filter),
		searchVersions: (page) => node.methods.listSearch.searchVersions.call(context, undefined, page),
	};
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
	assert.equal(result.json.bitavu.revision, 1);
	assert.ok(e.binaries[0].bytes.equals(pdf));
});

test('resolves pinned defaults in a workflow exported before version selection existed', () => {
	const { description } = new Bitavu();
	const node = { typeVersion: 1 };
	const parameters = NodeHelpers.getNodeParameters(
		description.properties,
		{ templateId: 'invoice', revision: 7 },
		true,
		true,
		node,
		description,
	);
	assert.equal(parameters.versionSelection, 'pinned');
	assert.equal(parameters.revision, 7);
	assert.equal(parameters.templateId, 'invoice');
});

test('keeps the same PDF settings and version control across both render modes', () => {
	const { description } = new Bitavu();
	const node = { typeVersion: 1 };
	const editorParameters = (values, defaults) =>
		NodeHelpers.getNodeParameters(
			description.properties,
			values,
			defaults,
			false,
			node,
			description,
		);
	const data = '={{ $json.invoiceData }}';
	const savedSettings = {
		templateId: { __rl: true, mode: 'list', value: 'invoice', cachedResultName: 'Invoices' },
		revision: { __rl: true, mode: 'list', value: '7', cachedResultName: 'Version 7' },
		data,
		options: { mappingId: 'fixture-mapping', fileName: 'example.pdf', outputField: 'document' },
	};
	let values = editorParameters(savedSettings, true);
	for (const [versionSelection, versionLabel] of [
		['latest-published', 'Base Version'],
		['pinned', 'Pinned Version'],
	]) {
		values = editorParameters({ ...editorParameters(values, false), versionSelection }, true);
		for (const [key, value] of Object.entries(savedSettings)) {
			assert.deepEqual(values[key], value, `${key} in ${versionSelection}`);
		}
		const visibleFields = description.properties.filter((property) =>
			NodeHelpers.displayParameter(values, property, node, description),
		);
		assert.deepEqual(
			visibleFields.map((property) => property.displayName),
			['Template', 'Version Selection', versionLabel, 'Document Data', 'Options'],
		);
		assert.equal(visibleFields[2].name, 'revision');
		assert.equal(visibleFields[2].type, 'resourceLocator');
	}
});

test('template nodes expose only the fields for their fixed action', () => {
	for (const [Node, names] of [
		[BitavuListTemplates, []],
		[BitavuListTemplateVersions, ['templateId', 'versionOptions']],
		[BitavuGetTemplateVersion, ['templateId', 'templateRevision']],
		[BitavuSaveTemplateExample, ['templateId', 'expectedRevision', 'exampleJson']],
	]) {
		const { description } = new Node();
		assert.deepEqual(description.properties.map(({ name }) => name), names);
		assert.ok(description.properties.every(({ displayOptions }) => !displayOptions));
		assert.deepEqual(description.credentials, [{ name: 'bitavuApi', required: true }]);
	}
});

test('uses action names in both the picker and the canvas', () => {
	for (const [Node, label] of [
		[Bitavu, 'Generate PDF'],
		[BitavuListTemplates, 'List Templates'],
		[BitavuGetTemplateVersion, 'Get Template Version'],
		[BitavuSaveTemplateExample, 'Save Template Example'],
		[BitavuListTemplateVersions, 'List Template Versions'],
	]) {
		const { description } = new Node();
		assert.equal(description.displayName, label);
		assert.equal(description.defaults.name, label);
	}
});

test('the PDF node always generates a PDF when imported settings contain a stale action', async () => {
	const e = execution({ parameters: { resource: 'document', operation: 'saveExample' } });
	const [[result]] = await e.run();
	assert.ok(result.binary.pdf);
	assert.equal(e.calls[0].options.url, 'https://api.bitavu.com/v1/render');
});

test('searches templates visible to the credential by ID, name and folder', async () => {
	const entries = [
		{
			id: 'invoice',
			name: 'Invoice',
			path: ['Finance', 'Invoice'],
			latestRevision: 3,
			studioUrl: summary.studioUrl,
		},
		{
			id: 'shipping',
			name: 'Packing Slip',
			path: ['Operations', 'Packing Slip'],
			latestRevision: 2,
			studioUrl: summary.studioUrl,
		},
	];
	const e = execution({ response: jsonResponse({ templates: entries }) });
	for (const [query, name, value] of [
		[' FINANCE ', 'Finance / Invoice', 'invoice'],
		['packing slip', 'Operations / Packing Slip', 'shipping'],
		['shipping', 'Operations / Packing Slip', 'shipping'],
	]) {
		assert.deepEqual(await e.searchTemplates(query), { results: [{ name, value }] });
	}
	assert.deepEqual(await e.searchTemplates('missing'), { results: [] });
	const sorted = execution({
		response: jsonResponse({
			templates: [
				entries[1],
				{ ...entries[0], id: 'invoice-10', path: ['Finance', 'Invoice 10'] },
				{ ...entries[0], id: 'invoice-2', path: ['finance', 'invoice 2'] },
				entries[0],
			],
		}),
	});
	assert.deepEqual(await sorted.searchTemplates(''), {
		results: [
			{ name: 'Finance / Invoice', value: 'invoice' },
			{ name: 'finance / invoice 2', value: 'invoice-2' },
			{ name: 'Finance / Invoice 10', value: 'invoice-10' },
			{ name: 'Operations / Packing Slip', value: 'shipping' },
		],
	});
	assert.ok(
		e.calls.every(
			({ credential, options }) =>
				credential === 'bitavuApi' &&
				options.method === 'GET' &&
				options.url === 'https://api.bitavu.com/v1/templates' &&
				options.disableFollowRedirect,
		),
	);
	const denied = execution({ response: jsonResponse({ code: 'KEY_SCOPE' }, 403) });
	await assert.rejects(denied.searchTemplates(''), /Read templates/);
});

test('uses the selected template for either render mode without a catalog lookup', async () => {
	for (const [versionSelection, revision] of [
		['pinned', 3],
		['latest-published', 'latest-published'],
	]) {
		const e = execution({
			parameters: {
				versionSelection,
				revision: { __rl: true, mode: 'list', value: '3', cachedResultName: 'Version 3' },
				templateId: {
					__rl: true,
					mode: 'list',
					value: 'invoice',
					cachedResultName: 'Finance / Invoice',
				},
			},
		});
		const [[result]] = await e.run();
		assert.ok(result.binary.pdf);
		assert.equal(e.calls.length, 1);
		const request = JSON.parse(e.calls[0].options.body);
		assert.equal(request.templateId, 'invoice');
		assert.equal(request.revision, revision);
		if (versionSelection === 'latest-published') assert.equal(request.baseRevision, 3);
	}
});

test('lists saved versions of the chosen template and preserves the next page', async () => {
	const e = execution({
		parameters: { templateId: { __rl: true, mode: 'list', value: 'invoice' } },
		response: jsonResponse({
			versions: [{ ...summary, title: 'Ready to send' }],
			latest: summary,
			selected: null,
			page: 2,
			pageSize: 50,
			total: 101,
			pages: 3,
		}),
	});
	assert.deepEqual(await e.searchVersions('2'), {
		results: [{ name: 'Version 3 - Ready to send', value: '3' }],
		paginationToken: '3',
	});
	assert.equal(e.calls[0].options.url, 'https://api.bitavu.com/v1/templates/invoice/versions?summary=true&page=2&pageSize=50');
	const empty = execution({ parameters: { templateId: '' } });
	await assert.rejects(empty.searchVersions(), /Select a template/);
	assert.equal(empty.calls.length, 0);
});

test('orders revisions numerically and labels the current publication when a newer draft exists', async () => {
	const e = execution({
		parameters: { templateId: 'invoice' },
		response: jsonResponse({
			versions: [
				{ ...summary, revision: 2, title: null },
				{ ...summary, revision: 3, title: 'Ready to send' },
				{ ...summary, revision: 11, title: 'Working draft' },
			],
			latest: { ...summary, revision: 11 },
			selected: null,
			publishedRevision: 3,
			page: 1,
			pageSize: 50,
			total: 3,
			pages: 1,
		}),
	});
	assert.deepEqual(await e.searchVersions(), {
		results: [
			{ name: 'Version 11 - Working draft', value: '11' },
			{ name: 'Version 3 (Published) - Ready to send', value: '3' },
			{ name: 'Version 2', value: '2' },
		],
	});
});

test('renders the latest publication with an optional compatibility base and saved mapping', async () => {
	for (const baseRevision of [undefined, 2]) {
		const e = execution({
			parameters: {
				versionSelection: 'latest-published',
				revision: baseRevision ?? null,
				options: { mappingId: 'mapping-fixture' },
			},
			response: {
				statusCode: 200,
				headers: {
					'Content-Type': 'application/pdf; charset=binary',
					'X-Bitavu-Revision': '3',
					'X-Bitavu-Pages': '2',
					'X-Bitavu-Request-Id': requestId,
				},
				body: pdf,
			},
		});
		const [[result]] = await e.run();
		const body = JSON.parse(e.calls[0].options.body);
		assert.equal(body.revision, 'latest-published');
		assert.equal(body.mappingId, 'mapping-fixture');
		assert.equal(body.baseRevision, baseRevision);
		assert.equal(result.json.bitavu.requestedRevision, 'latest-published');
		assert.equal(result.json.bitavu.revision, 3);
		assert.equal(result.json.bitavu.pageCount, 2);
		assert.equal(result.json.bitavu.requestId, requestId);
		assert.ok(result.binary.pdf);
	}
	const pinned = execution({
		parameters: { options: { baseRevision: 2, mappingId: 'mapping-fixture' } },
	});
	await pinned.run();
	const body = JSON.parse(pinned.calls[0].options.body);
	assert.equal(body.mappingId, 'mapping-fixture');
	assert.ok(!Object.hasOwn(body, 'baseRevision'));
});

test('reads the template catalog, paginated versions, and a specific version', async () => {
	const catalog = {
		templates: [
			{
				id: 'invoice',
				name: summary.name,
				path: [summary.name],
				latestRevision: 3,
				studioUrl: summary.studioUrl,
			},
		],
	};
	const versionPage = {
		versions: [{ ...summary, title: null }],
		latest: summary,
		selected: summary,
		page: 2,
		pageSize: 1,
		total: 2,
		pages: 2,
	};
	for (const [node, parameters, path, response] of [
		[BitavuListTemplates, { templateId: '' }, '/v1/templates', catalog],
		[
			BitavuListTemplateVersions,
			{ versionOptions: { page: 2, pageSize: 1, selectedRevision: 3 } },
			'/v1/templates/invoice/versions?summary=true&page=2&pageSize=1&revision=3',
			versionPage,
		],
		[
			BitavuGetTemplateVersion,
			{ templateRevision: { __rl: true, mode: 'list', value: '3' } },
			'/v1/templates/invoice?revision=3',
			template,
		],
	]) {
		const items = [{ json: { ref: 'fixture' }, binary: { incoming: { data: 'c2FtcGxl' } } }];
		const e = execution({ node, items, parameters, response: jsonResponse(response) });
		const [[result]] = await e.run();
		const { options } = e.calls[0];
		assert.equal(options.url, 'https://api.bitavu.com' + path);
		assert.equal(options.method, 'GET');
		assert.equal(options.headers.Accept, 'application/json');
		assert.equal(options.disableFollowRedirect, true);
		assert.equal(options.body, undefined);
		assert.equal(result.json.ref, 'fixture');
		assert.deepEqual(result.json.bitavu, response);
		assert.deepEqual(result.binary, items[0].binary);
		assert.deepEqual(result.pairedItem, { item: 0 });
		assert.equal(e.binaries.length, 0);
	}
});

test('marks only the currently published version in list output', async () => {
	const versions = [
		{ ...summary, revision: 4, title: 'New draft' },
		{ ...summary, revision: 3, title: 'Approved' },
	];
	for (const publishedRevision of [3, null]) {
		const page = {
			versions,
			latest: versions[0],
			selected: null,
			publishedRevision,
			page: 1,
			pageSize: 10,
			total: 2,
			pages: 1,
		};
		const e = execution({ node: BitavuListTemplateVersions, response: jsonResponse(page) });
		const [[result]] = await e.run();
		assert.deepEqual(result.json.bitavu, {
			...page,
			versions: [
				{ ...versions[0], published: false },
				{ ...versions[1], published: publishedRevision === 3 },
			],
		});
	}
});

test('saves example JSON with an expected version and surfaces stale-version conflicts', async () => {
	const parameters = {
		expectedRevision: 2,
		exampleJson: JSON.stringify(template.exampleJson),
	};
	const e = execution({ node: BitavuSaveTemplateExample, parameters, response: jsonResponse(template, 201) });
	const [[result]] = await e.run();
	const { options } = e.calls[0];
	assert.equal(options.method, 'POST');
	assert.equal(options.url, 'https://api.bitavu.com/v1/templates/invoice/example');
	assert.deepEqual(JSON.parse(options.body), {
		expectedRevision: 2,
		exampleJson: template.exampleJson,
	});
	assert.equal(options.headers['Idempotency-Key'], undefined);
	assert.deepEqual(result.json.bitavu, template);
	assert.equal(result.binary, undefined);

	const stale = execution({
		node: BitavuSaveTemplateExample,
		parameters,
		response: jsonResponse({ code: 'TEMPLATE_REVISION_CONFLICT', message: 'DO_NOT_EXPOSE' }, 409),
	});
	await assert.rejects(stale.run(), (error) => {
		assert.match(error.message, /latest saved version/);
		assert.equal(error.context.bitavu.code, 'TEMPLATE_REVISION_CONFLICT');
		assert.doesNotMatch(JSON.stringify(error), /DO_NOT_EXPOSE/);
		return true;
	});
	assert.equal(stale.calls.length, 1);
});

test('returns actionable compatibility, permission and retry errors with safe diagnostics', async () => {
	for (const [node, parameters, code, status, message] of [
		[Bitavu, { versionSelection: 'latest-published' }, 'JSON_COMPATIBILITY', 409, /incompatible/],
		[Bitavu, { versionSelection: 'latest-published' }, 'NOT_PUBLISHED', 404, /Publish a saved version/],
		[BitavuListTemplates, {}, 'KEY_SCOPE', 403, /Read templates/],
		[
			BitavuSaveTemplateExample,
			{ expectedRevision: 1, exampleJson: {} },
			'KEY_SCOPE',
			403,
			/Save template examples/,
		],
		[Bitavu, {}, 'API_VERSION_LIMIT', 429, /rolling saved-version limit/],
	]) {
		const e = execution({
			node,
			parameters,
			continueOnFail: true,
			response: jsonResponse(
				{ code, message: 'DO_NOT_EXPOSE', details: { input: 'DO_NOT_EXPOSE' } },
				status,
				{ 'X-Bitavu-Request-Id': requestId, 'Retry-After': '2' },
			),
		});
		const [[result]] = await e.run();
		assert.match(result.json.error, message);
		assert.deepEqual(result.json.bitavu, { status, code, requestId, retryAfterMs: 2000 });
		assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE/);
	}
});

test('rejects invalid template parameters and malformed JSON success responses', async () => {
	for (const [node, parameters] of [
		[Bitavu, { versionSelection: 'latest-published', revision: 0 }],
		[Bitavu, { options: { mappingId: '   ' } }],
		[BitavuGetTemplateVersion, { templateRevision: 0 }],
		[BitavuListTemplateVersions, { versionOptions: { pageSize: 51 } }],
		[BitavuListTemplateVersions, { versionOptions: { selectedRevision: 0 } }],
		[BitavuSaveTemplateExample, { expectedRevision: 1, exampleJson: [] }],
		[BitavuSaveTemplateExample, { expectedRevision: Number.MAX_SAFE_INTEGER, exampleJson: {} }],
		[BitavuSaveTemplateExample, { expectedRevision: 1, exampleJson: { toJSON: () => [] } }],
	]) {
		const e = execution({ node, parameters });
		await assert.rejects(e.run());
		assert.equal(e.calls.length, 0);
	}
	const e = execution({
		node: BitavuGetTemplateVersion,
		parameters: { templateRevision: 3 },
		response: jsonResponse({ ...template, bindings: null }),
	});
	await assert.rejects(e.run(), /unexpected template response/);
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
