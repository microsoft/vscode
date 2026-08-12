/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
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
 */
export const AGENT_HOST_CLIENT_BYOK_LM_CHANNEL = 'agentHostClientByokLm';

/**
 * Wraps an {@link IChannel} (obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an {@link IByokLmBridgeConnection}
 * suitable for the node-side {@link IByokLmProxyService}. This is the node end
 * of the bridge: `chat()` ships the request to the renderer and resolves with
 * the buffered completion the renderer produced from the LM API, and
 * `onDidChangeModels` is the renderer's pushed model snapshot stream.
 */
export function createAgentHostClientByokLmConnection(channel: IChannel): IByokLmBridgeConnection {
	return {
		chat: (request) => channel.call('chat', request) as Promise<IByokLmChatResult>,
		onDidChangeModels: channel.listen<IByokLmModelInfo[]>('models'),
	};
}

/**
 * Server-side channel for in-process reverse BYOK LM RPCs from the local agent
 * host. Thin adapter — forwards `chat` calls to the renderer's
 * {@link IAgentHostByokLmHandler} (backed by `ILanguageModelsService`) and
 * serves the pushed `models` snapshot stream.
 */

export class AgentHostClientByokLmChannel implements IServerChannel {

	constructor(
		@IAgentHostByokLmHandler private readonly _handler: IAgentHostByokLmHandler,
		@ILogService private readonly _logService: ILogService,
	) { }

	listen<T>(_ctx: unknown, event: string): Event<T> {
		if (event === 'models') {
			return this._modelsSnapshotEvent() as Event<T>;
		}
		throw new Error(`No event '${event}' on AgentHostClientByokLmChannel`);
	}

	/**
	 * A snapshot stream of the renderer's BYOK models: emits the current models
	 * when a subscriber attaches, then re-emits whenever the handler reports a
	 * change. Enumeration is renderer-local, so the node side only ever receives.
	 *
	 * A {@link Throttler} serializes overlapping publishes and coalesces bursts,
	 * so a slow enumeration can't fire a stale snapshot after a newer one.
	 */
	private _modelsSnapshotEvent(): Event<IByokLmModelInfo[]> {
		const store = new DisposableStore();
		const throttler = store.add(new Throttler());
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>({
			onDidAddFirstListener: () => {
				if (this._handler.onDidChangeModels) {
					store.add(this._handler.onDidChangeModels(() => void publish()));
				}
				void publish();
			},
			onDidRemoveLastListener: () => store.dispose(),
		}));
		const publish = () => {
			if (store.isDisposed) {
				return; // avoid a floating rejection from a disposed throttler
			}
			throttler.queue(async () => {
				try {
					const models = await this._handler.listModels(CancellationToken.None);
					if (!store.isDisposed) {
						emitter.fire(models);
					}
				} catch (err) {
					// Leave the snapshot unpublished (the connection stays non-serving);
					// surface the error so renderer-side failures are diagnosable.
					this._logService.warn('AgentHostClientByokLmChannel: failed to enumerate BYOK models from the renderer', err);
				}
			});
		};
		return emitter.event;
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'chat': {
				const result = await this._handler.chat(arg as IByokLmChatRequest, CancellationToken.None);
				return result as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientByokLmChannel`);
	}
}
