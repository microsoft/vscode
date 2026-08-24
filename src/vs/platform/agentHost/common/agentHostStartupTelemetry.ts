/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentHostClientType } from './agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from './agentHostTelemetry.js';

type AgentHostStartupOutcome = 'success' | 'error' | 'timeout';
type AgentHostStartupFailureStage = 'protocolConnection' | 'sessionList';

export const AgentHostStartupTimeoutMs = 2 * 60 * 1000;

interface IAgentHostStartupEvent {
	clientType: AgentHostClientType;
	connectionKind: AgentHostClientConnectionKind;
	outcome: AgentHostStartupOutcome;
	failureStage: AgentHostStartupFailureStage | undefined;
	timeToMessagePortMs: number | undefined;
	timeToProtocolConnectionMs: number | undefined;
	timeToAuthenticationSettledMs: number | undefined;
	timeToSessionListRequestMs: number | undefined;
	timeToSessionListCompleteMs: number | undefined;
	sessionListDurationMs: number | undefined;
	sessionListAttemptCount: number;
	sessionListFailureCount: number;
}

type AgentHostStartupClassification = {
	clientType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded type of the Agent Host client.' };
	connectionKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The route the client used to reach the Agent Host.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether Agent Host startup reached the first successful session list or failed to connect.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded startup stage that failed, when startup did not succeed.' };
	timeToMessagePortMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the local Agent Host start request until its initial MessagePort was acquired.' };
	timeToProtocolConnectionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the Agent Host start request until AHP initialization completed.' };
	timeToAuthenticationSettledMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the Agent Host start request until the initial authentication pass settled.' };
	timeToSessionListRequestMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the Agent Host start request until the first session-list request.' };
	timeToSessionListCompleteMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the Agent Host start request until the first successful session-list response.' };
	sessionListDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the first session-list request until the first successful response, including retries or overlapping requests.' };
	sessionListAttemptCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of session-list requests started before the first successful response or connection failure.' };
	sessionListFailureCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of session-list requests that failed before the first successful response or connection failure.' };
	owner: 'roblourens';
	comment: 'Tracks Agent Host startup performance from the client start request through AHP connection, authentication, and the first successful session list.';
};

export class AgentHostStartupTelemetry extends Disposable {

	private readonly _stopWatch;
	private readonly _timeout: IDisposable;
	private _reported = false;
	private _timeToMessagePortMs: number | undefined;
	private _timeToProtocolConnectionMs: number | undefined;
	private _timeToAuthenticationSettledMs: number | undefined;
	private _timeToSessionListRequestMs: number | undefined;
	private _sessionListAttemptCount = 0;
	private _sessionListFailureCount = 0;

	constructor(
		private readonly _clientType: AgentHostClientType,
		private readonly _connectionKind: AgentHostClientConnectionKind,
		stopWatchFactory: () => Pick<StopWatch, 'elapsed'>,
		timeoutFactory: (callback: () => void, timeoutMs: number) => IDisposable,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._stopWatch = stopWatchFactory();
		this._timeout = this._register(timeoutFactory(() => this._report('timeout', this._failureStage()), AgentHostStartupTimeoutMs));
	}

	messagePortAcquired(): void {
		this._timeToMessagePortMs ??= this._stopWatch.elapsed();
	}

	protocolConnected(): void {
		this._timeToProtocolConnectionMs ??= this._stopWatch.elapsed();
	}

	authenticationSettled(): void {
		this._timeToAuthenticationSettledMs ??= this._stopWatch.elapsed();
	}

	sessionListRequested(): void {
		if (this._reported) {
			return;
		}
		this._sessionListAttemptCount++;
		this._timeToSessionListRequestMs ??= this._stopWatch.elapsed();
	}

	sessionListFailed(): void {
		if (!this._reported) {
			this._sessionListFailureCount++;
		}
	}

	sessionListSucceeded(): void {
		this._report('success', undefined);
	}

	connectionFailed(): void {
		this._report('error', this._failureStage());
	}

	override dispose(): void {
		this._reported = true;
		super.dispose();
	}

	/** Startup reaches the session-list stage as soon as the protocol connects. */
	private _failureStage(): AgentHostStartupFailureStage {
		return this._timeToProtocolConnectionMs === undefined ? 'protocolConnection' : 'sessionList';
	}

	private _report(outcome: AgentHostStartupOutcome, failureStage: AgentHostStartupFailureStage | undefined): void {
		if (this._reported) {
			return;
		}
		this._reported = true;
		this._timeout.dispose();
		const timeToSessionListCompleteMs = outcome === 'success' ? this._stopWatch.elapsed() : undefined;
		this._telemetryService.publicLog2<IAgentHostStartupEvent, AgentHostStartupClassification>('agentHost.startup', {
			clientType: this._clientType,
			connectionKind: this._connectionKind,
			outcome,
			failureStage,
			timeToMessagePortMs: this._timeToMessagePortMs,
			timeToProtocolConnectionMs: this._timeToProtocolConnectionMs,
			timeToAuthenticationSettledMs: this._timeToAuthenticationSettledMs,
			timeToSessionListRequestMs: this._timeToSessionListRequestMs,
			timeToSessionListCompleteMs,
			sessionListDurationMs: timeToSessionListCompleteMs !== undefined && this._timeToSessionListRequestMs !== undefined
				? Math.max(0, timeToSessionListCompleteMs - this._timeToSessionListRequestMs)
				: undefined,
			sessionListAttemptCount: this._sessionListAttemptCount,
			sessionListFailureCount: this._sessionListFailureCount,
		});
	}
}
