/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';

export interface IFileChange {
	readonly modifiedUri: URI;
	readonly insertions: number;
	readonly deletions: number;
}

type RawDiff = { readonly uri: string; readonly added?: number; readonly removed?: number };

/**
 * Converts agent host diffs to the chat session file change format.
 *
 * @param mapUri Optional URI mapper applied after parsing. The remote agent
 *   host provider uses this to rewrite `file:` URIs into agent-host URIs.
 */
export function diffsToChanges(diffs: readonly RawDiff[], mapUri?: (uri: URI) => URI): IFileChange[] {
	return diffs.map(d => ({
		modifiedUri: mapUri ? mapUri(URI.parse(d.uri)) : URI.parse(d.uri),
		insertions: d.added ?? 0,
		deletions: d.removed ?? 0,
	}));
}

/**
 * Returns `true` when the current file changes already
 * match the incoming raw diffs, avoiding unnecessary observable updates.
 */
export function diffsEqual(current: readonly IFileChange[], raw: readonly RawDiff[], mapUri?: (uri: URI) => URI): boolean {
	if (current.length !== raw.length) {
		return false;
	}
	for (let i = 0; i < current.length; i++) {
		const c = current[i];
		const r = raw[i];
		const rawUri = mapUri ? mapUri(URI.parse(r.uri)) : URI.parse(r.uri);
		if (c.modifiedUri.toString() !== rawUri.toString() || c.insertions !== (r.added ?? 0) || c.deletions !== (r.removed ?? 0)) {
			return false;
		}
	}
	return true;
}
