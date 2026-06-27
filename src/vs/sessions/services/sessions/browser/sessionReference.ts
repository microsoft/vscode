/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

/**
 * Marker value carried by a session-reference attachment. Used so the
 * `#session` completion can attach a chosen session as a context pill, and the
 * sessions management service can later resolve it back to a session resource
 * (e.g. to inject the session's event-log path for `/troubleshoot`).
 *
 * The value is intentionally NOT a {@link URI} or `Location` so the attachment
 * renders with its display title rather than the session resource's basename.
 */
interface ISessionReferenceVariableValue {
	readonly sessionReference: true;
	/** The referenced session's resource URI, serialized via {@link URI.toString}. */
	readonly sessionResource: string;
}

/**
 * Whether the given attachment is a `#session` reference produced by
 * {@link createSessionReferenceVariableEntry}.
 */
export function isSessionReferenceVariableEntry(entry: IChatRequestVariableEntry): boolean {
	const value = entry.value;
	return !!value
		&& typeof value === 'object'
		&& (value as ISessionReferenceVariableValue).sessionReference === true
		&& typeof (value as ISessionReferenceVariableValue).sessionResource === 'string';
}

/**
 * Resolves the referenced session's resource URI from a session-reference
 * attachment, or `undefined` if the entry is not a session reference.
 */
export function getSessionReferenceResource(entry: IChatRequestVariableEntry): URI | undefined {
	if (!isSessionReferenceVariableEntry(entry)) {
		return undefined;
	}
	try {
		return URI.parse((entry.value as ISessionReferenceVariableValue).sessionResource);
	} catch {
		return undefined;
	}
}

/**
 * Builds a context attachment that references another session by its resource.
 *
 * @param rawId The session's raw id, used to form a stable attachment id.
 * @param name The display title shown on the attachment pill.
 * @param sessionResource The referenced session's resource URI.
 */
export function createSessionReferenceVariableEntry(rawId: string, name: string, sessionResource: URI): IChatRequestVariableEntry {
	return {
		kind: 'generic',
		id: `session:${rawId}`,
		name,
		value: { sessionReference: true, sessionResource: sessionResource.toString() } satisfies ISessionReferenceVariableValue,
	};
}
