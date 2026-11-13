/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { IBrowserViewRemoteNetwork } from '../common/browserView.js';

/** What sessions on a remote network may read from the remote's file system. */
export interface IRemoteFileAccess {
	/** The trusted folders, as normalized paths. Looks paths up with the remote's case rules. */
	readonly roots: TernarySearchTree<string, true>;
	readonly trustAllFiles: boolean;
	/** The scheme the remote's files are read with: `vscode-remote` or `vscode-agent-host`. */
	readonly scheme: string;
	readonly caseSensitive: boolean;
}

/** The key under which a remote network's trust is stored. Authorities are case-insensitive. */
export function toRemoteFileAccessKey(authority: string): string {
	return authority.toLowerCase();
}

/**
 * Merges what every window contributes for each remote network, keyed by {@link toRemoteFileAccessKey}.
 * A window only contributes to the networks it is connected to.
 */
export function computeRemoteFileAccess(windows: Iterable<{ readonly [authority: string]: IBrowserViewRemoteNetwork } | undefined>): Map<string, IRemoteFileAccess> {
	const merged = new Map<string, { roots: Set<string>; trustAllFiles: boolean; scheme: string; caseSensitive: boolean }>();
	for (const networks of windows) {
		for (const [authority, network] of Object.entries(networks ?? {})) {
			const key = toRemoteFileAccessKey(authority);
			const remote = merged.get(key) ?? { roots: new Set<string>(), trustAllFiles: false, scheme: network.scheme, caseSensitive: network.caseSensitive };
			remote.trustAllFiles ||= network.trustAllFiles;
			remote.caseSensitive &&= network.caseSensitive;
			for (const root of network.trustedRoots) {
				// Roots with backslashes are dropped: they are separators to the tree, so one would authorize other directories.
				const normalized = normalizeRemoteFilePath(root);
				if (normalized) {
					remote.roots.add(normalized);
				}
			}
			merged.set(key, remote);
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
