/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { toLocalResource } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';

/**
 * Converts an Editor working directory to the form the remote agent host uses.
 *
 * The host runs on the remote machine, so it addresses its own files as plain
 * `file:` paths while the Editor sees them as `vscode-remote:`. Throws for a
 * directory belonging to a different remote or a virtual filesystem, since the
 * same path there would name an unrelated directory on this host.
 */
export function toRemoteAgentHostWorkingDirectory(resource: URI, remoteAuthority: string): URI {
	if (resource.scheme === Schemas.file) {
		return resource;
	}
	if (resource.scheme !== Schemas.vscodeRemote || resource.authority !== remoteAuthority) {
		throw new Error(`Working directory does not belong to remote authority '${remoteAuthority}': ${resource.toString()}`);
	}
	return resource.with({ scheme: Schemas.file, authority: null });
}

/**
 * Converts a working directory reported by the remote agent host back to the
 * Editor's `vscode-remote:` form. The inverse of
 * {@link toRemoteAgentHostWorkingDirectory}, first unwrapping any
 * `vscode-agent-host:` URI the host may have sent.
 */
export function fromRemoteAgentHostWorkingDirectory(resource: URI, remoteAuthority: string): URI {
	const unwrapped = fromAgentHostUri(resource);
	return unwrapped.scheme === Schemas.file
		? toLocalResource(unwrapped, remoteAuthority, Schemas.vscodeRemote)
		: unwrapped;
}
