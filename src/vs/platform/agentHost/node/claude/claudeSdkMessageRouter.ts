/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSignal } from '../../common/agentService.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ClaudeFileEditObserver } from './claudeFileEditObserver.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from './claudeMapSessionEvents.js';
import type { SubagentRegistry } from './claudeSubagentRegistry.js';

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

	constructor(
		private readonly _sessionUri: URI,
		dbRef: IReference<ISessionDatabase>,
		private readonly _subagents: SubagentRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._editObserver = this._register(
			instantiationService.createInstance(ClaudeFileEditObserver, _sessionUri.toString(), dbRef),
		);
	}

	async handle(message: SDKMessage, turnId: string | undefined): Promise<void> {
		if (message.type === 'assistant') {
			this._editObserver.observeAssistant(message);
		} else if (message.type === 'user' && turnId !== undefined) {
			await this._editObserver.observeUser(message, turnId, this._mapperState);
		}
		if (turnId === undefined) {
			return;
		}
		try {
			const signals = mapSDKMessageToAgentSignals(
				message,
				this._sessionUri,
				turnId,
				this._mapperState,
				this._logService,
				this._subagents,
			);
			for (const signal of signals) {
				this._onDidProduceSignal.fire(signal);
			}
		} catch (mapperErr) {
			this._logService.warn(`[ClaudeSdkMessageRouter] mapper threw, skipping message: ${mapperErr}`);
		}
	}
}
