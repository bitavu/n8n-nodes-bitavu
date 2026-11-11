import { createHash } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const endpoint = 'https://api.bitavu.com/v1/render';
const messages: Record<string, string> = {
	INVALID_API_KEY: 'Your API key is invalid, expired or revoked. Check your Bitavu credential.',
	KEY_REPORT: 'This key cannot access the report. Grant it access in Bitavu Integrations.',
	KEY_SCOPE: 'Enable Generate PDFs permission for this key in Bitavu Integrations.',
	IDEMPOTENCY_CONFLICT:
		'This operation ID was already used with different data. Use a new ID for a new document.',
	API_VERSION_LIMIT:
		'This report reached its rolling saved-version limit. Use a previously tested version or wait for the limit to reset.',
};

export class Bitavu implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bitavu',
		name: 'bitavu',
		icon: { light: 'file:bitavu.svg', dark: 'file:bitavu.svg' },
		group: ['transform'],
		version: 1,
		// The SDK represents disabled tool generation with undefined; PDF binary
		// output remains a regular workflow result rather than an AI text tool.
		usableAsTool: undefined,
		subtitle: '={{$parameter["operation"] === "generate" ? "Generate PDF" : ""}}',
		description: 'Generate PDFs from visual templates and JSON data',
		defaults: { name: 'Bitavu' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'bitavuApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'document' },
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generate PDF',
						value: 'generate',
						description: 'Fill a saved visual template with JSON data',
						action: 'Generate a PDF',
					},
				],
				default: 'generate',
			},
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'invoice',
				description:
					'Copy templateId from your saved report in Bitavu Integrations → Use in your app',
			},
			{
				displayName: 'Saved Version',
				name: 'revision',
				type: 'number',
				required: true,
				default: 1,
				typeOptions: { minValue: 1, numberPrecision: 0 },
				description:
					'The numeric revision of the saved report. Keep the tested version pinned so layout changes do not change your automation.',
			},
			{
				displayName: 'Document Data',
				name: 'data',
				type: 'json',
				required: true,
				default: '={{ $json.data }}',
				description:
					'The JSON object expected by your template. Map incoming fields or use an expression such as the entire incoming item.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						placeholder: 'invoice.pdf',
						description:
							'Name for the generated PDF. Defaults to the template ID followed by .pdf.',
					},
					{
						displayName: 'Operation ID',
						name: 'operationId',
						type: 'string',
						default: '',
						description:
							'Optional idempotency key: 16–128 letters, digits, underscores or hyphens. Reuse only for retries with identical input. Automatic IDs stay stable for retries within the same execution; retries in a new execution need an upstream ID.',
					},
					{
						displayName: 'Output Binary Field',
						name: 'outputField',
						type: 'string',
						default: 'pdf',
						description: 'The binary field containing the PDF for the next node',
					},
				],
			},
		],
	};

	// Programmatic execution keeps each item's binary output and pairing together,
	// validates PDF bytes and builds retry-stable IDs from execution/node/run/item.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const templateId = (this.getNodeParameter('templateId', itemIndex) as string).trim();
				const revision = this.getNodeParameter('revision', itemIndex) as number;
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
				const raw = this.getNodeParameter('data', itemIndex);
				let data: unknown;
				try {
					data = typeof raw === 'string' ? JSON.parse(raw) : raw;
				} catch {
					throw new NodeOperationError(this.getNode(), 'Document Data must be valid JSON.', {
						itemIndex,
					});
				}
				const invalid = (message: string): never => {
					throw new NodeOperationError(this.getNode(), message, { itemIndex });
				};
				if (!/^[a-zA-Z0-9_-]{1,80}$/.test(templateId))
					invalid('Enter a valid Template ID from Bitavu Integrations.');
				if (!Number.isSafeInteger(revision) || revision < 1)
					invalid('Saved Version must be a positive integer.');
				if (!data || typeof data !== 'object' || Array.isArray(data))
					invalid(
						'Document Data must be a JSON object, rather than an array or a primitive value.',
					);
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
					invalid(
						'File Name must end in .pdf and contain no path separators or control characters.',
					);
				const operationId = String(
					options.operationId ||
						`bitavu-${createHash('sha256')
							.update(
								JSON.stringify([
									this.getExecutionId(),
									this.getNode().id,
									this.evaluateExpression('{{ $runIndex }}', itemIndex),
									itemIndex,
								]),
							)
							.digest('hex')}`,
				);
				if (!/^[a-zA-Z0-9_-]{16,128}$/.test(operationId))
					invalid('Operation ID must contain 16–128 letters, digits, underscores or hyphens.');
				let response;
				try {
					response = await this.helpers.httpRequestWithAuthentication.call(this, 'bitavuApi', {
						method: 'POST',
						url: endpoint,
						headers: {
							'Idempotency-Key': operationId,
							Accept: 'application/pdf',
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ templateId, revision, data }),
						encoding: 'arraybuffer',
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
						disableFollowRedirect: true,
						timeout: 120000,
					});
				} catch {
					throw new NodeOperationError(
						this.getNode(),
						'Could not reach Bitavu. Check your credential and network connection. Retry with the same operation ID if the result is uncertain.',
						{ itemIndex },
					);
				}
				const body = Buffer.isBuffer(response.body)
					? response.body
					: Buffer.from(response.body ?? '');
				if (response.statusCode !== 200) {
					let details: Record<string, unknown> = {};
					try {
						details = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
					} catch {
						/* Never echo raw API responses or request data. */
					}
					const code =
						typeof details.code === 'string' && /^[A-Z0-9_]+$/.test(details.code)
							? details.code
							: '';
					const message =
						messages[code] ||
						(response.statusCode === 401
							? messages.INVALID_API_KEY
							: response.statusCode === 429
								? 'Bitavu is limiting requests or your render allowance is exhausted. Check your subscription and respect Retry-After before retrying.'
								: response.statusCode === 403
									? 'The key or workspace does not permit this render. Check report access and your subscription.'
									: [400, 404, 422].includes(response.statusCode)
										? 'Check the Template ID, saved version and document fields against your tested Bitavu request.'
										: 'Bitavu could not generate the PDF. Retry later with the same operation ID.');
					throw new NodeApiError(
						this.getNode(),
						{ message, code, statusCode: response.statusCode },
						{ message, httpCode: String(response.statusCode), itemIndex },
					);
				}
				if (
					!String(response.headers['content-type'] || '').includes('application/pdf') ||
					!body.subarray(0, 5).equals(Buffer.from('%PDF-'))
				)
					invalid(
						'Bitavu returned an unexpected response instead of a PDF. Contact support with the execution reference.',
					);
				const binary = await this.helpers.prepareBinaryData(body, fileName, 'application/pdf');
				output.push({
					json: {
						...items[itemIndex].json,
						bitavu: { templateId, revision, operationId, fileName, outputField },
					},
					binary: { ...items[itemIndex].binary, [outputField]: binary },
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (!this.continueOnFail()) {
					if (error instanceof NodeApiError)
						throw new NodeApiError(
							this.getNode(),
							{ message: error.message },
							{ message: error.message, httpCode: error.httpCode ?? undefined, itemIndex },
						);
					throw new NodeOperationError(
						this.getNode(),
						error instanceof NodeOperationError
							? error.message
							: 'Bitavu PDF generation failed. Check the node configuration.',
						{ itemIndex },
					);
				}
				output.push({
					json: { error: error instanceof Error ? error.message : 'Bitavu PDF generation failed.' },
					pairedItem: { item: itemIndex },
				});
			}
		}
		return [output];
	}
}
