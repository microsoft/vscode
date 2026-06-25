/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import {
	IAgentHostByokLmHandler,
	IByokLmBridgeConnection,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmModelInfo,
} from './agentHostByokLm.js';

/**
 * IPC channel name used for in-process agent-host → renderer reverse BYOK
 * language-model RPCs. The renderer registers a server channel under this
 * name on its `MessagePortClient`; the agent host reaches it via
 * `server.getChannel(name, c => c.ctx === clientId)` on its
 * `UtilityProcessServer`.
 *
 * Mirrors {@link AGENT_HOST_CLIENT_RESOURCE_CHANNEL} for the reverse FS bridge.
 */
export const AGENT_HOST_CLIENT_BYOK_LM_CHANNEL = 'agentHostClientByokLm';

/**
 * Wraps an {@link IChannel} (obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an {@link IByokLmBridgeConnection}
 * suitable for the node-side {@link IByokLmProxyService}. This is the node end
 * of the bridge: `chat()` ships the request to the renderer and resolves with
 * the buffered completion the renderer produced from the LM API.
 */
export function createAgentHostClientByokLmConnection(channel: IChannel): IByokLmBridgeConnection {
	// Reach for `channel.listen` lazily — only when a consumer actually
	// subscribes to `onDidChangeModels` — mirroring the deferred `channel.call`
	// usage below (and the reverse FS bridge). Touching the channel eagerly at
	// construction would force every connection to register an IPC event handler
	// up front, even when nothing listens.
	const onDidChangeModels = new Lazy(() => channel.listen<void>('onDidChangeModels'));
	return {
		chat: (request) => channel.call('chat', request) as Promise<IByokLmChatResult>,
		listModels: () => channel.call('listModels') as Promise<IByokLmModelInfo[]>,
		onDidChangeModels: (listener, thisArgs, disposables) => onDidChangeModels.value(listener, thisArgs, disposables),
	};
}

/**
 * Server-side channel for in-process reverse BYOK LM RPCs from the local agent
 * host. Thin adapter — forwards `chat` calls to the renderer's
 * {@link IAgentHostByokLmHandler} (backed by `ILanguageModelsService`).
 */
export class AgentHostClientByokLmChannel implements IServerChannel {

	constructor(
		@IAgentHostByokLmHandler private readonly _handler: IAgentHostByokLmHandler,
	) { }

	listen<T>(_ctx: unknown, event: string): Event<T> {
		if (event === 'onDidChangeModels') {
			return (this._handler.onDidChangeModels ?? Event.None) as Event<T>;
		}
		throw new Error(`No event '${event}' on AgentHostClientByokLmChannel`);
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'chat': {
				const result = await this._handler.chat(arg as IByokLmChatRequest, CancellationToken.None);
				return result as T;
			}
			case 'listModels': {
				const models = await this._handler.listModels(CancellationToken.None);
				return models as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientByokLmChannel`);
	}
}
