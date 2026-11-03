/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from './state/sessionState.js';

/**
 * Helpers for building / parsing the URI clients subscribe to in order to
 * receive an {@link import('./state/protocol/state.js').AnnotationsState}.
 *
 * Each session exposes exactly one annotations channel, nested under the
 * session URI namespace:
 *
 *     <sessionUri>/annotations
 *
 * Keeping the annotations URI nested under the session URI lets the server
 * cleanly tear down a session's annotations when that session is disposed
 * (the reverse-lookup is just a string-prefix scan, mirroring changesets).
 */

/** Marker injected into an annotations channel URI's path. */
const ANNOTATIONS_PATH_SEGMENT = '/annotations';

/** Returns the subscribable URI for a session's annotations channel. */
export function buildAnnotationsUri(sessionUri: URI): URI {
	return `${sessionUri}${ANNOTATIONS_PATH_SEGMENT}`;
}

/**
 * Parses an annotations channel URI back into its owning `sessionUri`, or
 * returns `undefined` if `uri` is not an annotations channel URI.
 */
export function parseAnnotationsUri(uri: URI): { sessionUri: URI } | undefined {
	if (!uri.endsWith(ANNOTATIONS_PATH_SEGMENT)) {
		return undefined;
	}
	const sessionUri = uri.slice(0, uri.length - ANNOTATIONS_PATH_SEGMENT.length);
	if (!sessionUri) {
		return undefined;
	}
	return { sessionUri };
}

/** Returns `true` iff `uri` is a session's annotations channel URI. */
export function isAnnotationsUri(uri: URI): boolean {
	return parseAnnotationsUri(uri) !== undefined;
}
