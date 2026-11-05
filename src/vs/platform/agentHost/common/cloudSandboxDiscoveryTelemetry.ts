/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { cloudSandboxDiscoveryTriggers, CloudSandboxDiscoveryTrigger, ICloudSandboxDiscoveryResult } from './cloudSandboxAgentHost.js';

export type CloudSandboxSessionFeedOutcome = 'connected' | 'unavailable' | 'negotiationFailed' | 'socketFailed' | 'disconnected' | 'invalidMessage';

export interface ICloudSandboxSessionFeedTelemetryData {
	readonly outcome: CloudSandboxSessionFeedOutcome;
	/** Dropped sockets and failed attempts since the last healthy connection, including this failure. */
	readonly consecutiveFailures: number;
	/** Delay before the next automatic attempt; absent when the feed connected or stopped retrying. */
	readonly retryDelayMs?: number;
	/** HTTP status of a rejected negotiation request, when that caused the failure. */
	readonly statusCode?: number;
}

export interface ICloudSandboxDiscoveryTelemetryData {
	trigger: CloudSandboxDiscoveryTrigger | 'unknown';
	requestedMode: 'full' | 'incremental' | 'targeted';
	mode: 'full' | 'incremental' | 'targeted';
	outcome: ICloudSandboxDiscoveryResult['kind'] | 'cancelled';
	durationMs: number;
	pageCount: number;
	listRequestCount: number;
	taskCount: number;
	sandboxTaskCount: number;
	changedSandboxTaskCount: number;
	checkpointAdvanced: boolean;
}

type CloudSandboxDiscoveryEvent = Omit<ICloudSandboxDiscoveryTelemetryData, 'requestedMode' | 'mode' | 'outcome'> & {
	requestedMode: ICloudSandboxDiscoveryTelemetryData['requestedMode'] | 'unknown';
	mode: ICloudSandboxDiscoveryTelemetryData['mode'] | 'unknown';
	outcome: ICloudSandboxDiscoveryTelemetryData['outcome'] | 'unknown';
};

export type CloudSandboxDiscoveryClassification = {
	owner: 'osortega';
	comment: 'Measures the cause, cost and outcome of one cloud sandbox discovery attempt without task content or identifiers.';
	trigger: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason that initiated the discovery attempt.' };
	requestedMode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Mode requested at the discovery API boundary, before falling back when no incremental checkpoint exists.' };
	mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Actual full, incremental or targeted API read.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Discovery result, including partial results and cancellation; HTTP success alone is not discovery success.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed client time for this discovery attempt.' };
	pageCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Task-list responses parsed with a tasks array, including empty arrays; not a count of unique backend pages.' };
	listRequestCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Task-list HTTP attempts issued, including retries and subsequently cancelled requests.' };
	taskCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Unique task IDs returned by list pages or targeted reads, excluding cached tasks revisited locally.' };
	sandboxTaskCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Unique returned tasks identified as sandbox tasks.' };
	changedSandboxTaskCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Returned sandbox task summaries absent from or different from the client cache at scan start; not an authoritative server change count.' };
	checkpointAdvanced: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this attempt initialized or advanced the committed incremental checkpoint.' };
};

type CloudSandboxSessionFeedEvent = {
	outcome: string;
	consecutiveFailures: number;
	retryDelayMs: number | undefined;
	statusCode: number | undefined;
};

type CloudSandboxSessionFeedClassification = {
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'What happened: connected after a gap, unavailable for the account, a failed negotiation or socket handshake, a dropped socket, or an invalid feed message.' };
	consecutiveFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Dropped sockets and failed attempts since the last healthy connection, including this failure; for a connection, the failures the retries recovered from.' };
	retryDelayMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds until the next automatic attempt; absent when the feed connected or stopped retrying.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status of a rejected negotiation request, when that caused the failure.' };
	owner: 'osortega';
	comment: 'Reports cloud sandbox session feed connections, failures and retries, so windows left on discovery polling can be told apart from windows receiving push updates.';
};

export class CloudSandboxDiscoveryTelemetry {
	constructor(private readonly _telemetryService: ITelemetryService) { }
	reportDiscovery(data: ICloudSandboxDiscoveryTelemetryData): void {
		const modes = ['full', 'incremental', 'targeted'] as const;
		const outcomes = ['complete', 'scoped', 'incremental', 'partial', 'failed', 'cancelled'] as const;
		this._telemetryService.publicLog2<CloudSandboxDiscoveryEvent, CloudSandboxDiscoveryClassification>('cloudSandboxDiscovery', {
			trigger: cloudSandboxDiscoveryTriggers.find(trigger => trigger === data.trigger) ?? 'unknown',
			requestedMode: modes.find(mode => mode === data.requestedMode) ?? 'unknown',
			mode: modes.find(mode => mode === data.mode) ?? 'unknown',
			outcome: outcomes.find(outcome => outcome === data.outcome) ?? 'unknown',
			durationMs: data.durationMs,
			pageCount: data.pageCount,
			listRequestCount: data.listRequestCount,
			taskCount: data.taskCount,
			sandboxTaskCount: data.sandboxTaskCount,
			changedSandboxTaskCount: data.changedSandboxTaskCount,
			checkpointAdvanced: data.checkpointAdvanced,
		});
	}

	reportSessionFeed(data: ICloudSandboxSessionFeedTelemetryData): void {
		this._telemetryService.publicLog2<CloudSandboxSessionFeedEvent, CloudSandboxSessionFeedClassification>(
			'cloudSandboxSessionFeed',
			{
				outcome: data.outcome,
				consecutiveFailures: data.consecutiveFailures,
				retryDelayMs: data.retryDelayMs,
				statusCode: data.statusCode,
			},
		);
	}

}
