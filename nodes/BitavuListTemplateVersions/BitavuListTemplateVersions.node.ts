import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
import {
	bitavuListSearch,
	bitavuNodeDefaults,
	executeBitavu,
	templatePicker,
} from '../Bitavu/BitavuAction';

export class BitavuListTemplateVersions implements INodeType {
	description: INodeTypeDescription = {
		...bitavuNodeDefaults,
		displayName: 'List Template Versions',
		icon: { light: 'file:../Bitavu/bitavu.svg', dark: 'file:../Bitavu/bitavu.svg' },
		usableAsTool: undefined,
		subtitle: '',
		name: 'bitavuListTemplateVersions',
		description: 'List saved versions of a Bitavu template and identify the current publication',
		defaults: { name: 'List Template Versions' },
		properties: [
			templatePicker,
			{
				displayName: 'Options',
				name: 'versionOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 1, maxValue: 10000, numberPrecision: 0 },
						description: 'The page of saved versions, starting at 1',
					},
					{
						displayName: 'Page Size',
						name: 'pageSize',
						type: 'number',
						default: 10,
						typeOptions: { minValue: 1, maxValue: 50, numberPrecision: 0 },
						description: 'How many versions to return per page',
					},
					{
						displayName: 'Selected Version',
						name: 'selectedRevision',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 1, numberPrecision: 0 },
						description: 'Include this version’s summary even if it is on a different page',
					},
				],
			},
		],
	};

	methods = { listSearch: { searchTemplates: bitavuListSearch.searchTemplates } };

	async execute(this: IExecuteFunctions) {
		return await executeBitavu.call(this, 'listVersions');
	}
}
