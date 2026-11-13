/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { IBrowserViewNetworkFileSystem, IBrowserViewRemoteNetwork } from '../common/browserView.js';

/** What sessions on a remote network may read from the remote's file system. */
export interface IRemoteFileAccess extends IBrowserViewNetworkFileSystem {
	/** The trusted folders, as normalized paths. Looks paths up with the remote's case rules. */
	readonly roots: TernarySearchTree<string, true>;
	readonly trustAllFiles: boolean;
}

/**
 * Merges what every window contributes for each remote network, keyed by network authority.
 * A window only contributes to the networks it is connected to.
 */
export function computeRemoteFileAccess(windows: Iterable<{ readonly [authority: string]: IBrowserViewRemoteNetwork } | undefined>): Map<string, IRemoteFileAccess> {
	const merged = new Map<string, { roots: Set<string>; trustAllFiles: boolean; scheme: string; caseSensitive: boolean }>();
	for (const networks of windows) {
		for (const [authority, network] of Object.entries(networks ?? {})) {
			const remote = merged.get(authority) ?? { roots: new Set<string>(), trustAllFiles: false, scheme: network.scheme, caseSensitive: network.caseSensitive };
			remote.trustAllFiles ||= network.trustAllFiles;
			remote.caseSensitive &&= network.caseSensitive;
			for (const root of network.trustedRoots) {
				// Roots with backslashes are dropped: they are separators to the tree, so one would authorize other directories.
				const normalized = normalizeRemoteFilePath(root);
				if (normalized === '/') {
					// The tree's prefix matching does not match descendants of an empty root segment.
					remote.trustAllFiles = true;
				} else if (normalized) {
					remote.roots.add(normalized);
				}
			}
			merged.set(authority, remote);
		}
	}
	return new Map([...merged].map(([key, { roots, ...remote }]) => {
		const tree = TernarySearchTree.forPaths<true>(!remote.caseSensitive);
		roots.forEach(root => tree.set(root, true));
		return [key, { ...remote, roots: tree }];
	}));
}

/**
 * Normalizes the path of a remote `file:` request for both authorization and reading.
 * Returns `undefined` for paths containing backslashes, which are separators on Windows remotes
 * but not for the POSIX normalization and trusted root comparison.
 */
export function normalizeRemoteFilePath(path: string): string | undefined {
	return path.includes('\\') ? undefined : posix.normalize(path);
}

/**
 * Returns the normalized path of a remote `file:` request if the remote's file access allows it, otherwise `undefined`.
 * The caller must serve the returned path, so `..` segments cannot escape the trusted roots.
 * A file authority names a network share, which is not on the remote's own disk, so it is never allowed.
 */
export function authorizeRemoteFilePath(access: IRemoteFileAccess, uri: URI): string | undefined {
	const path = normalizeRemoteFilePath(uri.path);
	if (uri.authority || path === undefined || (!access.trustAllFiles && !access.roots.findSubstr(path))) {
		return undefined;
	}
	return path;
}
