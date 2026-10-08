import type { INodeType, INodeTypeDescription, NodeConnectionType } from 'n8n-workflow';

/**
 * Formward actions node.
 *
 * Declarative-style: each operation maps to a GET against the Formward REST API,
 * authenticated with the Formward API credential (Authorization: Bearer <key>).
 *
 * Operations:
 *   - List Forms       GET /forms
 *   - Get Form         GET /forms/{formId}
 *   - List Submissions GET /forms/{formId}/submissions  (limit/status/since/before)
 *
 * The API wraps every payload in `{ data: ... }`; we unwrap to `data` so the
 * node outputs the bare form/submission objects.
 */
export class Formward implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formward',
		name: 'formward',
		icon: 'file:formward.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read forms and submissions from Formward, the EU-hosted form backend',
		defaults: {
			name: 'Formward',
		},
		inputs: ['main' as NodeConnectionType],
		outputs: ['main' as NodeConnectionType],
		credentials: [
			{
				name: 'formwardApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Form',
						value: 'form',
					},
					{
						name: 'Submission',
						value: 'submission',
					},
				],
				default: 'form',
			},

			// ---- Form operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['form'],
					},
				},
				options: [
					{
						name: 'List Forms',
						value: 'listForms',
						action: 'List forms',
						description: 'List every form in any organization your key can access',
						routing: {
							request: {
								method: 'GET',
								url: '/forms',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: { property: 'data' },
									},
								],
							},
						},
					},
					{
						name: 'Get Form',
						value: 'getForm',
						action: 'Get a form',
						description: 'Get a single form by id, including its submission count',
						routing: {
							request: {
								method: 'GET',
								url: '=/forms/{{$parameter["formId"]}}',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: { property: 'data' },
									},
								],
							},
						},
					},
				],
				default: 'listForms',
			},

			// ---- Submission operations ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['submission'],
					},
				},
				options: [
					{
						name: 'List Submissions',
						value: 'listSubmissions',
						action: 'List submissions for a form',
						description: 'List a form submissions, newest first',
						routing: {
							request: {
								method: 'GET',
								url: '=/forms/{{$parameter["formId"]}}/submissions',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: { property: 'data' },
									},
								],
							},
						},
					},
				],
				default: 'listSubmissions',
			},

			// ---- formId param (Get Form + List Submissions) ----
			{
				displayName: 'Form ID',
				name: 'formId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['form'],
						operation: ['getForm'],
					},
				},
				description: 'The id of the form to fetch',
			},
			{
				displayName: 'Form ID',
				name: 'formId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['submission'],
						operation: ['listSubmissions'],
					},
				},
				description: 'The id of the form whose submissions to list',
			},

			// ---- List Submissions filters ----
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['submission'],
						operation: ['listSubmissions'],
					},
				},
				description: 'Max number of submissions to return (1-100)',
				routing: {
					request: {
						qs: {
							limit: '={{$value}}',
						},
					},
				},
			},
			{
				displayName: 'Additional Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['submission'],
						operation: ['listSubmissions'],
					},
				},
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: 'received',
						description: 'Only return submissions with this status',
						options: [
							{ name: 'Received', value: 'received' },
							{ name: 'Processed', value: 'processed' },
							{ name: 'Spam', value: 'spam' },
							{ name: 'Held', value: 'held' },
							{ name: 'Failed', value: 'failed' },
						],
						routing: {
							request: {
								qs: {
									status: '={{$value}}',
								},
							},
						},
					},
					{
						displayName: 'Since',
						name: 'since',
						type: 'dateTime',
						default: '',
						description: 'Only return submissions at or after this time (ISO date)',
						routing: {
							request: {
								qs: {
									since: '={{$value}}',
								},
							},
						},
					},
					{
						displayName: 'Before (Cursor)',
						name: 'before',
						type: 'string',
						default: '',
						description:
							'Pagination cursor: return rows strictly older than this position. Use the nextBefore value from a previous page.',
						routing: {
							request: {
								qs: {
									before: '={{$value}}',
								},
							},
						},
					},
				],
			},
		],
	};
}
