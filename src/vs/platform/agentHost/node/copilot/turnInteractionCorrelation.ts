/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import type { SessionEventPayload } from '@microsoft/copilot-sdk';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import type { IAgentTurnInteraction } from '../../common/agent.js';

export interface ISteeringTurnContext {
	readonly turnId: string;
	readonly originalTurnId: string | undefined;
	readonly interactionIds: readonly string[];
}

interface ITurnInteractionState {
	originalTurnId?: string;
	steeredFromTurn?: string;
	interactions: Set<string>;
	truncated: boolean;
	steeredFromTurnContext?: ISteeringTurnContext;
	steeringDelivery?: NonNullable<IAgentTurnInteraction['steeringDelivery']>;
}

type TurnSteeringEvent = {
	sdkSessionId: string;
	turnId: string;
	steeredFromTurn: string;
	originalTurnId: string | undefined;
	runtimeDelivery: 'steering' | 'idle' | 'queued' | 'unknown';
	attributionStatus: 'confirmed' | 'newRequest' | 'interactionMismatch' | 'unknown';
};

type TurnSteeringClassification = {
	owner: 'amunger';
	comment: 'Records host steering promotion and runtime delivery evidence, including confirmed continuity, new requests and unresolved attribution.';
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SDK session scope.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Host execution turn created by steering promotion.' };
	steeredFromTurn: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Execution the host considered the steering predecessor. Runtime continuity is reported by attributionStatus.' };
	originalTurnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Confirmed steering origin, or this turn for an explicit new runtime request. Absent if unresolved.' };
	runtimeDelivery: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Runtime user-message delivery: steering, idle, queued, or unknown.' };
	attributionStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'confirmed means steering delivery shares a predecessor interaction; newRequest means idle or queued delivery; interactionMismatch or unknown retains unresolved origin.' };
};

/** Bounded analytical snapshots of turn interactions and steering lineage. */
export class TurnInteractionCorrelation {
	private readonly _turns: LRUCache<string, ITurnInteractionState>;

	constructor(
		private readonly _sdkSessionId: string,
		private readonly _telemetryService: ITelemetryService,
		cacheLimit = 1000,
		private readonly _interactionLimit = 64,
	) {
		this._turns = new LRUCache(cacheLimit);
	}

	startTurn(turnId: string): void {
		this._turns.set(turnId, { originalTurnId: turnId, interactions: new Set(), truncated: false });
	}

	getSteeringContext(turnId: string): ISteeringTurnContext {
		const state = this._turns.get(turnId);
		return { turnId, originalTurnId: state?.originalTurnId, interactionIds: [...state?.interactions ?? []] };
	}

	prepareSteering(turnId: string, steeredFromTurnContext: ISteeringTurnContext | undefined): void {
		this._turns.set(turnId, {
			steeredFromTurn: steeredFromTurnContext?.turnId, steeredFromTurnContext, steeringDelivery: 'unknown',
			interactions: new Set(), truncated: false,
		});
	}

	resolveSteering(turnId: string, interactionId: string | undefined, delivery: SessionEventPayload<'user.message'>['data']['delivery']): void {
		const state = this._turns.get(turnId);
		const steeredFromTurnContext = state?.steeredFromTurnContext;
		if (!state) {
			return;
		}
		const runtimeDelivery = delivery === 'steering' || delivery === 'idle' || delivery === 'queued' ? delivery : 'unknown';
		state.steeringDelivery = runtimeDelivery;
		if (!steeredFromTurnContext) {
			if (runtimeDelivery === 'idle' || runtimeDelivery === 'queued') {
				state.originalTurnId = turnId;
			}
			return;
		}
		const shared = !!interactionId && steeredFromTurnContext.interactionIds.includes(interactionId);
		const attributionStatus = runtimeDelivery === 'idle' || runtimeDelivery === 'queued' ? 'newRequest'
			: runtimeDelivery === 'steering' && shared && steeredFromTurnContext.originalTurnId ? 'confirmed'
				: runtimeDelivery === 'steering' && interactionId && steeredFromTurnContext.interactionIds.length > 0 && !shared ? 'interactionMismatch' : 'unknown';
		state.originalTurnId = attributionStatus === 'confirmed' ? steeredFromTurnContext.originalTurnId : attributionStatus === 'newRequest' ? turnId : undefined;
		state.steeredFromTurnContext = undefined;
		this._telemetryService.publicLog2<TurnSteeringEvent, TurnSteeringClassification>('agentHost.turnSteered', {
			sdkSessionId: this._sdkSessionId, turnId, steeredFromTurn: steeredFromTurnContext.turnId,
			originalTurnId: state.originalTurnId, runtimeDelivery, attributionStatus,
		});
	}

	record(turnId: string, interactionId: string): void {
		let state = this._turns.get(turnId);
		if (!state) {
			state = { interactions: new Set(), truncated: false };
			this._turns.set(turnId, state);
		}
		if (state.interactions.has(interactionId)) {
			return;
		}
		if (state.interactions.size < this._interactionLimit) {
			state.interactions.add(interactionId);
		} else {
			state.truncated = true;
		}
	}

	get(turnId: string): IAgentTurnInteraction | undefined {
		const state = this._turns.get(turnId);
		return state ? {
			sdkSessionId: this._sdkSessionId,
			...(state.originalTurnId ? { originalTurnId: state.originalTurnId } : {}),
			...(state.steeredFromTurn ? { steeredFromTurn: state.steeredFromTurn } : {}),
			interactionIds: [...state.interactions],
			interactionIdsTruncated: state.truncated,
			...(state.steeringDelivery ? { steeringDelivery: state.steeringDelivery } : {}),
		} : undefined;
	}

	clear(): void {
		this._turns.clear();
	}
}
