import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

const origin = 'https://api.bitavu.com';
const messages: Record<string, string> = {
	INVALID_API_KEY: 'Your API key is invalid, expired or revoked. Check your Bitavu credential.',
	KEY_REPORT: 'This key cannot access the template. Grant it access in Bitavu Integrations.',
	NOT_PUBLISHED: 'Publish a saved version in Bitavu Studio before using Latest Published.',
	JSON_COMPATIBILITY:
		'The published version is incompatible with your base version or saved mapping. Review the JSON contract in Studio or pin a tested version.',
	TEMPLATE_REVISION_CONFLICT:
		'The template changed. Get the latest saved version and check its bindings before saving the example again.',
	IDEMPOTENCY_CONFLICT:
		'This operation ID was already used with different input. Use a new ID for a new document.',
	API_VERSION_LIMIT:
		'This template reached its rolling saved-version limit. Use a previously rendered version or wait for the limit to reset.',
};

interface BitavuResponse {
	body: Buffer;
	headers: Record<string, unknown>;
	statusCode: number;
}

type Permission = 'Generate PDFs' | 'Read templates' | 'Save template examples';

interface BitavuRequest {
	path: string;
	permission: Permission;
	body?: IDataObject;
	idempotencyKey?: string;
}

type RequestContext = IExecuteFunctions | ILoadOptionsFunctions;

interface TemplateCatalog {
	templates: Array<{ id: string; name: string; path: string[] }>;
}

interface TemplateVersionPage extends IDataObject {
	versions: Array<{ revision: number; title: string | null }>;
	publishedRevision?: number | null;
	page: number;
	pages: number;
}

export async function requestBitavu(
	context: RequestContext,
	itemIndex: number | undefined,
	{ path, permission, body, idempotencyKey }: BitavuRequest,
): Promise<BitavuResponse> {
	const headers: IDataObject = {
		Accept: permission === 'Generate PDFs' ? 'application/pdf' : 'application/json',
	};
	const request: IHttpRequestOptions = {
		method: body === undefined ? 'GET' : 'POST',
		url: origin + path,
		headers,
		encoding: 'arraybuffer',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		disableFollowRedirect: true,
		timeout: 120000,
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		request.body = JSON.stringify(body);
	}
	if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

	let response;
	try {
		response = await context.helpers.httpRequestWithAuthentication.call(
			context,
			'bitavuApi',
			request,
		);
	} catch {
		const guidance = {
			'Generate PDFs': ' Retry with the same operation ID if the result is uncertain.',
			'Read templates': '',
			'Save template examples': ' Check the latest saved version before retrying the save.',
		}[permission];
		throw new NodeOperationError(
			context.getNode(),
			'Could not complete the Bitavu request. Check your credential and network connection.' +
				guidance,
			{ itemIndex },
		);
	}

	const result: BitavuResponse = {
		body: Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body ?? ''),
		headers: response.headers ?? {},
		statusCode: response.statusCode,
	};
	if (result.statusCode < 200 || result.statusCode >= 300) {
		throw apiError(context, itemIndex, result, permission);
	}
	return result;
}

function apiError(
	context: RequestContext,
	itemIndex: number | undefined,
	response: BitavuResponse,
	permission: Permission,
): NodeApiError {
	const status = response.statusCode;
	const payload =
		response.body.length <= 65536 && hasMediaType(response, 'application/json')
			? parseJson(response.body)
			: undefined;
	const value = isRecord(payload) ? payload.code : undefined;
	const code =
		typeof value === 'string' &&
		(value === 'KEY_SCOPE' || Object.prototype.hasOwnProperty.call(messages, value))
			? value
			: null;
	const fallback: Record<number, string> = {
		400: 'Check your Bitavu node settings and input against the template.',
		401: messages.INVALID_API_KEY,
		402: 'The workspace cannot complete this request. Check your Bitavu subscription.',
		403: `Check the key’s ${permission} permission and template access in Bitavu Integrations.`,
		404: 'Check the Template ID, version and saved mapping in Bitavu Studio.',
		409: 'Bitavu reported a conflict. Check the template version and input before retrying.',
		422: 'Check the JSON fields and saved mapping against the Bitavu template.',
		429: 'Bitavu is limiting requests or your render allowance is exhausted.',
	};
	const message =
		code === 'KEY_SCOPE'
			? `Enable ${permission} permission for this key in Bitavu Integrations.`
			: (code && messages[code]) || fallback[status] || 'Bitavu could not complete the request.';
	const requestId = readRequestId(response);
	const retryAfter = readHeader(response, 'retry-after');
	const delay = /^\d+$/.test(retryAfter)
		? Number(retryAfter) * 1000
		: Math.max(0, Date.parse(retryAfter) - Date.now());
	const retryAfterMs = Number.isSafeInteger(delay) ? delay : null;
	const description = [
		`Bitavu returned HTTP ${status}${code ? ` (${code})` : ''}.`,
		...(requestId === null ? [] : [`Request ID ${requestId}.`]),
		...(retryAfterMs === null
			? []
			: [`Wait at least ${Math.ceil(retryAfterMs / 1000)} seconds before retrying.`]),
	].join(' ');
	const error = new NodeApiError(
		context.getNode(),
		{ message },
		{ message, description, httpCode: String(status), itemIndex },
	);
	error.context.bitavu = { status, code, requestId, retryAfterMs };
	return error;
}

