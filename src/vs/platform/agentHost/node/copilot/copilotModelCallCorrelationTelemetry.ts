/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import type { AgentModelCallCorrelationIssue } from '../../common/agent.js';
import type { ModelCallTurnCorrelationOutcome } from './modelCallTurnCorrelation.js';

export type CopilotModelCallCorrelationOutcome = ModelCallTurnCorrelationOutcome | 'sessionNotFound' | 'activeTurnFallback' | 'noActiveTurn';

export interface ICopilotModelCallCorrelationTelemetry {
	readonly ahCorrelationOutcome: CopilotModelCallCorrelationOutcome;
	readonly ahCorrelationWaitMs?: number;
	readonly ahActiveTurnPresent?: boolean;
	readonly ahSessionDisposedDuringWait?: boolean;
	readonly ahModelCallKey?: string;
}

type CompletionOutcome = AgentModelCallCorrelationIssue | 'cancelledRoot' | 'unmappedSubagent' | 'mappingAfterResponse';

type CompletionEvent = {
	ahModelCallKey: string | undefined;
	outcome: CompletionOutcome;
	responseOutcome: CopilotModelCallCorrelationOutcome | undefined;
	timeSinceResponseMs: number | undefined;
};

type CompletionClassification = {
	owner: 'amunger';
	comment: 'Diagnoses late or unroutable Copilot model-call completions without changing turn attribution. Late-response tracking is bounded and ends on session disposal.';
	ahModelCallKey: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SHA-256 hex join key scoped to the telemetry process, SDK session, and native model-call identifier. Not a turn identifier.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded completion routing outcome, or a mapping observed after an uncorrelated response.' };
	responseOutcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Earlier uncorrelated response decision, when retained in the bounded session cache.' };
	timeSinceResponseMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since the retained uncorrelated response was forwarded. Absent if that response was not observed or is no longer retained.' };
};

/** Namespaces native IDs before telemetry scrubbing, without exposing them or joining across host lifetimes. */
export function getCopilotModelCallKey(telemetrySessionId: string, sdkSessionId: string | undefined, modelCallId: string | undefined): string | undefined {
	return sdkSessionId && modelCallId
		? createHash('sha256').update(JSON.stringify([telemetrySessionId, sdkSessionId, modelCallId])).digest('hex')
		: undefined;
}

/** Observes correlation failures independently of the one-shot attribution cache. */
export class CopilotModelCallCorrelationTelemetry extends Disposable {
	private readonly _uncorrelatedResponses: LRUCache<string, { readonly outcome: CopilotModelCallCorrelationOutcome; readonly time: number }>;
	private readonly _now: () => number;

	constructor(
		private readonly _sdkSessionId: string,
		private readonly _telemetryService: ITelemetryService,
		options: { readonly cacheLimit?: number; readonly now?: () => number } = {},
	) {
		super();
		this._uncorrelatedResponses = new LRUCache(options.cacheLimit ?? 1000);
		this._now = options.now ?? (() => performance.now());
	}

	get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	recordUncorrelatedResponse(modelCallId: string, outcome: CopilotModelCallCorrelationOutcome): void {
		if (this._isEnabled() && modelCallId && !this._uncorrelatedResponses.has(modelCallId)) {
			this._uncorrelatedResponses.set(modelCallId, { outcome, time: this._now() });
		}
	}

	recordMapping(modelCallId: string): void {
		if (this._isEnabled() && this._uncorrelatedResponses.has(modelCallId)) {
			this.reportCompletionIssue(modelCallId, 'mappingAfterResponse');
			this._uncorrelatedResponses.delete(modelCallId);
		}
	}

	reportCompletionIssue(modelCallId: string, outcome: CompletionOutcome): void {
		if (!this._isEnabled()) {
			return;
		}
		const response = this._uncorrelatedResponses.get(modelCallId);
		this._telemetryService.publicLog2<CompletionEvent, CompletionClassification>('agentHost.copilotModelCallCorrelation', {
			ahModelCallKey: getCopilotModelCallKey(this._telemetryService.sessionId, this._sdkSessionId, modelCallId),
			outcome,
			responseOutcome: response?.outcome,
			timeSinceResponseMs: response ? this._now() - response.time : undefined,
		});
	}

	private _isEnabled(): boolean {
		if (this.isDisposed || this._telemetryService.telemetryLevel !== TelemetryLevel.USAGE) {
			this._uncorrelatedResponses.clear();
			return false;
		}
		return true;
	}

	override dispose(): void {
		this._uncorrelatedResponses.clear();
		super.dispose();
	}
}
