/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSignal } from '../../common/agent.js';
import type { IAgentServerToolInvocation } from '../../common/agentServerTools.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ClaudeFileEditObserver } from './claudeFileEditObserver.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from './claudeMapSessionEvents.js';
import type { SubagentRegistry } from './claudeSubagentRegistry.js';

interface IClaudeSdkMessageContext {
	readonly turnDuration?: number;
	readonly mode?: PermissionMode;
	readonly clientContext?: IAgentHostClientTelemetryContext;
}

/**
 * Per-message router. Awaits file-edit observation for `type: 'user'`
 * messages so the cached edit lands before {@link mapSDKMessageToAgentSignals}
 * reads it via `state.takeFileEdit`, then fires mapped signals on
 * {@link onDidProduceSignal}. Mapper failures are logged but never thrown.
 *
 * Owns the per-session {@link ClaudeFileEditObserver} (Phase 8) and
 * {@link ClaudeMapperState} (Phase 7) — both are private to the
 * message-handling pipeline and have no other consumers. Phase 12
 * subagent correlation state lives on {@link IClaudeSubagentResolver}
 * (host-singleton, keyed by parent session URI), which the router
 * forwards into every mapper invocation.
 */
export class ClaudeSdkMessageRouter extends Disposable {
	private readonly _onDidProduceSignal = this._register(new Emitter<AgentSignal>());
	readonly onDidProduceSignal: Event<AgentSignal> = this._onDidProduceSignal.event;

	private readonly _editObserver: ClaudeFileEditObserver;
	private readonly _mapperState = new ClaudeMapperState();

	private _clientToolOwner: ((toolName: string) => string | undefined) | undefined;
	private readonly _pendingToolTurns = new Map<string, DeferredPromise<IAgentServerToolInvocation | undefined>>();
	private readonly _toolInvocations = new LRUCache<string, IAgentServerToolInvocation>(2048);

	constructor(
		private readonly _chatChannelUri: URI,
		resource: URI,
		dbRef: IReference<ISessionDatabase>,
		private readonly _subagents: SubagentRegistry,
		clientToolOwner: ((toolName: string) => string | undefined) | undefined = undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._clientToolOwner = clientToolOwner;
		this._editObserver = this._register(
			instantiationService.createInstance(ClaudeFileEditObserver, resource.toString(), dbRef),
		);
		this._register(toDisposable(() => {
			for (const pending of this._pendingToolTurns.values()) {
				void pending.complete(undefined);
			}
			this._pendingToolTurns.clear();
			this._toolInvocations.clear();
		}));
	}

	async getToolInvocation(toolUseId: string): Promise<IAgentServerToolInvocation | undefined> {
		const original = this._toolInvocations.get(toolUseId);
		if (original || this._store.isDisposed) {
			return original;
		}
		const existing = this._pendingToolTurns.get(toolUseId);
		if (existing) {
			return existing.p;
		}
		// The SDK can invoke MCP before the corresponding tool-use stream event arrives.
		const pending = new DeferredPromise<IAgentServerToolInvocation | undefined>();
		this._pendingToolTurns.set(toolUseId, pending);
		try {
			return await raceTimeout(pending.p, 5000);
		} finally {
			void pending.complete(undefined);
			this._pendingToolTurns.delete(toolUseId);
		}
	}

	setClientToolOwner(clientToolOwner: ((toolName: string) => string | undefined) | undefined): void {
		this._clientToolOwner = clientToolOwner;
	}

	async handle(message: SDKMessage, turnId: string | undefined, context?: IClaudeSdkMessageContext): Promise<void> {
		if (message.type === 'assistant') {
			this._editObserver.observeAssistant(message, context?.mode, context?.clientContext);
		} else if (message.type === 'user' && turnId !== undefined) {
			await this._editObserver.observeUser(message, turnId, this._mapperState);
		}
		if (turnId === undefined) {
			return;
		}
		try {
			const signals = mapSDKMessageToAgentSignals(
				message,
				this._chatChannelUri,
				turnId,
				this._mapperState,
				this._logService,
				this._subagents,
				this._clientToolOwner,
				context?.turnDuration,
			);
			for (const signal of signals) {
				if (signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallStart) {
					const id = signal.action.toolCallId;
					const invocation = this._toolInvocations.get(id) ?? {
						turnId: signal.action.turnId, toolCallId: id,
						isSubagent: signal.resource.toString() !== this._chatChannelUri.toString()
							|| (message.type === 'assistant' || message.type === 'stream_event') && typeof message.parent_tool_use_id === 'string',
					};
					this._toolInvocations.set(id, invocation);
					void this._pendingToolTurns.get(id)?.complete(invocation);
				}
				this._onDidProduceSignal.fire(signal);
			}
		} catch (mapperErr) {
			this._logService.warn(`[ClaudeSdkMessageRouter] mapper threw, skipping message: ${mapperErr}`);
		}
	}
}
