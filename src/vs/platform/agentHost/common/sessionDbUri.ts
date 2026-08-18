/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';

const SESSION_DB_SCHEME = 'session-db';

/**
 * Builds a `session-db:` URI referencing a file-edit content blob in the
 * session database. The path is the edited file's path so resource labels
 * show a real path; the lookup fields live in the query, where `filePath` is
 * kept verbatim because it is part of the database key.
 *
 * Only safe to call on the agent host, since `URI.file` interprets `\` per
 * the operating system it runs on. Clients must use
 * {@link canonicalizeSessionDbUri}, which takes the path from the file URI
 * the host already resolved.
 */
export function buildSessionDbUri(sessionUri: string, toolCallId: string, filePath: string, part: 'before' | 'after'): string {
	return sessionDbUri(URI.file(filePath).path, { sessionUri, toolCallId, filePath, part }).toString();
}

function sessionDbUri(path: string, fields: ISessionDbUriFields): URI {
	return URI.from({ scheme: SESSION_DB_SCHEME, path, query: JSON.stringify(fields) });
}

/** Parsed fields from a `session-db:` content URI. */
export interface ISessionDbUriFields {
	sessionUri: string;
	toolCallId: string;
	filePath: string;
	part: 'before' | 'after';
}

/**
 * Parses a `session-db:` URI produced by {@link buildSessionDbUri}.
 * Returns `undefined` if the URI is not a valid `session-db:` URI.
 */
export function parseSessionDbUri(raw: string): ISessionDbUriFields | undefined {
	let parsed: URI;
	try {
		parsed = URI.parse(raw);
	} catch {
		return undefined;
	}
	if (parsed.scheme !== SESSION_DB_SCHEME) {
		return undefined;
	}
	return parsed.query ? parseSessionDbUriQuery(parsed.query) : parseLegacySessionDbUri(parsed);
}

/**
 * Rewrites a legacy `session-db:` URI so its path is `fileUri`'s, the path of
 * the file the content belongs to. Snapshots recorded by earlier builds encode
 * the blob's location in the path (`/<toolCallId>/<hexFilePath>/<part>/<name>`),
 * which surfaces in resource labels and makes diff editors report the file as
 * renamed because the original side's path differs from the modified side's.
 * Any other URI (already-canonical, unparseable, or a different scheme) is
 * returned unchanged.
 *
 * The path is taken from `fileUri` rather than re-derived from the recorded
 * file system path, so a session recorded on a Windows host canonicalizes the
 * same way on a POSIX client.
 */
export function canonicalizeSessionDbUri(uri: URI, fileUri: URI): URI {
	if (uri.scheme !== SESSION_DB_SCHEME || uri.query) {
		return uri;
	}
	const fields = parseLegacySessionDbUri(uri);
	if (!fields) {
		return uri;
	}
	return sessionDbUri(fileUri.path, fields);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function parseSessionDbUriQuery(query: string): ISessionDbUriFields | undefined {
	let fields: Partial<ISessionDbUriFields>;
	try {
		fields = JSON.parse(query) as Partial<ISessionDbUriFields>;
	} catch {
		return undefined;
	}
	if (typeof fields !== 'object' || fields === null) {
		return undefined;
	}
	const { sessionUri, toolCallId, filePath, part } = fields;
	if (!isNonEmptyString(sessionUri) || !isNonEmptyString(toolCallId) || !isNonEmptyString(filePath) || (part !== 'before' && part !== 'after')) {
		return undefined;
	}
	return { sessionUri, toolCallId, filePath, part };
}

/**
 * Parses the query-less layout used before the fields moved into the query
 * (`session-db://<hexSessionUri>/<toolCallId>/<hexFilePath>/<part>/<basename>`),
 * so snapshots recorded by earlier builds still resolve.
 */
function parseLegacySessionDbUri(uri: URI): ISessionDbUriFields | undefined {
	const [, toolCallId, filePath, part] = uri.path.split('/');
	if (!toolCallId || !filePath || (part !== 'before' && part !== 'after')) {
		return undefined;
	}
	try {
		return {
			sessionUri: decodeHex(uri.authority).toString(),
			toolCallId: decodeURIComponent(toolCallId),
			filePath: decodeHex(filePath).toString(),
			part
		};
	} catch {
		return undefined;
	}
}
