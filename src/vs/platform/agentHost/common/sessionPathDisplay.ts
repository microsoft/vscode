/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix, win32 } from '../../../base/common/path.js';
import { isEqual, type IExtUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';

/** A verified storage root and its current owning session, in the same URI space as the displayed resource. */
export interface ISessionPathRoot {
	readonly root: URI;
	readonly session: URI;
	readonly title?: string;
}

export interface ISessionPathDisplay {
	readonly label: string;
	readonly fullPath: string;
	readonly session?: URI;
	readonly isCurrentSession?: boolean;
	readonly relativePath?: string;
}

/**
 * Produces plain text for a session-owned path without changing its original spelling or authorization target.
 * Supply verified roots with current ownership, and resolve resources and roots into the same URI space.
 * Comparison semantics belong to the originating host, not necessarily the UI's OS. Missing or conflicting
 * ownership (or a missing other-session title) preserves the raw path. Consumers must escape the label.
 */
export function getSessionPathDisplay(fullPath: string, resource: URI, currentSession: URI, roots: readonly ISessionPathRoot[], extUri: IExtUri): ISessionPathDisplay {
	const fallback: ISessionPathDisplay = { label: fullPath, fullPath };
	if ((!posix.isAbsolute(fullPath) && !win32.isAbsolute(fullPath)) || !resource.path.startsWith('/')) {
		return fallback;
	}

	const normalized = extUri.normalizePath(resource);
	const matches = roots.filter(candidate => extUri.isEqualOrParent(normalized, extUri.normalizePath(candidate.root)));
	if (!matches.length || matches.some(candidate => !isEqual(candidate.session, matches[0].session))) {
		return fallback;
	}
	const match = matches.reduce((closest, candidate) => candidate.root.path.length > closest.root.path.length ? candidate : closest);
	const isCurrentSession = isEqual(match.session, currentSession);
	if (!isCurrentSession && !match.title?.trim()) {
		return fallback;
	}
	// Use the validated prefix rather than case-sensitive POSIX relative-path math.
	const relativePath = normalized.path.slice(extUri.normalizePath(match.root).path.length).replace(/^\//, '');
	const sessionLabel = isCurrentSession
		? localize('sessionPath.thisSession', "This session")
		: localize('sessionPath.namedSession', "Session \"{0}\"", match.title);
	return {
		label: relativePath ? localize('sessionPath.relative', "{0} / {1}", sessionLabel, relativePath) : sessionLabel,
		fullPath,
		session: match.session,
		isCurrentSession,
		relativePath,
	};
}
