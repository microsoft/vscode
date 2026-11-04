/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex, encodeHex, VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';

export const PENDING_EDIT_CONTENT_SCHEME = 'pending-edit-content';

/** Identifies transient proposed file contents without exposing them on the state tree. */
export function buildPendingEditContentUri(sessionUri: string, toolCallId: string, filePath: string): URI {
	return URI.from({
		scheme: PENDING_EDIT_CONTENT_SCHEME,
		authority: encodeHex(VSBuffer.fromString(sessionUri)).toString(),
		path: `/${encodeURIComponent(toolCallId)}/${encodeHex(VSBuffer.fromString(filePath))}`,
	});
}

/** Reads the session binding from a canonical pending-edit content reference. */
export function parsePendingEditContentUri(raw: string): { readonly sessionUri: string } | undefined {
	try {
		const uri = URI.parse(raw);
		const segments = uri.path.split('/');
		if (uri.scheme !== PENDING_EDIT_CONTENT_SCHEME || uri.query || uri.fragment || segments.length !== 3
			|| !segments[1] || !/^(?:[a-f0-9]{2})+$/i.test(uri.authority) || !/^(?:[a-f0-9]{2})+$/i.test(segments[2])) {
			return undefined;
		}
		const sessionUri = decodeHex(uri.authority).toString();
		return sessionUri ? { sessionUri } : undefined;
	} catch {
		return undefined;
	}
}
