import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
import {
	bitavuListSearch,
	bitavuNodeDefaults,
	executeBitavu,
	templatePicker,
} from '../Bitavu/BitavuAction';

export class BitavuSaveTemplateExample implements INodeType {
	description: INodeTypeDescription = {
		...bitavuNodeDefaults,
		displayName: 'Save Template Example',
		icon: { light: 'file:../Bitavu/bitavu.svg', dark: 'file:../Bitavu/bitavu.svg' },
		usableAsTool: undefined,
		subtitle: '',
		name: 'bitavuSaveTemplateExample',
		description: 'Save example JSON as a new Bitavu template version',
		defaults: { name: 'Save Template Example' },
		properties: [
			templatePicker,
			{
				displayName: 'Expected Version',
				name: 'expectedRevision',
				type: 'number',
				required: true,
				default: 1,
				typeOptions: { minValue: 1, numberPrecision: 0 },
				description:
					'The latest saved version you reviewed. Bitavu rejects the save if another version has since been created.',
			},
			{
				displayName: 'Example JSON',
				name: 'exampleJson',
				type: 'json',
				required: true,
				default: '={{ $json.data }}',
				description: 'The JSON object to save as example data in a new template version',
			},
		],
	};

	methods = { listSearch: { searchTemplates: bitavuListSearch.searchTemplates } };

	async execute(this: IExecuteFunctions) {
		return await executeBitavu.call(this, 'saveExample');
	}
}
