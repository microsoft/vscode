/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { getOrSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../agentHost/common/agentHostUri.js';
import { IBrowserViewWindowConfiguration } from '../common/browserView.js';

/** What a window contributes to the `file:` requests of sessions on a remote network. */
export interface IRemoteFileTrust<TRoots = ReadonlySet<string>> {
	readonly roots: TRoots;
	readonly trustAll: boolean;
	/** Whether the remote's file system ignores path case, as reported by a window connected to it. */
	readonly ignoreCase: boolean;
	/** The windows that contributed to this remote, in order. The first one that is still open reads its files. */
	readonly windowIds: readonly number[];
	/** The scheme `windowId` reads them with: `vscode-remote` or `vscode-agent-host`. */
	readonly scheme: string;
}

/** The trust a window contributes, and the remote it is connected to, if any. */
export interface IWindowFileTrust extends Pick<IBrowserViewWindowConfiguration, 'trustAllFiles' | 'trustedFileRoots' | 'caseInsensitiveRemoteAuthorities'> {
	readonly windowId: number;
	readonly remoteAuthority: string | undefined;
}

/** The trusted roots of the local file system and of each remote file system (keyed by lowercase authority). */
export interface IFileTrust {
	readonly local: { readonly roots: ReadonlySet<string>; readonly trustAll: boolean };
	readonly remotes: ReadonlyMap<string, IRemoteFileTrust>;
}

/**
 * Splits the trusted roots of all windows by file system. A remote window's roots and trust-all
 * apply only to its own remote, and agent host roots only to that host, read through the windows
 * that contributed them. Only `file:` roots apply to the local file system.
 */
export function computeFileTrust(windows: Iterable<IWindowFileTrust>): IFileTrust {
	const localRoots = new Set<string>();
	let localTrustAll = false;
	const remotes = new Map<string, Mutable<IRemoteFileTrust<Set<string>>>>();
	for (const { windowId, remoteAuthority, trustAllFiles, trustedFileRoots, caseInsensitiveRemoteAuthorities } of windows) {
		const caseInsensitive = new Set(caseInsensitiveRemoteAuthorities.map(authority => authority.toLowerCase()));
		const remoteKey = remoteAuthority?.toLowerCase();
		const remote = remoteKey ? getOrSet(remotes, remoteKey, newRemote(Schemas.vscodeRemote)) : undefined;
		if (remote) {
			addWindow(remote, windowId);
			remote.trustAll ||= trustAllFiles;
		} else {
			localTrustAll ||= trustAllFiles;
		}
		for (const components of trustedFileRoots) {
			const root = URI.revive(components);
			if (root.scheme === Schemas.file) {
				localRoots.add(root.fsPath);
			} else if (remote && root.scheme === Schemas.vscodeRemote && root.authority.toLowerCase() === remoteKey) {
				addRemoteRoot(remote, root.path);
			} else if (root.scheme === AGENT_HOST_SCHEME) {
				const original = fromAgentHostUri(root);
				// A root with an authority (`file://server/share`) is not a path on the host's own file system.
				if (original.scheme === Schemas.file && !original.authority) {
					const hostRemote = getOrSet(remotes, root.authority.toLowerCase(), newRemote(AGENT_HOST_SCHEME));
					addWindow(hostRemote, windowId);
					addRemoteRoot(hostRemote, original.path);
				}
			}
		}
		for (const authority of caseInsensitive) {
			const known = remotes.get(authority);
			if (known) {
				known.ignoreCase = true;
			}
		}
	}
	return { local: { roots: localRoots, trustAll: localTrustAll }, remotes };
}

function newRemote(scheme: string): Mutable<IRemoteFileTrust<Set<string>>> {
	return { roots: new Set<string>(), trustAll: false, ignoreCase: false, windowIds: [], scheme };
}

function addWindow(remote: Mutable<IRemoteFileTrust<Set<string>>>, windowId: number): void {
	if (!remote.windowIds.includes(windowId)) {
		remote.windowIds = [...remote.windowIds, windowId];
	}
}

/** Backslashes are separators to the trusted root tree, so a root containing one would authorize other directories. */
function addRemoteRoot(remote: Mutable<IRemoteFileTrust<Set<string>>>, path: string): void {
	if (!path.includes('\\')) {
		remote.roots.add(path);
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
