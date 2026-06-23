/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AGENT_HOST_CLIENT_RESOURCE_CHANNEL, createAgentHostClientResourceConnection } from '../common/agentHostClientResourceChannel.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, createAgentHostClientByokLmConnection } from '../common/agentHostClientByokLmChannel.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';

/**
 * Wire the per-connection reverse-RPC bridges every in-process renderer exposes
 * to the agent host's `UtilityProcessServer`: the filesystem resource bridge
 * ({@link AGENT_HOST_CLIENT_RESOURCE_CHANNEL}) and the BYOK language-model
 * bridge ({@link AGENT_HOST_CLIENT_BYOK_LM_CHANNEL}). The filesystem bridge lets
 * the agent host read files from the connected renderer's workspace; the BYOK
 * bridge lets the node-side OpenAI proxy reach the renderer's LM API for
 * extension-provided models. Disposing the result tears both bridges down for
 * that connection.
 *
 * @param getChannel Resolves a renderer server channel by name, already scoped
 * to the connection's `clientId` (e.g. `name => server.getChannel(name, c => c.ctx === clientId)`).
 */
export function registerAgentHostClientReverseRpc(
	clientId: string,
	getChannel: (channelName: string) => IChannel,
	clientFileSystemProvider: Pick<AgentHostClientFileSystemProvider, 'registerAuthority'>,
	byokLmBridgeRegistry: IByokLmBridgeRegistry | undefined,
): IDisposable {
	const store = new DisposableStore();
	const fsConnection = createAgentHostClientResourceConnection(getChannel(AGENT_HOST_CLIENT_RESOURCE_CHANNEL));
	store.add(clientFileSystemProvider.registerAuthority(clientId, fsConnection));
	// The BYOK bridge is wired only when the feature is enabled — the caller
	// passes `undefined` when `chat.agentHost.byokModels.enabled` is off. In that
	// case the renderer also skips registering the BYOK server channel, so there
	// is nothing to bridge.
	if (byokLmBridgeRegistry) {
		const byokLmConnection = createAgentHostClientByokLmConnection(getChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL));
		store.add(byokLmBridgeRegistry.register(clientId, byokLmConnection));
	}
	return store;
}
