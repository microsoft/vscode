/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';

export function toRemoteAgentHostWorkingDirectory(resource: URI, remoteAuthority: string): URI {
	if (resource.scheme === Schemas.file) {
		return resource;
	}
	if (resource.scheme !== Schemas.vscodeRemote || resource.authority !== remoteAuthority) {
		throw new Error(`Working directory does not belong to remote authority '${remoteAuthority}': ${resource.toString()}`);
	}
	return resource.with({ scheme: Schemas.file, authority: null });
}

export function fromRemoteAgentHostWorkingDirectory(resource: URI, remoteAuthority: string): URI {
	const unwrapped = fromAgentHostUri(resource);
	return unwrapped.scheme === Schemas.file
		? unwrapped.with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority })
		: unwrapped;
}
