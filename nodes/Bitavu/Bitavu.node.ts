import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
import {
	bitavuListSearch,
	bitavuNodeDefaults,
	executeBitavu,
	templatePicker,
	versionPicker,
} from './BitavuAction';

export class Bitavu implements INodeType {
	description: INodeTypeDescription = {
		...bitavuNodeDefaults,
		displayName: 'Generate PDF',
		name: 'bitavu',
		icon: { light: 'file:bitavu.svg', dark: 'file:bitavu.svg' },
		usableAsTool: undefined,
		subtitle: '',
		description: 'Generate a PDF from a saved Bitavu template and workflow data',
		defaults: { name: 'Generate PDF' },
		properties: [
			templatePicker,
			{
				displayName: 'Version Selection',
				name: 'versionSelection',
				type: 'options',
				options: [
					{
						name: 'Pinned',
						value: 'pinned',
						description: 'Render a specific saved version',
					},
					{
						name: 'Latest Published',
						value: 'latest-published',
						description: 'Render the current publication if its JSON contract is compatible',
					},
				],
				default: 'pinned',
			},
			{
				displayName: 'Pinned Version',
				name: 'revision',
				...versionPicker,
				displayOptions: { show: { versionSelection: ['pinned'] } },
				description: 'The saved version to render. Defaults to version 1.',
			},
			{
				displayName: 'Base Version',
				name: 'revision',
				...versionPicker,
				displayOptions: {
					show: { versionSelection: ['latest-published'] },
				},
				description:
					'Optional tested version for the compatibility check. Leave empty to use the first published version.',
			},
			{
				displayName: 'Document Data',
				name: 'data',
				type: 'json',
				required: true,
				default: '={{ $json.data }}',
				description:
					'The JSON object expected by your template or saved mapping. Use an expression to pass data from a previous step.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Base Version',
						name: 'baseRevision',
						type: 'hidden',
						default: null,
					},
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
						displayName: 'Mapping ID',
						name: 'mappingId',
						type: 'string',
						default: '',
						description: 'The ID of a saved Bitavu mapping for your incoming JSON fields',
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

	methods = { listSearch: bitavuListSearch };

	async execute(this: IExecuteFunctions) {
		return await executeBitavu.call(this, 'generate');
	}
}
