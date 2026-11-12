/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { IBrowserViewRemoteNetwork } from '../common/browserView.js';

/** What sessions on a remote network may read from the remote's file system. */
export interface IRemoteFileTrust<TRoots = ReadonlySet<string>> {
	readonly roots: TRoots;
	readonly trustAll: boolean;
	/** The scheme the remote's files are read with: `vscode-remote` or `vscode-agent-host`. */
	readonly scheme: string;
	readonly caseSensitive: boolean;
}

/**
 * Merges what every window contributes for each remote network, keyed by lowercase authority.
 * A window only contributes to the networks it is connected to.
 */
export function computeRemoteFileTrust(windows: Iterable<{ readonly [authority: string]: IBrowserViewRemoteNetwork } | undefined>): Map<string, IRemoteFileTrust<Set<string>>> {
	const remotes = new Map<string, IRemoteFileTrust<Set<string>> & { trustAll: boolean; caseSensitive: boolean }>();
	for (const networks of windows) {
		for (const [authority, network] of Object.entries(networks ?? {})) {
			const key = authority.toLowerCase();
			let remote = remotes.get(key);
			if (!remote) {
				remote = { roots: new Set<string>(), trustAll: false, scheme: network.scheme, caseSensitive: network.caseSensitive };
				remotes.set(key, remote);
			}
			remote.trustAll ||= network.trustAllFiles;
			remote.caseSensitive &&= network.caseSensitive;
			for (const root of network.trustedRoots) {
				addRemoteRoot(remote.roots, root);
			}
		}
	}
	return remotes;
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
 * Backslashes are separators to the trusted root tree, so a root containing one would authorize other directories.
 */
function addRemoteRoot(roots: Set<string>, path: string): void {
	if (!path.includes('\\')) {
		roots.add(path);
	}
}

/**
 * Normalizes the path of a remote `file:` request for both authorization and reading.
 * Returns `undefined` for paths containing backslashes, which are separators on Windows remotes
 * but not for the POSIX normalization and trusted root comparison.
 */
export function normalizeRemoteFilePath(path: string): string | undefined {
	return path.includes('\\') ? undefined : posix.normalize(path);
}
