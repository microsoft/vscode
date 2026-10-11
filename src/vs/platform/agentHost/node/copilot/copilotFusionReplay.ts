/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import { ResponsePartKind, type ResponsePart } from '../../common/state/sessionState.js';
import { CopilotFusionProgress, type CopilotFusionEvent, type ICopilotFusionProgressUpdate } from './copilotFusionProgress.js';
import { getFusionEventKey, getFusionEventSdkTurnId, isSyntheticUserMessage } from './copilotFusionEventIdentity.js';

/** Owns replayed Fusion workflows across root turn boundaries, including routing before a user message. */
export class FusionReplayState {
	private readonly _progress = new CopilotFusionProgress();
	private readonly _eventTurns = new Map<string, number>();
	private readonly _rejectedEventKeys = new Set<string>();
	private readonly _updates: ICopilotFusionProgressUpdate[] = [];
	private readonly _requestIdsBySdkTurnId = new Map<string, string | undefined>();
	private readonly _seenRequestIds = new Set<string>();
	private readonly _cancelledRequestIds = new Set<string>();
	private _requestId: string | undefined;
	private _pendingRequestId: string | undefined;
	private _turn = 0;
	private _pendingTurn = false;
	private _requiresCorrelation = false;

	/** Index durable request correlations before applying routing that precedes its user message. */
	constructor(events: readonly SessionEvent[] = []) {
		const requestIdsByInteractionId = new Map<string, string>();
		for (const event of events) {
			if (event.type === 'user.message' && !event.agentId && !isSyntheticUserMessage(event)) {
				if (event.data.interactionId) {
					requestIdsByInteractionId.set(event.data.interactionId, event.id);
				}
				if (event.data.turnId) {
					this._recordSdkTurn(event.data.turnId, event.id);
				}
			}
		}
		let requestId: string | undefined;
		for (const event of events) {
			if (event.agentId) {
				continue;
			}
			if (event.type === 'user.message' && !isSyntheticUserMessage(event)) {
				requestId = event.id;
			} else if (event.type === 'abort' || event.type === 'session.idle') {
				requestId = undefined;
			} else if (event.type === 'assistant.turn_start') {
				const interactionOwner = event.data.interactionId ? requestIdsByInteractionId.get(event.data.interactionId) : undefined;
				if (interactionOwner === undefined && this._requestIdsBySdkTurnId.has(event.data.turnId)) {
					continue;
				}
				const owner = interactionOwner ?? requestId;
				if (owner !== undefined) {
					this._recordSdkTurn(event.data.turnId, owner);
				}
			}
		}
	}

	private _recordSdkTurn(sdkTurnId: string, requestId: string): void {
		const previous = this._requestIdsBySdkTurnId.get(sdkTurnId);
		this._requestIdsBySdkTurnId.set(sdkTurnId, this._requestIdsBySdkTurnId.has(sdkTurnId) && previous !== requestId ? undefined : requestId);
	}

	observe(event: CopilotFusionEvent, context: { readonly requestActive: boolean; readonly hasTurn: boolean }): void {
		if (event.agentId) {
			return;
		}
		const routing = event.type === 'session.fusion_route_started' || event.type === 'session.fusion_route_failed';
		const key = getFusionEventKey(event);
		const eventTurn = this._eventTurns.get(key);
		if (this._rejectedEventKeys.has(key) || (eventTurn !== undefined && eventTurn !== this._turn)) {
			return;
		}
		if (eventTurn !== undefined && !this._pendingTurn && this._requestId !== undefined && this._cancelledRequestIds.has(this._requestId)) {
			return;
		}
		const sdkTurnId = getFusionEventSdkTurnId(event);
		const owner = sdkTurnId ? this._requestIdsBySdkTurnId.get(sdkTurnId) : undefined;
		if (owner !== undefined) {
			// Reject a cancelled/earlier owner or ownership conflicting with the pending request.
			if (this._cancelledRequestIds.has(owner) || (this._seenRequestIds.has(owner) && owner !== this._requestId)
				|| (this._pendingRequestId !== undefined && owner !== this._pendingRequestId)) {
				this._rejectedEventKeys.add(key);
				return;
			}
		} else if (eventTurn === undefined && this._requiresCorrelation) {
			// An active request still cannot claim an unowned event delayed across cancellation.
			return;
		}
		// Known future ownership distinguishes early routing from an earlier request's late event.
		const upcomingRequest = owner !== undefined && owner !== this._requestId && !this._seenRequestIds.has(owner);
		if (eventTurn === undefined && !this._pendingTurn
			&& (upcomingRequest || (!context.requestActive && owner === undefined
				&& (!context.hasTurn || routing || event.type === 'session.fusion_resolved')))) {
			this._advanceTurn();
			this._pendingTurn = true;
			this._pendingRequestId = owner;
		}
		if (this._pendingTurn && owner !== undefined) {
			this._pendingRequestId = owner;
		}
		this._eventTurns.set(key, this._turn);
		const update = this._progress.accept(event);
		if (!event.ephemeral) {
			this._append(update);
		}
	}

	beginTurn(requestId: string): void {
		if (!this._pendingTurn || (this._pendingRequestId !== undefined && this._pendingRequestId !== requestId)) {
			this._advanceTurn();
		}
		this._requestId = requestId;
		this._seenRequestIds.add(requestId);
		this._pendingTurn = false;
		this._pendingRequestId = undefined;
	}

	interrupt(timestamp?: string): void {
		this._requiresCorrelation = true;
		if (this._requestId !== undefined && !this._pendingTurn) {
			this._cancelledRequestIds.add(this._requestId);
		}
		this._append(this._progress.interrupt(timestamp));
	}

	/** Applies buffered progress only once its owning root turn has begun. */
	drain(parts: ResponsePart[]): boolean {
		if (this._pendingTurn || this._updates.length === 0) {
			return false;
		}
		for (const update of this._updates.splice(0)) {
			if (update.part) {
				parts.push(update.part);
			}
			if (update.phase) {
				const toolCall = update.phase.toolCall;
				const part: ResponsePart = { kind: ResponsePartKind.ToolCall, toolCall };
				const index = parts.findIndex(existing => existing.kind === ResponsePartKind.ToolCall && existing.toolCall.toolCallId === toolCall.toolCallId);
				if (index < 0) {
					parts.push(part);
				} else {
					parts[index] = part;
				}
			}
		}
		return true;
	}

	private _append(update: ICopilotFusionProgressUpdate | undefined): void {
		if (update && (update.part || update.phase)) {
			this._updates.push(update);
		}
	}

	private _advanceTurn(): void {
		this._progress.reset();
		this._updates.length = 0;
		this._turn++;
	}
}
