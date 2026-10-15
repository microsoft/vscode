/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IChannelClient, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import {
	IAgentHostByokLmHandler,
	IByokLmBridgeConnection,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmChatProgress,
	IByokLmModelInfo,
} from './agentHostByokLm.js';

/**
 * IPC channel name used for in-process agent-host → renderer reverse BYOK
 * language-model RPCs. The renderer registers a server channel under this
 * name on its `MessagePortClient`; the agent host reaches it via the
 * corresponding connection's `channelClient`.
 */
export const AGENT_HOST_CLIENT_BYOK_LM_CHANNEL = 'agentHostClientByokLm';

interface IStreamingChatRequest {
	readonly requestId: string;
	readonly request: IByokLmChatRequest;
}

/**
 * Wraps a connection-pinned IPC client into a reverse BYOK LM bridge.
 * Request-scoped progress subscriptions must not use server-wide multicast routing, which retains emitters until shutdown.
 */
export function createAgentHostClientByokLmConnection(client: IChannelClient): IByokLmBridgeConnection {
	const channel = client.getChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL);
	return {
		chat: async (request, token = CancellationToken.None, onProgress) => {
			if (!onProgress) {
				return channel.call<IByokLmChatResult>('chat', request, token);
			}
			const store = new DisposableStore();
			const cts = store.add(new CancellationTokenSource(token));
			const requestId = generateUuid();
			let progressError: Error | undefined;
			try {
				// Subscribe before sending the RPC so even the first provider delta is delivered.
				store.add(channel.listen<IByokLmChatProgress>('chatProgress', requestId)(progress => {
					if (cts.token.isCancellationRequested) {
						return;
					}
					try {
						onProgress(progress);
					} catch (err) {
						progressError = err instanceof Error ? err : new Error(String(err));
						cts.cancel();
					}
				}));
				const result = await channel.call<IByokLmChatResult>('streamChat', { requestId, request } satisfies IStreamingChatRequest, cts.token);
				if (progressError) {
					throw progressError;
				}
				return result;
			} catch (err) {
				throw progressError ?? err;
			} finally {
				store.dispose();
			}
		},
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

	private readonly _progress = new Map<string, Emitter<IByokLmChatProgress>>();

	constructor(
		@IAgentHostByokLmHandler private readonly _handler: IAgentHostByokLmHandler,
		@ILogService private readonly _logService: ILogService,
	) { }

	listen<T>(_ctx: unknown, event: string, arg?: unknown): Event<T> {
		if (event === 'chatProgress') {
			return this._chatProgressEvent(arg as string) as Event<T>;
		}
		if (event === 'models') {
			return this._modelsSnapshotEvent() as Event<T>;
		}
		throw new Error(`No event '${event}' on AgentHostClientByokLmChannel`);
	}

	/** A request-scoped subscription; removing it releases its emitter. */
	private _chatProgressEvent(requestId: string): Event<IByokLmChatProgress> {
		const emitter = new Emitter<IByokLmChatProgress>({
			onDidAddFirstListener: () => this._progress.set(requestId, emitter),
			onDidRemoveLastListener: () => {
				this._progress.delete(requestId);
				emitter.dispose();
			},
		});
		return emitter.event;
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

	async call<T>(_ctx: unknown, command: string, arg?: unknown, token: CancellationToken = CancellationToken.None): Promise<T> {
		switch (command) {
			case 'streamChat': {
				const { requestId, request } = arg as IStreamingChatRequest;
				return await this._handler.chat(request, token, progress => this._progress.get(requestId)?.fire(progress)) as T;
			}
			case 'chat': {
				const result = await this._handler.chat(arg as IByokLmChatRequest, token);
				return result as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientByokLmChannel`);
	}
}

export class NullAgentHostClientByokLmChannel implements IServerChannel {

	listen<T>(_ctx: unknown, event: string): Event<T> {
		if (event === 'models') {
			return Event.None;
		}
		throw new Error(`No event '${event}' on NullAgentHostClientByokLmChannel`);
	}

	async call<T>(_ctx: unknown, command: string): Promise<T> {
		throw new Error(`No command '${command}' on NullAgentHostClientByokLmChannel`);
	}
}