function readHeader(response: BitavuResponse, name: string): string {
	const entry = Object.entries(response.headers).find(([key]) => key.toLowerCase() === name);
	return typeof entry?.[1] === 'string' ? entry[1].trim() : '';
}

export function hasMediaType(response: BitavuResponse, type: string): boolean {
	return readHeader(response, 'content-type').split(';', 1)[0].trim().toLowerCase() === type;
}

export function readPositiveHeader(response: BitavuResponse, name: string): number | null {
	const value = readHeader(response, name);
	const number = Number(value);
	return /^\d+$/.test(value) && isInteger(number, 1) ? number : null;
}

export function readRequestId(response: BitavuResponse): string | null {
	const id = readHeader(response, 'x-bitavu-request-id');
	return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ? id : null;
}

export function parseJson(value: Buffer | string): unknown {
	try {
		return JSON.parse(value.toString());
	} catch {
		return undefined;
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value: unknown, minimum: number): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isStringList(value: unknown): boolean {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRevisionSummary(value: unknown): value is Record<string, unknown> {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.studioUrl === 'string' &&
		isInteger(value.revision, 1) &&
		(value.createdAt === null || isInteger(value.createdAt, 0)) &&
		(value.updatedAt === null || isInteger(value.updatedAt, 0))
	);
}

function isInputPath(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && typeof value.path === 'string' && typeof value.required === 'boolean';
}

export function isCatalog(value: unknown): value is TemplateCatalog {
	return (
		isRecord(value) &&
		Array.isArray(value.templates) &&
		value.templates.every(
			(entry: unknown) =>
				isRecord(entry) &&
				typeof entry.id === 'string' &&
				typeof entry.name === 'string' &&
				typeof entry.studioUrl === 'string' &&
				isStringList(entry.path) &&
				isInteger(entry.latestRevision, 1),
		)
	);
}

export function isVersionPage(value: unknown): value is TemplateVersionPage {
	return (
		isRecord(value) &&
		Array.isArray(value.versions) &&
		value.versions.every(
			(entry: unknown) =>
				isRevisionSummary(entry) && (entry.title === null || typeof entry.title === 'string'),
		) &&
		isRevisionSummary(value.latest) &&
		(value.publishedRevision == null || isInteger(value.publishedRevision, 1)) &&
		(value.selected === null || isRevisionSummary(value.selected)) &&
		isInteger(value.page, 1) &&
		isInteger(value.pageSize, 1) &&
		isInteger(value.total, 0) &&
		isInteger(value.pages, 0)
	);
}

export function isTemplateRevision(value: unknown): boolean {
	if (!isRevisionSummary(value)) return false;
	const review = value.inputReview;
	return (
		Array.isArray(value.bindings) &&
		value.bindings.every(
			(entry: unknown) => isInputPath(entry) && typeof entry.type === 'string',
		) &&
		(value.exampleJson === null || isRecord(value.exampleJson)) &&
		(review === null ||
			(isRecord(review) &&
				Array.isArray(review.missing) &&
				review.missing.every(isInputPath) &&
				isStringList(review.unused)))
	);
}
