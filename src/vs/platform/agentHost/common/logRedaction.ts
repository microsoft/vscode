/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHeaders } from '../../../base/parts/request/common/request.js';

/* Redaction of signed URLs before anything reaches a log: Azure Storage SAS queries are credentials, and URLs, headers and error messages may echo them. */

/** Query parameters that carry signed-URL credentials (Azure Storage SAS, user delegation keys, response overrides). */
const SIGNED_QUERY_PARAMETERS = ['sig', 'se', 'sp', 'sv', 'skoid', 'sktid', 'skt', 'ske', 'sks', 'skv', 'st', 'sr', 'srt', 'ss', 'spr', 'rscd', 'rsct', 'rscc', 'rsce', 'rscl', 'saoid', 'suoid', 'scid', 'sdd', 'ses'];

const SIGNED_QUERY_PARAMETER_NAMES = new Set(SIGNED_QUERY_PARAMETERS);

/** A signed-URL parameter (key and value) as a whole token anywhere in text, also in a relative URL or outside any URL. */
const SIGNED_PARAMETER = new RegExp(`(^|[^A-Za-z0-9_-])(?:${SIGNED_QUERY_PARAMETERS.join('|')})=[^&#\\s"'<>()]*`, 'gi');
const SIGNED_PARAMETER_TEST = new RegExp(SIGNED_PARAMETER.source, 'i');

