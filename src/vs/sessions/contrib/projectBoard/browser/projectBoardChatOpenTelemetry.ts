/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { getSessionsTelemetryProviderId, SessionsTelemetryProviderId } from '../../../common/sessionsTelemetry.js';

export type ProjectBoardChatOpenSurface = 'embeddedSidePanel' | 'standaloneSidePanel' | 'separateWindow';
export type ProjectBoardChatOpenOutcome = 'success' | 'cancelled' | 'denied' | 'failure';

export type ProjectBoardChatOpenStage = 'trustDurationMs' | 'hostReadyDurationMs' | 'loadingPaintDurationMs' | 'providerResolveDurationMs' | 'modelAcquireDurationMs' | 'modelBindDurationMs' | 'viewRestoreDurationMs';

type ProjectBoardChatOpenEvent = {
	surface: ProjectBoardChatOpenSurface;
	outcome: ProjectBoardChatOpenOutcome;
	provider: SessionsTelemetryProviderId;
	reused: boolean;
	requestCount: number | undefined;
	loadingPresentedDurationMs: number | undefined;
	trustDurationMs: number | undefined;
	hostReadyDurationMs: number | undefined;
	loadingPaintDurationMs: number | undefined;
	providerResolveDurationMs: number | undefined;
	modelAcquireDurationMs: number | undefined;
	modelBindDurationMs: number | undefined;
	viewRestoreDurationMs: number | undefined;
	contentReadyDurationMs: number | undefined;
	transcriptPaintOpportunityDurationMs: number | undefined;
	totalDurationMs: number;
};

type ProjectBoardChatOpenClassification = {
	owner: 'roblourens';
	comment: 'Measures stage and cumulative latency for opening an existing chat from Agents Hub.';
	surface: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded Agents Hub surface used to open the chat.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal outcome: success, cancelled, denied, or failure.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded provider category.' };
	reused: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether an already loaded exact-chat UI was reused.' };
	requestCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of requests in the bound transcript, so stage durations can be attributed to transcript length.' };
	loadingPresentedDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds until loading feedback was synchronously attached.' };
	trustDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent checking whether the session can be opened.' };
	hostReadyDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent preparing the target pane, editor, or auxiliary window.' };
	loadingPaintDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent yielding two animation-frame opportunities for loading feedback before model binding.' };
	providerResolveDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent resolving a contributed chat provider before model acquisition.' };
	modelAcquireDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent acquiring or loading the exact chat model.' };
	modelBindDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Synchronous milliseconds spent binding the model to the chat widget.' };
	viewRestoreDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Synchronous milliseconds spent restoring view state, exiting loading, and laying out the widget.' };
	contentReadyDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds until the exact model was bound and the chat content completed synchronous layout.' };
	transcriptPaintOpportunityDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds until two animation-frame opportunities followed content readiness. This is not proof of physical display presentation.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the open request until its terminal outcome.' };
};

export class ProjectBoardChatOpenTelemetry {
	private readonly stopwatch = StopWatch.create(false);
	private readonly stages: Partial<Record<ProjectBoardChatOpenStage, number>> = {};
	private loadingPresentedDurationMs: number | undefined;
	private contentReadyDurationMs: number | undefined;
	private transcriptPaintOpportunityDurationMs: number | undefined;
	private requestCount: number | undefined;
	private finished = false;

	constructor(
		private readonly surface: ProjectBoardChatOpenSurface,
		providerId: string,
		private reused: boolean,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this.provider = getSessionsTelemetryProviderId(providerId);
	}

	private readonly provider: SessionsTelemetryProviderId;

	loadingPresented(): void {
		this.loadingPresentedDurationMs ??= this.elapsed();
	}

	setReused(reused: boolean): void {
		this.reused = reused;
	}

	setRequestCount(count: number): void {
		this.requestCount = count;
	}

	async measure<T>(stage: ProjectBoardChatOpenStage, operation: () => Promise<T>): Promise<T> {
		const stopwatch = StopWatch.create(false);
		try {
			return await operation();
		} finally {
			this.stages[stage] = Math.max(0, Math.round(stopwatch.elapsed()));
		}
	}

	measureSync<T>(stage: ProjectBoardChatOpenStage, operation: () => T): T {
		const stopwatch = StopWatch.create(false);
		try {
			return operation();
		} finally {
			this.stages[stage] = Math.max(0, Math.round(stopwatch.elapsed()));
		}
	}

	contentReady(): void {
		this.contentReadyDurationMs ??= this.elapsed();
	}

	transcriptPaintOpportunity(): void {
		this.transcriptPaintOpportunityDurationMs ??= this.elapsed();
	}

	finish(outcome: ProjectBoardChatOpenOutcome): void {
		if (this.finished) {
			return;
		}
		this.finished = true;
		this.telemetryService.publicLog2<ProjectBoardChatOpenEvent, ProjectBoardChatOpenClassification>('agentsHub/chatOpen', {
			surface: this.surface,
			outcome,
			provider: this.provider,
			reused: this.reused,
			requestCount: this.requestCount,
			loadingPresentedDurationMs: this.loadingPresentedDurationMs,
			trustDurationMs: this.stages.trustDurationMs,
			hostReadyDurationMs: this.stages.hostReadyDurationMs,
			loadingPaintDurationMs: this.stages.loadingPaintDurationMs,
			providerResolveDurationMs: this.stages.providerResolveDurationMs,
			modelAcquireDurationMs: this.stages.modelAcquireDurationMs,
			modelBindDurationMs: this.stages.modelBindDurationMs,
			viewRestoreDurationMs: this.stages.viewRestoreDurationMs,
			contentReadyDurationMs: this.contentReadyDurationMs,
			transcriptPaintOpportunityDurationMs: this.transcriptPaintOpportunityDurationMs,
			totalDurationMs: this.elapsed(),
		});
	}

	private elapsed(): number {
		return Math.max(0, Math.round(this.stopwatch.elapsed()));
	}
}
