/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSignal } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ClaudeFileEditObserver } from './claudeFileEditObserver.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from './claudeMapSessionEvents.js';
import type { SubagentRegistry } from './claudeSubagentRegistry.js';
import { mapSubagentSystemMessage } from './claudeSubagentSignals.js';

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
			// A background subagent settles with the queue already drained.
			if (message.type === 'system') {
				this._produceSignals(() => mapSubagentSystemMessage(message, this._chatChannelUri, this._subagents));
			}
			return;
		}
		this._produceSignals(() => mapSDKMessageToAgentSignals(
			message,
			this._chatChannelUri,
			turnId,
			this._mapperState,
			this._logService,
			this._subagents,
			this._clientToolOwner,
			context?.turnDuration,
		));
	}

	private _produceSignals(map: () => readonly AgentSignal[]): void {
		try {
			for (const signal of map()) {
				this._onDidProduceSignal.fire(signal);
			}
		} catch (mapperErr) {
			this._logService.warn(`[ClaudeSdkMessageRouter] mapper threw, skipping message: ${mapperErr}`);
		}
	}
}
