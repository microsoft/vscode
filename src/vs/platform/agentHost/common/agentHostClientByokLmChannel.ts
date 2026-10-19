/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Throttler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import {
	IAgentHostByokLmHandler,
	IByokLmBridgeConnection,
	IByokLmChatProgress,
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
 * Event name carrying {@link IByokLmChatProgress} for one in-flight `chat`
 * call. The node side subscribes with the request id as the event argument
 * before issuing the call, so the renderer can push content as it arrives.
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
 * content from the per-request progress channel, and resolves with the final
 * result; `onDidChangeModels` is the renderer's pushed model snapshot stream.
 */
export function createAgentHostClientByokLmConnection(channel: IChannel): IByokLmBridgeConnection {
	return {
		chat: (request, token, progress) => {
			const requestId = generateUuid();
			const subscription = progress
				? channel.listen<IByokLmChatProgress>(AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT, requestId)(progress)
				: undefined;
			return (channel.call('chat', { request, requestId } satisfies IByokLmChatCallArgs, token) as Promise<IByokLmChatResult>)
				.finally(() => subscription?.dispose());
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
	 * Per-request progress emitters, keyed by the request id the node side
	 * passes to {@link AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT}. Created on
	 * demand and disposed when the matching `chat` call settles.
	 */
	private readonly _chatProgress = new Map<string, Emitter<IByokLmChatProgress>>();

	listen<T>(_ctx: unknown, event: string, arg?: unknown): Event<T> {
		if (event === 'models') {
			return this._modelsSnapshotEvent() as Event<T>;
		}
		if (event === AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT) {
			if (typeof arg !== 'string') {
				throw new Error(`'${AGENT_HOST_CLIENT_BYOK_LM_PROGRESS_EVENT}' requires a request id argument`);
			}
			return this._chatProgressEmitter(arg).event as Event<T>;
		}
		throw new Error(`No event '${event}' on AgentHostClientByokLmChannel`);
	}

	private _chatProgressEmitter(requestId: string): Emitter<IByokLmChatProgress> {
		let emitter = this._chatProgress.get(requestId);
		if (!emitter) {
			emitter = new Emitter<IByokLmChatProgress>();
			this._chatProgress.set(requestId, emitter);
		}
		return emitter;
	}

	private _disposeChatProgress(requestId: string): void {
		const emitter = this._chatProgress.get(requestId);
		if (emitter) {
			this._chatProgress.delete(requestId);
			emitter.dispose();
		}
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
				const emitter = this._chatProgressEmitter(requestId);
				const report: IByokLmChatProgressReporter = progress => emitter.fire(progress);
				try {
					const result = await this._handler.chat(request, token ?? CancellationToken.None, report);
					return result as T;
				} finally {
					this._disposeChatProgress(requestId);
				}
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
