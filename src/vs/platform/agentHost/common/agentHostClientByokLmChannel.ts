/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import {
	IAgentHostByokLmHandler,
	IByokLmBridgeConnection,
	IByokLmChatProgressEvent,
	IByokLmChatProgressReporter,
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
 * Event name carrying {@link IByokLmChatProgressEvent} for every in-flight
 * `chat` call on this connection. A single subscription carries all requests,
 * multiplexed by request id, so streaming does not allocate one event per call.
 */
export const AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT = 'chatProgress';

interface IByokLmChatCallArgs {
	readonly request: IByokLmChatRequest;
	/** Correlates this call with its {@link AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT} stream. */
	readonly requestId: string;
}

/**
 * Wraps an {@link IChannel} (obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an {@link IByokLmBridgeConnection}
 * suitable for the node-side {@link IByokLmProxyService}. This is the node end
 * of the bridge: `chat()` ships the request to the renderer, forwards streamed
 * content from the connection-level progress stream, and resolves with the
 * final result; `onDidChangeModels` is the renderer's pushed model snapshot
 * stream.
 */
export function createAgentHostClientByokLmConnection(channel: IChannel): IByokLmBridgeConnection {
	/**
	 * Callbacks for requests currently streaming, keyed by request id. The
	 * progress subscription is created once per connection and disposed when the
	 * last in-flight request settles, so repeated chats reuse one listener.
	 */
	const progressHandlers = new Map<string, IByokLmChatProgressReporter>();
	let progressSubscription: IDisposable | undefined;

	const subscribeProgress = (): void => {
		progressSubscription ??= channel.listen<IByokLmChatProgressEvent>(AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT)(event => {
			progressHandlers.get(event.requestId)?.(event.progress);
		});
	};

	return {
		chat: (request, token, progress) => {
			const requestId = generateUuid();
			if (progress) {
				progressHandlers.set(requestId, progress);
				subscribeProgress();
			}
			return (channel.call('chat', { request, requestId } satisfies IByokLmChatCallArgs, token) as Promise<IByokLmChatResult>)
				.finally(() => {
					progressHandlers.delete(requestId);
					if (progressHandlers.size === 0) {
						progressSubscription?.dispose();
						progressSubscription = undefined;
					}
				});
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

	constructor(
		@IAgentHostByokLmHandler private readonly _handler: IAgentHostByokLmHandler,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Connection-level progress stream. Created once per channel and shared by
	 * every in-flight request (multiplexed by request id), so streaming a
	 * response never allocates an emitter that outlives it.
	 */
	private _chatProgress: Emitter<IByokLmChatProgressEvent> | undefined;

	listen<T>(_ctx: unknown, event: string): Event<T> {
		if (event === 'models') {
			return this._modelsSnapshotEvent() as Event<T>;
		}
		if (event === AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT) {
			return this._chatProgressEvent() as Event<T>;
		}
		throw new Error(`No event '${event}' on AgentHostClientByokLmChannel`);
	}

	private _chatProgressEvent(): Event<IByokLmChatProgressEvent> {
		this._chatProgress ??= new Emitter<IByokLmChatProgressEvent>();
		return this._chatProgress.event;
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

	async call<T>(_ctx: unknown, command: string, arg?: unknown, token?: CancellationToken): Promise<T> {
		switch (command) {
			case 'chat': {
				const { request, requestId } = arg as IByokLmChatCallArgs;
				const report: IByokLmChatProgressReporter = progress => this._chatProgress?.fire({ requestId, progress });
				return await this._handler.chat(request, token ?? CancellationToken.None, report) as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientByokLmChannel`);
	}
}

export class NullAgentHostClientByokLmChannel implements IServerChannel {

	listen<T>(_ctx: unknown, event: string, _arg?: unknown): Event<T> {
		if (event === 'models') {
			return Event.None;
		}
		throw new Error(`No event '${event}' on NullAgentHostClientByokLmChannel`);
	}

	async call<T>(_ctx: unknown, command: string, _arg?: unknown, _token?: CancellationToken): Promise<T> {
		throw new Error(`No command '${command}' on NullAgentHostClientByokLmChannel`);
	}
}
