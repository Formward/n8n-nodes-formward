import type {
	IDataObject,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	JsonObject,
	NodeConnectionType,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/** Shape of a submission as returned by the Formward API (safe field set). */
interface FormwardSubmission extends IDataObject {
	id: string;
	payload: IDataObject;
	status: string;
	createdAt: string;
	spamScore: number | null;
	aiSummary: string | null;
}

interface SubmissionsResponse {
	data: FormwardSubmission[];
	nextBefore: string | null;
}

/**
 * Polling trigger: fires once per new Formward submission.
 *
 * Strategy
 * --------
 * The cursor is the createdAt (ISO) of the newest submission emitted so far,
 * persisted in the node's workflow static data. Each poll requests
 *   GET /forms/{formId}/submissions?since=<cursor>
 * which returns rows at or after the cursor, newest-first.
 *
 * Because `since` is inclusive (>= createdAt) the boundary row is returned again
 * on the next poll, so we drop any rows whose createdAt is <= the stored cursor
 * to avoid re-emitting. Rows are emitted oldest-first (chronological) and the
 * cursor is advanced to the newest createdAt seen.
 *
 * On the very first poll (no cursor) we do not emit historical submissions; we
 * just seed the cursor to "now" so only genuinely new submissions trigger the
 * workflow. In n8n manual-test mode we instead fetch the most recent few so the
 * user sees sample output.
 */
export class FormwardTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formward Trigger',
		name: 'formwardTrigger',
		icon: 'file:formward.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On New Submission: " + $parameter["formId"]}}',
		description: 'Starts a workflow when a Formward form receives a new submission',
		defaults: {
			name: 'Formward Trigger',
		},
		polling: true,
		inputs: [],
		outputs: ['main' as NodeConnectionType],
		credentials: [
			{
				name: 'formwardApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'On New Submission',
						value: 'newSubmission',
						description: 'Triggers when a form receives a new submission',
					},
				],
				default: 'newSubmission',
			},
			{
				displayName: 'Form ID',
				name: 'formId',
				type: 'string',
				required: true,
				default: '',
				description: 'The id of the form to watch for new submissions',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const formId = this.getNodeParameter('formId') as string;
		const baseUrl = ((await this.getCredentials('formwardApi')).baseUrl as string).replace(
			/\/+$/,
			'',
		);

		const staticData = this.getWorkflowStaticData('node');
		const lastCreatedAt = staticData.lastCreatedAt as string | undefined;
		// Ids already emitted AT the boundary (cursor) createdAt. Rows sharing the
		// cursor millisecond are re-fetched because `since` is inclusive; this set
		// lets us emit ones we have not seen yet instead of dropping them all.
		const emittedAtBoundary = Array.isArray(staticData.emittedAtBoundary)
			? (staticData.emittedAtBoundary as string[])
			: [];
		const isManual = this.getMode() === 'manual';

		// Build the request. With a stored cursor, ask only for rows at/after it.
		const qs: IDataObject = { limit: 100 };
		if (lastCreatedAt) {
			qs.since = lastCreatedAt;
		}

		const fetchPage = async (before?: string): Promise<SubmissionsResponse> => {
			const options: IHttpRequestOptions = {
				method: 'GET',
				baseURL: baseUrl,
				url: `/forms/${encodeURIComponent(formId)}/submissions`,
				qs: before ? { ...qs, before } : qs,
				json: true,
			};
			try {
				return (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'formwardApi',
					options,
				)) as SubmissionsResponse;
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		};

		const response = await fetchPage();
		const rows = Array.isArray(response?.data) ? response.data : [];

		// First run with no cursor: seed the cursor and emit nothing (unless this
		// is a manual test, where we surface recent submissions as sample data).
		if (!lastCreatedAt) {
			const newest = rows.length > 0 ? rows[0].createdAt : new Date().toISOString();
			staticData.lastCreatedAt = newest;
			// Seed the boundary set with every row sharing the newest createdAt so
			// the next poll does not re-emit any of them.
			staticData.emittedAtBoundary =
				rows.length > 0 ? rows.filter((r) => r.createdAt === newest).map((r) => r.id) : [];

			if (isManual && rows.length > 0) {
				const sample = [...rows].reverse();
				return [this.helpers.returnJsonArray(sample as IDataObject[])];
			}
			return null;
		}

		// API returns newest-first. Drop anything we've already emitted: when a
		// cursor exists, `since` is inclusive so rows at the cursor millisecond
		// reappear. Keep rows strictly newer than the cursor, plus rows AT the
		// cursor millisecond whose id we have not already emitted (tracked in
		// `emittedAtBoundary`) — otherwise a submission sharing the boundary ms is
		// silently dropped. Follow the `nextBefore` cursor across pages so that if
		// more than one page of new submissions arrived between polls, every new
		// row is emitted instead of being skipped when the stored cursor jumps to
		// the newest row on the first page.
		const cursorMs = new Date(lastCreatedAt).getTime();
		const emittedAtBoundarySet = new Set(emittedAtBoundary);
		const isFresh = (r: FormwardSubmission): boolean => {
			const ms = new Date(r.createdAt).getTime();
			if (ms > cursorMs) return true;
			if (ms === cursorMs) return !emittedAtBoundarySet.has(r.id);
			return false;
		};
		const fresh: FormwardSubmission[] = [];
		let page: SubmissionsResponse | null = response;
		for (;;) {
			const pageRows = Array.isArray(page?.data) ? page.data : [];
			const pageFresh = pageRows.filter(isFresh);
			fresh.push(...pageFresh);
			// Stop once a page is fully at/below the cursor (older rows are already
			// emitted), the page was short (no more rows), or there is no next cursor.
			const nextBefore = page?.nextBefore ?? null;
			if (pageFresh.length < pageRows.length || pageRows.length === 0 || !nextBefore) {
				break;
			}
			page = await fetchPage(nextBefore);
		}

		if (fresh.length === 0) {
			// No new submissions since the cursor — nothing to emit.
			return null;
		}

		// Emit oldest-first so downstream consumers see chronological order, and
		// advance the cursor to the newest createdAt we just emitted.
		const chronological = [...fresh].reverse();
		const newestCreatedAt = fresh[0].createdAt; // fresh[0] is newest (API order)
		staticData.lastCreatedAt = newestCreatedAt;
		// Record the ids of every row sharing the new boundary createdAt so the
		// next poll can re-fetch that millisecond (inclusive `since`) and skip the
		// ones already emitted. When the boundary ms is unchanged from the prior
		// cursor (no strictly-newer rows arrived), carry forward the previously
		// emitted boundary ids too, or they would be re-emitted next poll.
		const newBoundaryIds = fresh.filter((r) => r.createdAt === newestCreatedAt).map((r) => r.id);
		if (new Date(newestCreatedAt).getTime() === cursorMs) {
			staticData.emittedAtBoundary = [...new Set([...emittedAtBoundary, ...newBoundaryIds])];
		} else {
			staticData.emittedAtBoundary = newBoundaryIds;
		}

		return [this.helpers.returnJsonArray(chronological as IDataObject[])];
	}
}
