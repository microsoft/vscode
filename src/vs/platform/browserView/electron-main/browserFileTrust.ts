/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getOrSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../agentHost/common/agentHostUri.js';
import { IBrowserViewWindowConfiguration } from '../common/browserView.js';
import { IRemoteFileTrust } from './browserSession.js';

/** The trust a window contributes, and the remote it is connected to, if any. */
export interface IWindowFileTrust extends Pick<IBrowserViewWindowConfiguration, 'trustAllFiles' | 'trustedFileRoots'> {
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
 * apply only to its own remote, and agent host roots only to that host, read through the window
 * that contributed them. Only `file:` roots apply to the local file system.
 */
export function computeFileTrust(windows: Iterable<IWindowFileTrust>): IFileTrust {
	const localRoots = new Set<string>();
	let localTrustAll = false;
	const remotes = new Map<string, Mutable<IRemoteFileTrust<Set<string>>>>();
	for (const { windowId, remoteAuthority, trustAllFiles, trustedFileRoots } of windows) {
		const remoteKey = remoteAuthority?.toLowerCase();
		const remote = remoteKey ? getOrSet(remotes, remoteKey, { roots: new Set<string>(), trustAll: false, windowId, scheme: Schemas.vscodeRemote }) : undefined;
		if (remote) {
			remote.trustAll ||= trustAllFiles;
		} else {
			localTrustAll ||= trustAllFiles;
		}
		for (const components of trustedFileRoots) {
			const root = URI.revive(components);
			if (root.scheme === Schemas.file) {
				localRoots.add(root.fsPath);
			} else if (remote && root.scheme === Schemas.vscodeRemote && root.authority.toLowerCase() === remoteKey) {
				remote.roots.add(root.path);
			} else if (root.scheme === AGENT_HOST_SCHEME) {
				const original = fromAgentHostUri(root);
				if (original.scheme === Schemas.file) {
					getOrSet(remotes, root.authority.toLowerCase(), { roots: new Set<string>(), trustAll: false, windowId, scheme: AGENT_HOST_SCHEME }).roots.add(original.path);
				}
			}
		}
	}
	return { local: { roots: localRoots, trustAll: localTrustAll }, remotes };
}
