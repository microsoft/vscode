/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';

const fileSystemRootsMetaKey = 'vscode.fileSystemRoots';

function isFileSystemRoot(uri: URI): boolean {
	return uri.scheme === Schemas.file && !uri.authority && !uri.query && !uri.fragment
		&& (uri.path === '/' || /^\/[a-zA-Z]:\/$/.test(uri.path));
}

/** Optional filesystem-root navigation hints, not client-issued access grants. */
export function readAgentHostFileSystemRoots(peer: { readonly _meta?: Record<string, unknown> } | undefined): URI[] {
	const value = peer?._meta?.[fileSystemRootsMetaKey];
	if (!Array.isArray(value) || value.length > 26) {
		return [];
	}
	const roots: URI[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') {
			return [];
		}
		let uri: URI;
		try {
			uri = URI.parse(entry, true);
		} catch {
			return [];
		}
		if (!isFileSystemRoot(uri)) {
			return [];
		}
		roots.push(uri);
	}
	return roots;
}

export function getAgentHostFileSystemRootsMeta(roots: readonly URI[]): Record<string, unknown> {
	const values = [...new Set(roots.filter(isFileSystemRoot).map(root => root.toString()))];
	return values.length ? { [fileSystemRootsMetaKey]: values } : {};
}
