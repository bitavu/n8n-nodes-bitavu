import type {
	IAuthenticateGeneric,
	ICredentialType,
	ICredentialTestRequest,
	INodeProperties,
} from 'n8n-workflow';

export class BitavuApi implements ICredentialType {
	name = 'bitavuApi';
	displayName = 'Bitavu API';
	documentationUrl = 'https://bitavu.com/support/n8n';
	icon = {
		light: 'file:../nodes/Bitavu/bitavu.svg',
		dark: 'file:../nodes/Bitavu/bitavu.svg',
	} as const;
	httpRequestNode = {
		name: 'Bitavu',
		docsUrl: 'https://bitavu.com/support/n8n',
		apiBaseUrl: 'https://api.bitavu.com',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A Bitavu key with permission for the selected operation and access to its templates. Paste only the key, without Bearer.',
		},
		{
			displayName: 'Allowed HTTP Request Domains',
			name: 'allowedHttpRequestDomains',
			type: 'hidden',
			default: 'domains',
		},
		{
			displayName: 'Allowed Domains',
			name: 'allowedDomains',
			type: 'hidden',
			default: 'api.bitavu.com',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	// This endpoint verifies authentication only: no report read permission,
	// document data, PDF render or credits are required.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.bitavu.com',
			url: '/v1/credentials/check',
			method: 'GET',
			json: true,
			disableFollowRedirect: true,
			timeout: 15000,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'authenticated',
					value: false,
					message: 'Bitavu did not accept this API key.',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'authenticated',
					value: undefined,
					message: 'Bitavu returned an unexpected credential-check response.',
				},
			},
		],
	};
}
