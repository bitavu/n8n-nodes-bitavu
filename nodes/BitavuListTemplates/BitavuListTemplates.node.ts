import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { bitavuNodeDefaults, executeBitavu } from '../Bitavu/BitavuAction';

export class BitavuListTemplates implements INodeType {
	description: INodeTypeDescription = {
		...bitavuNodeDefaults,
		displayName: 'List Templates',
		icon: { light: 'file:../Bitavu/bitavu.svg', dark: 'file:../Bitavu/bitavu.svg' },
		usableAsTool: undefined,
		subtitle: '',
		name: 'bitavuListTemplates',
		description: 'List the Bitavu templates accessible to your API key',
		defaults: { name: 'List Templates' },
		properties: [],
	};

	async execute(this: IExecuteFunctions) {
		return await executeBitavu.call(this, 'listTemplates');
	}
}
