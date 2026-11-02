/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type ModelErrorKind =
	| 'invalid_config'
	| 'auth'
	| 'not_found'
	| 'rate_limit'
	| 'bad_request'
	| 'server'
	| 'network'
	| 'aborted'
	| 'protocol';

/** Every failure the router reports, with a kind the UI can turn into advice. */
export class ModelRouterError extends Error {
	readonly kind: ModelErrorKind;
	readonly status: number | undefined;

	constructor(kind: ModelErrorKind, message: string, status?: number) {
		super(message);
		this.name = 'ModelRouterError';
		this.kind = kind;
		this.status = status;
	}
}

export function kindForStatus(status: number): ModelErrorKind {
	if (status === 401 || status === 403) {
		return 'auth';
	}
	if (status === 404) {
		return 'not_found';
	}
	if (status === 429) {
		return 'rate_limit';
	}
	if (status >= 500) {
		return 'server';
	}
	return 'bad_request';
}

const HINTS: Partial<Record<ModelErrorKind, string>> = {
	auth: 'The API key was rejected.',
	not_found: 'The endpoint or model was not found. Check the URL and the model name.',
	rate_limit: 'The provider is rate-limiting requests. Wait a moment and try again.',
	server: 'The provider had an internal error.',
	bad_request: 'The provider rejected the request.',
};

/** Pulls the provider's own error message out of the common JSON error shapes. */
export function providerMessage(body: unknown): string | undefined {
	if (typeof body === 'string') {
		return body || undefined;
	}
	if (!body || typeof body !== 'object') {
		return undefined;
	}
	const record = body as Record<string, unknown>;
	if (typeof record.message === 'string') {
		return record.message;
	}
	const error = record.error;
	if (typeof error === 'string') {
		return error;
	}
	if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
		return (error as Record<string, unknown>).message as string;
	}
	return undefined;
}

export async function errorFromResponse(response: Response): Promise<ModelRouterError> {
	const kind = kindForStatus(response.status);
	let detail: string | undefined;
	try {
		const text = await response.text();
		try {
			detail = providerMessage(JSON.parse(text));
		} catch {
			detail = text.trim() || undefined;
		}
	} catch {
		// Body unreadable; the status is enough.
	}
	if (detail && detail.length > 500) {
		detail = detail.slice(0, 500) + '…';
	}
	const hint = HINTS[kind] ?? 'The request failed.';
	const message = detail ? `${hint} (HTTP ${response.status}: ${detail})` : `${hint} (HTTP ${response.status})`;
	return new ModelRouterError(kind, message, response.status);
}

export function isAbortError(error: unknown): boolean {
	return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function normalizeError(error: unknown, signal?: AbortSignal): ModelRouterError {
	if (error instanceof ModelRouterError) {
		return error;
	}
	if (signal?.aborted || isAbortError(error)) {
		return new ModelRouterError('aborted', 'The request was cancelled.');
	}
	const message = error instanceof Error ? error.message : String(error);
	return new ModelRouterError('network', `The connection failed: ${message}`);
}
