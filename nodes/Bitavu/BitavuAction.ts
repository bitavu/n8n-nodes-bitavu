import { createHash } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeProperties,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	hasMediaType,
	isCatalog,
	isRecord,
	isTemplateRevision,
	isVersionPage,
	parseJson,
	readPositiveHeader,
	readRequestId,
	requestBitavu,
} from './BitavuApi';

type Invalid = (message: string) => never;
type OperationResult = { bitavu: IDataObject; binary?: INodeExecutionData['binary'] };

export const bitavuNodeDefaults = {
	group: ['transform'],
	version: 1,
	inputs: [NodeConnectionTypes.Main],
	outputs: [NodeConnectionTypes.Main],
	credentials: [{ name: 'bitavuApi', required: true }],
} satisfies Pick<
	INodeTypeDescription,
	'group' | 'version' | 'inputs' | 'outputs' | 'credentials'
>;

type BitavuOperation =
	| 'generate'
	| 'listTemplates'
	| 'listVersions'
	| 'getTemplate'
	| 'saveExample';

export const templatePicker: INodeProperties = {
	displayName: 'Template',
	name: 'templateId',
	type: 'resourceLocator',
	required: true,
	default: { mode: 'id', value: '' },
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'invoice',
		},
	],
	description:
		'Choose an accessible template with Read templates permission, or enter a template ID or expression',
};
export const versionPicker: Pick<INodeProperties, 'type' | 'default' | 'typeOptions' | 'modes'> = {
	type: 'resourceLocator',
	default: { mode: 'number', value: '' },
	typeOptions: { loadOptionsDependsOn: ['templateId'] },
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchVersions' },
		},
		{
			displayName: 'By Number',
			name: 'number',
			type: 'string',
			placeholder: '1',
		},
	],
};

const templateNameOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const bitavuListSearch = {
	async searchVersions(
		this: ILoadOptionsFunctions,
		_filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		const templateId = locatorValue(this.getCurrentNodeParameter('templateId'));
		if (typeof templateId !== 'string' || !validTemplateId.test(templateId.trim())) {
			throw new NodeOperationError(this.getNode(), 'Select a template to list its saved versions.');
		}
		const page = paginationToken === undefined ? 1 : Number(paginationToken);
		if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
			throw new NodeOperationError(this.getNode(), 'Invalid template version page.');
		}
		const response = await requestBitavu(this, undefined, {
			path: `/v1/templates/${templateId.trim()}/versions?summary=true&page=${page}&pageSize=50`,
			permission: 'Read templates',
		});
		const value = hasMediaType(response, 'application/json') ? parseJson(response.body) : undefined;
		if (!isVersionPage(value)) {
			throw new NodeOperationError(this.getNode(), 'Bitavu returned an unexpected version list.');
		}
		return {
			results: [...value.versions]
				.sort((a, b) => b.revision - a.revision)
				.map(({ revision, title }) => {
					const publication = revision === value.publishedRevision ? ' (Published)' : '';
					return {
						name: `Version ${revision}${publication}${title ? ` - ${title}` : ''}`,
						value: String(revision),
					};
				}),
			...(value.page < value.pages ? { paginationToken: String(value.page + 1) } : {}),
		};
	},
	async searchTemplates(this: ILoadOptionsFunctions, filter = ''): Promise<INodeListSearchResult> {
		const response = await requestBitavu(this, undefined, {
			path: '/v1/templates',
			permission: 'Read templates',
		});
		const value = hasMediaType(response, 'application/json') ? parseJson(response.body) : undefined;
		if (!isCatalog(value)) {
			throw new NodeOperationError(this.getNode(), 'Bitavu returned an unexpected template list.');
		}
		const search = filter.trim().toLowerCase();
		return {
			results: value.templates
				.filter((entry) =>
					[entry.id, entry.name, ...entry.path].some((label) =>
						label.toLowerCase().includes(search),
					),
				)
				.map((entry) => ({
					name: entry.path.join(' / ') || entry.name,
					value: entry.id,
				}))
				.sort((a, b) => templateNameOrder.compare(a.name, b.name) || a.value.localeCompare(b.value, 'en')),
		};
	},
};
export async function executeBitavu(
	this: IExecuteFunctions,
	operation: BitavuOperation,
): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const output: INodeExecutionData[] = [];
	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		try {
			const invalid: Invalid = (message) => {
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			};
			const result: OperationResult =
				operation === 'generate'
					? await generatePdf(this, itemIndex, invalid)
					: { bitavu: await runTemplateOperation(this, itemIndex, operation, invalid) };
			const item = items[itemIndex];
			const binary = result.binary ? { ...item.binary, ...result.binary } : item.binary;
			output.push({
				json: { ...item.json, bitavu: result.bitavu },
				...(binary ? { binary } : {}),
				pairedItem: { item: itemIndex },
			});
		} catch (error) {
			const knownError = error instanceof NodeApiError || error instanceof NodeOperationError;
			const message = knownError
				? error.message
				: 'The Bitavu operation failed. Check the node configuration.';
			if (!this.continueOnFail()) {
				if (error instanceof NodeApiError) {
					const apiError = new NodeApiError(
						this.getNode(),
						{ message },
						{
							message,
							description: error.description ?? undefined,
							httpCode: error.httpCode ?? undefined,
							itemIndex,
						},
					);
					apiError.context.bitavu = error.context.bitavu;
					throw apiError;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
			output.push({
				json: {
					error: message,
					...(error instanceof NodeApiError ? { bitavu: error.context.bitavu } : {}),
				},
				pairedItem: { item: itemIndex },
			});
		}
	}
	return [output];
}
const validTemplateId = /^[A-Za-z0-9_-]{1,80}$/;

