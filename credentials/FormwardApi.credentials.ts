import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * API-key credential for the Formward REST API.
 *
 * Keys are created in the Formward dashboard at /dashboard/api-keys and carry a
 * least-privilege scope set (forms:read, forms:write, submissions:read,
 * triage:write). For this node you need at least `forms:read` and
 * `submissions:read`.
 *
 * The key is sent as `Authorization: Bearer <apiKey>`. The base URL defaults to
 * the production EU host but is overridable (e.g. a self-hosted instance, or the
 * apex https://formward.eu/api/v1 mirror).
 */
export class FormwardApi implements ICredentialType {
	name = 'formwardApi';

	displayName = 'Formward API';

	documentationUrl = 'https://formward.eu/api/v1/openapi.json';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'API key from the Formward dashboard (/dashboard/api-keys). Needs the forms:read and submissions:read scopes.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://formward.eu/api/v1',
			required: true,
			description:
				'Base URL of the Formward REST API. Defaults to the EU-hosted production API. Override for self-hosted instances.',
		},
	];

	/**
	 * Inject the key as a Bearer token on every authenticated request. This is
	 * the same scheme the API documents (Authorization: Bearer <key>).
	 */
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	/**
	 * Verify the key by listing forms. A valid key with forms:read returns 200;
	 * a bad key returns 401 and n8n surfaces the failure in the UI.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/forms',
			method: 'GET',
		},
	};
}
