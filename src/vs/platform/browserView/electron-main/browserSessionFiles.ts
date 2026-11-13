/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { IBrowserViewRemoteNetwork } from '../common/browserView.js';

/** What sessions on a remote network may read from the remote's file system. */
export interface IRemoteFileTrust {
	readonly roots: ReadonlySet<string>;
	readonly trustAll: boolean;
	/** The scheme the remote's files are read with: `vscode-remote` or `vscode-agent-host`. */
	readonly scheme: string;
	readonly caseSensitive: boolean;
}

/** The key under which a remote network's trust is stored. Authorities are case-insensitive. */
export function toRemoteTrustKey(authority: string): string {
	return authority.toLowerCase();
}

/**
 * Merges what every window contributes for each remote network, keyed by {@link toRemoteTrustKey}.
 * A window only contributes to the networks it is connected to.
 */
export function computeRemoteFileTrust(windows: Iterable<{ readonly [authority: string]: IBrowserViewRemoteNetwork } | undefined>): Map<string, IRemoteFileTrust> {
	const roots = new Map<string, Set<string>>();
	const remotes = new Map<string, { trustAll: boolean; scheme: string; caseSensitive: boolean }>();
	for (const networks of windows) {
		for (const [authority, network] of Object.entries(networks ?? {})) {
			const key = toRemoteTrustKey(authority);
			const remote = remotes.get(key) ?? { trustAll: false, scheme: network.scheme, caseSensitive: network.caseSensitive };
			remote.trustAll ||= network.trustAllFiles;
			remote.caseSensitive &&= network.caseSensitive;
			remotes.set(key, remote);
			const remoteRoots = roots.get(key) ?? new Set<string>();
			// Backslashes are separators to the trusted root tree, so a root containing one would authorize other directories.
			network.trustedRoots.filter(root => normalizeRemoteFilePath(root) !== undefined).forEach(root => remoteRoots.add(root));
			roots.set(key, remoteRoots);
		}
	}
	return new Map([...remotes].map(([key, remote]) => [key, { ...remote, roots: roots.get(key)! }]));
}

/** The tree that decides whether a normalized remote path is inside one of the trusted roots. */
export function createRemoteRootTree(roots: Iterable<string>, caseSensitive: boolean): TernarySearchTree<string, true> {
	const tree = TernarySearchTree.forPaths<true>(!caseSensitive);
	for (const root of roots) {
		if (root) {
			tree.set(posix.normalize(root), true);
		}
	}
	return tree;
}

/**
 * Normalizes the path of a remote `file:` request for both authorization and reading.
 * Returns `undefined` for paths containing backslashes, which are separators on Windows remotes
 * but not for the POSIX normalization and trusted root comparison.
 */
export function normalizeRemoteFilePath(path: string): string | undefined {
	return path.includes('\\') ? undefined : posix.normalize(path);
}