function locatorValue(parameter: unknown): unknown {
	return isRecord(parameter) && parameter.__rl === true ? parameter.value : parameter;
}

function versionValue(parameter: unknown): unknown {
	const raw = locatorValue(parameter);
	if (typeof raw !== 'string') return raw;
	const value = raw.trim();
	if (!value) return null;
	return /^\d+$/.test(value) ? Number(value) : value;
}

function templateIdParameter(
	context: IExecuteFunctions,
	itemIndex: number,
	invalid: Invalid,
): string {
	// Older workflows store a string or an expression under the same parameter name.
	const value = locatorValue(context.getNodeParameter('templateId', itemIndex));
	const id = typeof value === 'string' ? value.trim() : '';
	if (!validTemplateId.test(id)) invalid('Enter a valid Template ID from Bitavu Integrations.');
	return id;
}

function integer(
	value: unknown,
	name: string,
	invalid: Invalid,
	maximum = Number.MAX_SAFE_INTEGER,
): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
		return invalid(
			maximum === Number.MAX_SAFE_INTEGER
				? `${name} must be a positive integer.`
				: `${name} must be an integer from 1 to ${maximum}.`,
		);
	}
	return value;
}

function jsonObject(raw: unknown, name: string, invalid: Invalid): IDataObject {
	const value = typeof raw === 'string' ? parseJson(raw) : raw;
	if (!isRecord(value)) invalid(`${name} must be a valid JSON object.`);
	let serialized: unknown;
	try {
		serialized = parseJson(JSON.stringify(value));
	} catch {
		// A workflow expression can supply a value JSON cannot encode.
	}
	if (!isRecord(serialized)) return invalid(`${name} must be serializable as a JSON object.`);
	return serialized as IDataObject;
}

