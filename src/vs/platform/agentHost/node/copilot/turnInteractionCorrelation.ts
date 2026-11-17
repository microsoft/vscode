/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

type InteractionEvidence = 'userMessage' | 'assistantTurnStart' | 'modelCall';

type TurnInteractionEvent = {
	sdkSessionId: string;
	turnId: string;
	interactionId: string;
	originalTurnId: string | undefined;
	evidence: InteractionEvidence;
};

type TurnInteractionClassification = {
	owner: 'amunger';
	comment: 'Records observed many-to-many host-turn/runtime-interaction associations, independently of execution routing. Not proof of a human initiator or complete descendant attribution.';
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SDK session scope of the runtime interaction.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Host execution turn identified by the SDK boundary or exact model-call mapping.' };
	interactionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Runtime interaction identifier; may be shared by multiple execution turns.' };
	originalTurnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'First host turn in an observed root steering chain; absent when its lineage is unavailable. Not a cross-chat originating trigger.' };
	evidence: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Source of the association: userMessage, assistantTurnStart, or modelCall.' };
};

type TurnSteeringEvent = {
	sdkSessionId: string;
	turnId: string;
	previousTurnId: string;
	originalTurnId: string;
};

type TurnSteeringClassification = {
	owner: 'amunger';
	comment: 'Links a promoted steering execution turn to the execution it interrupted and the original turn of that chain. Does not change execution ownership.';
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SDK session scope of the steering chain.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'New host execution turn for consumed steering.' };
	previousTurnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Host execution turn interrupted by the steering message.' };
	originalTurnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'First host execution turn in this observed steering chain.' };
};

/** Bounded analytical evidence only; never used to route SDK events or infer a call's owner. */
export class TurnInteractionCorrelation {
	private readonly _originalTurns: LRUCache<string, string>;
	private readonly _reported: LRUCache<string, true>;

	constructor(
		private readonly _sdkSessionId: string,
		private readonly _telemetryService: ITelemetryService,
		cacheLimit = 1000,
	) {
		this._originalTurns = new LRUCache(cacheLimit);
		this._reported = new LRUCache(cacheLimit);
	}

	startTurn(turnId: string, originalTurnId = turnId): void {
		this._originalTurns.set(turnId, originalTurnId);
	}

	deferTurnOrigin(turnId: string): void {
		this._originalTurns.delete(turnId);
	}

	steer(turnId: string, previousTurnId: string, originalTurnId: string): void {
		this.startTurn(turnId, originalTurnId);
		this._telemetryService.publicLog2<TurnSteeringEvent, TurnSteeringClassification>('agentHost.turnSteered', {
			sdkSessionId: this._sdkSessionId, turnId, previousTurnId, originalTurnId,
		});
	}

	record(turnId: string, interactionId: string, evidence: InteractionEvidence): void {
		const originalTurnId = this._originalTurns.get(turnId);
		const key = JSON.stringify([turnId, interactionId, originalTurnId]);
		if (this._reported.get(key)) {
			return;
		}
		this._reported.set(key, true);
		this._telemetryService.publicLog2<TurnInteractionEvent, TurnInteractionClassification>('agentHost.turnInteractionCorrelated', {
			sdkSessionId: this._sdkSessionId,
			turnId,
			interactionId,
			originalTurnId,
			evidence,
		});
	}

	clear(): void {
		this._originalTurns.clear();
		this._reported.clear();
	}
}
