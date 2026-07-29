/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../log/common/log.js';
import type { Message } from '../../common/state/sessionState.js';

/**
 * Tracks subagent-to-parent routing and reports subagent lifecycle transitions.
 */
export class SubagentRouting {
	/**
	 * Maps a subagent's stable `agentId` to its parent tool call id. Completion
	 * ends the current subagent turn, but steering can start another turn with
	 * the same id, so mappings live until session teardown.
	 */
	private readonly _parentToolCallIdsByAgentId = new Map<string, string>();
	private readonly _activeSubagentAgentIds = new Set<string>();
	private readonly _unroutableSubagentToolCallIds = new Set<string>();

	constructor(
		private readonly _sessionId: string,
		private readonly _logService: ILogService,
		private readonly _onSubagentResumed: (parentToolCallId: string, message: Message | undefined) => void,
		private readonly _onSubagentCompleted: (parentToolCallId: string) => void,
	) { }

	parentToolCallIdForEvent(e: { readonly agentId?: string }): string | undefined {
		return e.agentId ? this._parentToolCallIdsByAgentId.get(e.agentId) : undefined;
	}

	resumeForEvent(e: { readonly agentId?: string }, message?: Message): void {
		if (!e.agentId || this._activeSubagentAgentIds.has(e.agentId)) {
			return;
		}
		const parentToolCallId = this._parentToolCallIdsByAgentId.get(e.agentId);
		if (!parentToolCallId) {
			return;
		}
		this._activeSubagentAgentIds.add(e.agentId);
		this._onSubagentResumed(parentToolCallId, message);
	}

	completeSubagentTurn(agentId: string | undefined, toolCallId?: string): void {
		if (agentId) {
			if (!this._activeSubagentAgentIds.delete(agentId)) {
				return;
			}
		} else if (!toolCallId) {
			return;
		}
		const parentToolCallId = toolCallId ?? (agentId ? this._parentToolCallIdsByAgentId.get(agentId) : undefined);
		if (!parentToolCallId) {
			return;
		}
		this._onSubagentCompleted(parentToolCallId);
	}

	shouldDropUnmappedEvent(e: { readonly agentId?: string }, eventName: string): boolean {
		const parentToolCallId = this.parentToolCallIdForEvent(e);
		if (!parentToolCallId && e.agentId) {
			this._logService.warn(`[Copilot:${this._sessionId}] Dropping ${eventName} for unknown subagent agentId=${e.agentId}`);
			return true;
		}
		return false;
	}

	startSubagent(agentId: string | undefined, parentToolCallId: string): void {
		if (!agentId) {
			return;
		}
		this._parentToolCallIdsByAgentId.set(agentId, parentToolCallId);
		this._activeSubagentAgentIds.add(agentId);
	}

	addUnroutableToolCall(toolCallId: string): void {
		this._unroutableSubagentToolCallIds.add(toolCallId);
	}

	takeUnroutableToolCall(toolCallId: string): boolean {
		return this._unroutableSubagentToolCallIds.delete(toolCallId);
	}

	forgetUnroutableToolCall(toolCallId: string): void {
		this._unroutableSubagentToolCallIds.delete(toolCallId);
	}
}