async function generatePdf(
	context: IExecuteFunctions,
	itemIndex: number,
	invalid: Invalid,
): Promise<OperationResult> {
	const templateId = templateIdParameter(context, itemIndex, invalid);
	const selection = context.getNodeParameter('versionSelection', itemIndex, 'pinned');
	if (selection !== 'pinned' && selection !== 'latest-published')
		invalid('Choose Pinned or Latest Published for Version Selection.');
	const options = context.getNodeParameter('options', itemIndex, {});
	const selectedVersion = versionValue(context.getNodeParameter('revision', itemIndex, null));
	const revision =
		selection === 'latest-published'
			? selection
			: integer(selectedVersion ?? 1, 'Pinned Version', invalid);
	const data = jsonObject(context.getNodeParameter('data', itemIndex), 'Document Data', invalid);
	const body: IDataObject = { templateId, revision, data };
	const baseVersion = selectedVersion ?? options.baseRevision;
	if (selection === 'latest-published' && baseVersion != null) {
		body.baseRevision = integer(baseVersion, 'Base Version', invalid);
	}
	if (options.mappingId !== undefined && options.mappingId !== '') {
		const mappingId = options.mappingId;
		if (typeof mappingId !== 'string' || !mappingId.trim())
			return invalid('Mapping ID must be a non-empty string.');
		body.mappingId = mappingId.trim();
	}

	const outputField = String(options.outputField || 'pdf');
	if (
		!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(outputField) ||
		['__proto__', 'constructor', 'prototype'].includes(outputField)
	)
		invalid('Output Binary Field must be a simple field name, such as pdf.');
	const fileName = String(options.fileName || `${templateId}.pdf`).trim();
	if (
		!fileName ||
		/[/\\]/.test(fileName) ||
		[...fileName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
		!fileName.toLowerCase().endsWith('.pdf')
	)
		invalid('File Name must end in .pdf and contain no path separators or control characters.');

	// Keep IDs stable across retries of the same item, including loop iterations.
	const operationId = String(
		options.operationId ||
			`bitavu-${createHash('sha256')
				.update(
					JSON.stringify([
						context.getExecutionId(),
						context.getNode().id,
						context.evaluateExpression('{{ $runIndex }}', itemIndex),
						itemIndex,
					]),
				)
				.digest('hex')}`,
	);
	if (!/^[a-zA-Z0-9_-]{16,128}$/.test(operationId))
		invalid('Operation ID must contain 16–128 letters, digits, underscores or hyphens.');

	const response = await requestBitavu(context, itemIndex, {
		path: '/v1/render',
		permission: 'Generate PDFs',
		body,
		idempotencyKey: operationId,
	});
	if (
		response.statusCode !== 200 ||
		!hasMediaType(response, 'application/pdf') ||
		!response.body.subarray(0, 5).equals(Buffer.from('%PDF-'))
	)
		invalid('Bitavu returned an unexpected response instead of a PDF.');
	const binary = await context.helpers.prepareBinaryData(
		response.body,
		fileName,
		'application/pdf',
	);
	return {
		bitavu: {
			templateId,
			revision:
				readPositiveHeader(response, 'x-bitavu-revision') ??
				(typeof revision === 'number' ? revision : null),
			requestedRevision: revision,
			pageCount: readPositiveHeader(response, 'x-bitavu-pages'),
			requestId: readRequestId(response),
			operationId,
			fileName,
			outputField,
		},
		binary: { [outputField]: binary },
	};
}

async function runTemplateOperation(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: Exclude<BitavuOperation, 'generate'>,
	invalid: Invalid,
): Promise<IDataObject> {
	let path = '/v1/templates';
	let body: IDataObject | undefined;
	let validate: (value: unknown) => boolean = isCatalog;
	if (operation !== 'listTemplates') {
		path += '/' + templateIdParameter(context, itemIndex, invalid);
		switch (operation) {
			case 'getTemplate': {
				const revision = integer(
					versionValue(context.getNodeParameter('templateRevision', itemIndex)),
					'Version to Read',
					invalid,
				);
				path += '?revision=' + revision;
				validate = isTemplateRevision;
				break;
			}
			case 'listVersions': {
				const options = context.getNodeParameter('versionOptions', itemIndex, {}) as IDataObject;
				const page = integer(options.page ?? 1, 'Page', invalid, 10000);
				const pageSize = integer(options.pageSize ?? 10, 'Page Size', invalid, 50);
				const query = new URLSearchParams({
					summary: 'true',
					page: String(page),
					pageSize: String(pageSize),
				});
				if (options.selectedRevision !== undefined) {
					query.set(
						'revision',
						String(integer(options.selectedRevision, 'Selected Version', invalid)),
					);
				}
				path += '/versions?' + query;
				break;
			}
			case 'saveExample':
				path += '/example';
				body = {
					expectedRevision: integer(
						context.getNodeParameter('expectedRevision', itemIndex),
						'Expected Version',
						invalid,
						Number.MAX_SAFE_INTEGER - 1,
					),
					exampleJson: jsonObject(
						context.getNodeParameter('exampleJson', itemIndex),
						'Example JSON',
						invalid,
					),
				};
				validate = isTemplateRevision;
				break;
		}
	}
	const response = await requestBitavu(context, itemIndex, {
		path,
		permission: body === undefined ? 'Read templates' : 'Save template examples',
		body,
	});
	const value = hasMediaType(response, 'application/json') ? parseJson(response.body) : undefined;
	if (operation === 'listVersions') {
		if (!isVersionPage(value)) invalid('Bitavu returned an unexpected template response.');
		if (value.publishedRevision === undefined) return value;
		return {
			...value,
			versions: value.versions.map((version) => ({
				...version,
				published: version.revision === value.publishedRevision,
			})),
		};
	}
	if (!validate(value)) invalid('Bitavu returned an unexpected template response.');
	return value as IDataObject;
}
