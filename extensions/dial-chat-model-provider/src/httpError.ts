import axios from 'axios';
import { type Readable } from 'stream';
import { isRecord, type JsonValue } from './runtimeGuards';
import { type Nullable } from './types';

/** Anything that {@link readHttpResponseBody} may produce. */
export type HttpResponseBody = Nullable<JsonValue>;

function isReadable(data: unknown): data is Readable {
	return (
		typeof data === 'object' &&
		data !== null &&
		'pipe' in data &&
		typeof (data as { pipe: unknown }).pipe === 'function'
	);
}

/** Consume axios response body (string / object / stream) into a JSON-friendly value. */
export async function readHttpResponseBody(data: unknown): Promise<HttpResponseBody> {
	if (data === null || data === undefined) {
		return undefined;
	}
	if (typeof data === 'string') {
		return data;
	}
	if (isReadable(data)) {
		const chunks: Buffer[] = [];
		for await (const chunk of data as AsyncIterable<Buffer | string>) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const text = Buffer.concat(chunks).toString('utf8');
		try {
			return JSON.parse(text) as JsonValue;
		} catch {
			return text;
		}
	}
	if (typeof data === 'number' || typeof data === 'boolean') {
		return data;
	}
	if (isRecord(data) || Array.isArray(data)) {
		// `data` came from axios JSON-parsing an HTTP response. We round-trip it through
		// JSON.stringify/parse so the resulting value is structurally a `JsonValue`
		// (no Date/Symbol/etc. sneaking in via casts).
		try {
			return JSON.parse(JSON.stringify(data)) as JsonValue;
		} catch {
			return undefined;
		}
	}
	return String(data);
}

export function formatErrorBody(body: HttpResponseBody): string {
	if (body === null || body === undefined) {
		return '(empty response body)';
	}
	if (typeof body === 'string') {
		return body.slice(0, 4000);
	}
	if (isRecord(body)) {
		const errorField = body.error;
		if (isRecord(errorField) && typeof errorField.message === 'string') {
			const parts = [errorField.message];
			if (typeof errorField.type === 'string') {
				parts.push(`type=${errorField.type}`);
			}
			if (typeof errorField.code === 'string') {
				parts.push(`code=${errorField.code}`);
			}
			return parts.join(' ');
		}
	}
	try {
		return JSON.stringify(body).slice(0, 4000);
	} catch {
		return String(body);
	}
}

/** Whether an HTTP error is likely temporary (retry later, keep the session). */
export function isTransientHttpError(detail: string): boolean {
	const lower = detail.toLowerCase();
	return (
		lower.includes('http 502') ||
		lower.includes('http 503') ||
		lower.includes('http 504') ||
		lower.includes('http 429') ||
		lower.includes('http unknown') ||
		lower.includes('(empty response body)') ||
		lower.includes('econnrefused') ||
		lower.includes('econnreset') ||
		lower.includes('etimedout') ||
		lower.includes('socket hang up') ||
		lower.includes('timeout') ||
		lower.includes('network error')
	);
}

/** Axios/network failure with no HTTP status or response payload (proxy reset, queue timeout). */
export function isEmptyResponseBodyError(detail: string): boolean {
	return detail.toLowerCase().includes('(empty response body)');
}

/** Format axios and other errors for logs and user-facing messages. */
export async function formatHttpError(error: unknown): Promise<string> {
	if (axios.isAxiosError(error)) {
		const status = error.response?.status;
		const body = await readHttpResponseBody(error.response?.data);
		const detail = formatErrorBody(body);
		const method = error.config?.method?.toUpperCase() ?? 'REQUEST';
		const url = error.config?.url ?? '';
		return `${method} ${url} failed (HTTP ${status ?? 'unknown'}): ${detail}`;
	}
	return error instanceof Error ? error.message : String(error);
}
