/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI as ResourceURI } from '../../../base/common/uri.js';
import type { URI } from './state/sessionState.js';

export const AHP_ANNOTATIONS_SCHEME = 'ahp-annotations';

/** Retained provider-session annotations suffix. */
const ANNOTATIONS_PATH_SEGMENT = '/annotations';
const LEGACY_SESSION_AUTHORITY = 'vscode-legacy';

/** Mints the local host's annotations URI; clients must use the advertised summary resource instead. */
export function buildAnnotationsUri(sessionUri: URI): URI {
	const session = ResourceURI.parse(sessionUri);
	if (session.scheme === 'ahp-session' && !session.authority && !session.query && !session.fragment) {
		return session.with({ scheme: AHP_ANNOTATIONS_SCHEME }).toString();
	}
	return ResourceURI.from({
		scheme: AHP_ANNOTATIONS_SCHEME,
		authority: LEGACY_SESSION_AUTHORITY,
		path: `/${encodeBase64(VSBuffer.fromString(sessionUri), false, true)}`,
	}).toString();
}

/** Reverses this host's minting convention, not an arbitrary remote host's advertised resource. */
export function parseAnnotationsUri(uri: URI): { sessionUri: URI } | undefined {
	try {
		const resource = ResourceURI.parse(uri, true);
		if (resource.scheme === AHP_ANNOTATIONS_SCHEME) {
			if (resource.query || resource.fragment || !resource.path.startsWith('/') || resource.path.length < 2) {
				return undefined;
			}
			if (!resource.authority) {
				return { sessionUri: resource.with({ scheme: 'ahp-session' }).toString() };
			}
			if (resource.authority !== LEGACY_SESSION_AUTHORITY || !/^\/[A-Za-z0-9_-]+$/.test(resource.path)) {
				return undefined;
			}
			const encoded = resource.path.slice(1);
			const sessionUri = decodeBase64(encoded).toString();
			ResourceURI.parse(sessionUri, true);
			return encodeBase64(VSBuffer.fromString(sessionUri), false, true) === encoded ? { sessionUri } : undefined;
		}
	} catch {
		return undefined;
	}
	if (!uri.endsWith(ANNOTATIONS_PATH_SEGMENT)) {
		return undefined;
	}
	const sessionUri = uri.slice(0, uri.length - ANNOTATIONS_PATH_SEGMENT.length);
	if (!sessionUri) {
		return undefined;
	}
	return { sessionUri };
}

/** Recognizes the dedicated annotations scheme without assuming the host's URI convention. */
export function isAhpAnnotationsChannel(uri: URI): boolean {
	try {
		return ResourceURI.parse(uri).scheme === AHP_ANNOTATIONS_SCHEME;
	} catch {
		return false;
	}
}

/** Recognizes annotations resources advertised by current and older hosts. */
export function isAnnotationsUri(uri: URI): boolean {
	return isAhpAnnotationsChannel(uri) || parseAnnotationsUri(uri) !== undefined;
}