/** An absolute URL that has a query or fragment. */
const URL_WITH_QUERY = /\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>()]+[?#][^\s"'<>()]*/gi;

/** The userinfo (`user:password@`) of an absolute URL. */
const URL_USERINFO = /\b(?<scheme>[a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'<>()]+@/gi;
const URL_USERINFO_TEST = new RegExp(URL_USERINFO.source, 'i');

/** An absolute URL: its scheme, optional userinfo, host (with port) and the rest. */
const ABSOLUTE_URL = /\b(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?:[^\s/?#@"'<>()]*@)?(?<host>[^\s/?#"'<>()]*)[^\s"'<>()]*/gi;

/** A token (between query, list and quoting delimiters) holding a percent escape: checked in its decoded forms. */
const PERCENT_ENCODED_TOKEN = /[^\s&?#;"'<>()]*%[0-9a-f]{2}[^\s&?#;"'<>()]*/gi;

/** Decoding rounds for nested percent-encoding (`%2573ig` is `%73ig` is `sig`). */
const PERCENT_DECODE_MAX_ROUNDS = 3;

/** Response headers whose value is (or holds) a URL; their query is always removed. */
const URL_VALUED_HEADERS = new Set(['location', 'content-location', 'refresh', 'link']);

/** `url` (absolute or relative) without its query and fragment; `?<redacted>` marks that one was removed. Pure. */
export function redactUrlForLog(url: string): string {
	const query = url.search(/[?#]/);
	return query < 0 ? url : `${url.slice(0, query)}?<redacted>`;
}

/** `text` with every ASCII percent escape decoded once; malformed or non-ASCII escapes stay as they are, and it never throws. Pure. */
function percentDecodeAsciiOnce(text: string): string {
	return text.replace(/%[0-9a-f]{2}/gi, escape => {
		const code = parseInt(escape.slice(1), 16);
		return code < 0x80 ? String.fromCharCode(code) : escape;
	});
}

/** `text` and its percent-decoded forms, at most {@link PERCENT_DECODE_MAX_ROUNDS} rounds, until stable. Pure. */
function percentDecodedForms(text: string): string[] {
	const forms = [text];
	for (let round = 0; round < PERCENT_DECODE_MAX_ROUNDS; round++) {
		const next = percentDecodeAsciiOnce(forms[forms.length - 1]);
		if (next === forms[forms.length - 1]) {
			break;
		}
		forms.push(next);
	}
	return forms;
}

/** Whether `text` parses as an absolute URL whose query has a signed-URL parameter name (case-insensitive, as `URL` decodes it). Pure. */
function hasSignedSearchParameter(text: string): boolean {
	const candidate = text.trim();
	if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) || !/[?]/.test(candidate)) {
		return false;
	}
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return false;
	}
	for (const key of url.searchParams.keys()) {
		if (SIGNED_QUERY_PARAMETER_NAMES.has(key.trim().toLowerCase())) {
			return true;
		}
	}
	return false;
}

/** Whether `text` holds a signed-URL parameter anywhere, also percent-encoded (nested up to three times) or as a parsed query name in any case. Pure. */
export function hasSignedUrlParameter(text: string): boolean {
	return percentDecodedForms(text).some(form => SIGNED_PARAMETER_TEST.test(form) || hasSignedSearchParameter(form));
}

/** Whether `text` holds an absolute URL with userinfo (`https://user:password@host`), also percent-encoded. Pure. */
export function hasUrlUserinfo(text: string): boolean {
	return percentDecodedForms(text).some(form => URL_USERINFO_TEST.test(form));
}

/**
 * Free text with the query of every absolute URL and the userinfo of every URL removed, and every remaining signed-URL
 * parameter, or token whose decoded form holds one, replaced by `<redacted>`. Pure.
 */
export function redactSecretsInText(text: string): string {
	return text
		.replace(URL_WITH_QUERY, match => redactUrlForLog(match))
		.replace(URL_USERINFO, '$<scheme><redacted>@')
		.replace(SIGNED_PARAMETER, '$1<redacted>')
		.replace(PERCENT_ENCODED_TOKEN, token => hasSignedUrlParameter(token) || hasUrlUserinfo(token) ? '<redacted>' : token);
}

/** Free text with every absolute URL reduced to its origin, then redacted as text; for shared infrastructure logs that would otherwise echo download URLs. Pure. */
export function originsOnlyForLog(text: string): string {
	return redactSecretsInText(text.replace(ABSOLUTE_URL, (...args: unknown[]) => {
		const groups = args[args.length - 1] as { readonly scheme: string; readonly host: string };
		return `${groups.scheme}://${groups.host}`;
	}));
}

/** Bounds of {@link containsCredential}: values nested deeper or larger than this count as credential-bearing. */
const CREDENTIAL_SCAN_MAX_DEPTH = 8;
const CREDENTIAL_SCAN_MAX_NODES = 10_000;

/**
 * Whether `value` holds credential-like text (a signed-URL parameter or a URL with userinfo) in any string, array item
 * or object key; fails closed beyond the scan bounds. The check at every Agent Host storage boundary of the on-device
 * model code, so no SAS URL or token is persisted. Pure.
 */
export function containsCredential(value: unknown): boolean {
	let budget = CREDENTIAL_SCAN_MAX_NODES;
	const isCredentialText = (text: string) => hasSignedUrlParameter(text) || hasUrlUserinfo(text);
	const visit = (item: unknown, depth: number): boolean => {
		if (--budget < 0) {
			return true;
		}
		if (typeof item === 'string') {
			return isCredentialText(item);
		}
		if (!item || typeof item !== 'object') {
			return false;
		}
		if (depth >= CREDENTIAL_SCAN_MAX_DEPTH) {
			return true;
		}
		if (Array.isArray(item)) {
			return item.some(child => visit(child, depth + 1));
		}
		return Object.entries(item).some(([key, child]) => isCredentialText(key) || visit(child, depth + 1));
	};
	return visit(value, 0);
}

/** `items` without those that hold a credential ({@link containsCredential}), and how many were dropped. Pure. */
export function dropCredentialItems<T>(items: readonly T[]): { readonly kept: T[]; readonly dropped: number } {
	const kept = items.filter(item => !containsCredential(item));
	return { kept, dropped: items.length - kept.length };
}

/** `record` without the entries whose key or value holds a credential ({@link containsCredential}), and how many were dropped. Pure. */
export function dropCredentialEntries<T>(record: Readonly<Record<string, T>>): { readonly kept: Record<string, T>; readonly dropped: number } {
	const entries = Object.entries(record);
	const kept = entries.filter(([key, value]) => !containsCredential(key) && !containsCredential(value));
	return { kept: Object.fromEntries(kept), dropped: entries.length - kept.length };
}

/** Logs (without any of the dropped content) that `dropped` invalid or credential-bearing entries were left out of `store`. */
export function reportDroppedStorageEntries(log: { warn(message: string): void } | undefined, store: string, dropped: number): void {
	if (dropped > 0) {
		log?.warn(`[LocalModel] Dropped ${dropped} invalid or credential-bearing ${dropped === 1 ? 'entry' : 'entries'} from ${store}`);
	}
}

/** A copy of `headers` for logs: URL-valued headers lose their query and every other value is redacted as text. Pure. */
export function redactHeadersForLog(headers: IHeaders): IHeaders {
	const result: IHeaders = Object.create(null);
	for (const [name, value] of Object.entries(headers)) {
		const redact = (item: string) => URL_VALUED_HEADERS.has(name.toLowerCase()) ? redactUrlForLog(item) : redactSecretsInText(item);
		result[name] = typeof value === 'string' ? redact(value) : Array.isArray(value) ? value.map(redact) : value;
	}
	return result;
}

const LOGGABLE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;

/** The code, or else the name, of a thrown value for logs; never its message, which may hold a URL or a path. Pure. */
export function errorCodeForLog(error: unknown): string {
	const code = error && typeof error === 'object' ? (error as { readonly code?: unknown }).code : undefined;
	if (typeof code === 'string' && LOGGABLE_CODE.test(code)) {
		return code;
	}
	if (typeof code === 'number' && Number.isSafeInteger(code)) {
		return String(code);
	}
	return error instanceof Error && LOGGABLE_CODE.test(error.name) ? error.name : 'error';
}

/**
 * Whether `value` may serve as a registry identifier: `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` with no signed-URL parameter.
 * The one check for every identifier read from a registry, cache, foreign manifest or persisted state. Pure.
 */
export function isSafeRegistryIdentifier(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) && !hasSignedUrlParameter(value);
}

/** One of our own identifiers for a log line when it passes {@link isSafeRegistryIdentifier}, else `placeholder`; registry free text is never logged. Pure. */
export function identifierForLog(value: unknown, placeholder = '<family>'): string {
	return isSafeRegistryIdentifier(value) ? value : placeholder;
}
