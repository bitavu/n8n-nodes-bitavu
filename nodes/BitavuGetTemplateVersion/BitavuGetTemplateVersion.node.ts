import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
import {
	bitavuListSearch,
	bitavuNodeDefaults,
	executeBitavu,
	templatePicker,
	versionPicker,
} from '../Bitavu/BitavuAction';

export class BitavuGetTemplateVersion implements INodeType {
	description: INodeTypeDescription = {
		...bitavuNodeDefaults,
		displayName: 'Get Template Version',
		icon: { light: 'file:../Bitavu/bitavu.svg', dark: 'file:../Bitavu/bitavu.svg' },
		usableAsTool: undefined,
		subtitle: '',
		name: 'bitavuGetTemplateVersion',
		description: 'Read a saved Bitavu template version, its bindings, and example JSON',
		defaults: { name: 'Get Template Version' },
		properties: [
			templatePicker,
			{
				...versionPicker,
				displayName: 'Version to Read',
				name: 'templateRevision',
				default: { mode: 'number', value: '1' },
				required: true,
				description: 'The saved version to read',
			},
		],
	};

	methods = { listSearch: bitavuListSearch };

	async execute(this: IExecuteFunctions) {
		return await executeBitavu.call(this, 'getTemplate');
	}
}
