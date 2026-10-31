/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { createAgentHostResourceUriMapper, createEditorRemoteAgentHostResourceUriMapper, IAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, toAgentHostUri } from '../../common/agentHostUri.js';

const clientScheme = 'agent-host-test-client';

/** Use this mapper to prove that every resource crosses the client/host boundary exactly once. */
export function createStrictAgentHostResourceUriMapper(): IAgentHostResourceUriMapper {
	return {
		toAgentHost: resource => {
			if (resource.scheme === Schemas.file) {
				throw new Error('toAgentHost received a file URI already in host space; resource must cross the boundary exactly once');
			}
			return resource.scheme === clientScheme ? resource.with({ scheme: Schemas.file, authority: '' }) : resource;
		},
		fromAgentHost: resource => {
			if (resource.scheme === clientScheme) {
				throw new Error('fromAgentHost received a client URI already in client space; resource must cross the boundary exactly once');
			}
			return resource.scheme === Schemas.file ? resource.with({ scheme: clientScheme, authority: 'client' }) : resource;
		},
	};
}

/** Run resource-boundary consumer tests across real connection kinds and strict exactly-once mapping; toClient supplies independent expected client URIs for host files. */
export const agentHostConnectionKinds: readonly {
	readonly name: string;
	readonly resourceUris: IAgentHostResourceUriMapper;
	readonly toClient: (hostUri: URI) => URI;
}[] = [
		{
			name: 'local',
			resourceUris: identityAgentHostResourceUriMapper,
			toClient: uri => uri,
		},
		{
			name: 'remote agent host',
			resourceUris: createAgentHostResourceUriMapper('remote-test'),
			toClient: uri => toAgentHostUri(uri, 'remote-test'),
		},
		{
			name: 'editor remote',
			resourceUris: createEditorRemoteAgentHostResourceUriMapper('ssh-remote+test', 'editor-remote-test'),
			toClient: uri => uri.with({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+test' }),
		},
		{
			name: 'strict',
			resourceUris: createStrictAgentHostResourceUriMapper(),
			toClient: uri => uri.with({ scheme: clientScheme, authority: 'client' }),
		},
	];
