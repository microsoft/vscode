/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import type { AgentProvider } from '../common/agent.js';
import { isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import type { IAgentHostCopilotSkuClassification, IAgentHostCopilotSkuTelemetry } from './agentHostTelemetryReporter.js';

export const AgentHostSessionSubscribeTimeoutMs = 60_000;

export type AgentHostSessionSubscribeProvider = AgentProvider;
export type AgentHostSessionSubscribeChannel = 'session' | 'defaultChat' | 'chat';
export type AgentHostSessionSubscribeOutcome = 'success' | 'failure' | 'timeout';
export type AgentHostCopilotSdkResumeOutcome = 'success' | 'failure' | 'fallbackCreate' | 'incomplete' | 'notStarted';

export interface IAgentHostSessionOpenTelemetryScope {
	readonly servedFromMemory: boolean | undefined;
	setServedFromMemory(value: boolean): void;
	restoreStarted(joinedRestore: boolean): void;
	restoreCompleted(): void;
}

export interface IAgentHostSessionOpenTelemetry {
	readonly _serviceBrand: undefined;

	withSubscription<T>(resource: URI, operation: (scope: IAgentHostSessionOpenTelemetryScope) => Promise<T>): Promise<T>;
	withSdkResume<T>(session: URI, operation: () => Promise<T>): Promise<T>;
	sdkResumeFallbackCreated(session: URI): void;
}

export const IAgentHostSessionOpenTelemetry = createDecorator<IAgentHostSessionOpenTelemetry>('agentHostSessionOpenTelemetry');

type AgentHostSessionSubscribeEvent = IAgentHostCopilotSkuTelemetry & {
	provider: string;
	channel: string;
	outcome: string;
	servedFromMemory: boolean | undefined;
	joinedRestore: boolean | undefined;
	sdkResumeOutcome: string | undefined;
	sdkResumeAttemptCount: number | undefined;
	timeToRestoreStartMs: number | undefined;
	timeToSdkResumeStartMs: number | undefined;
	sdkResumeDurationMs: number | undefined;
	timeToSdkResumeCompleteMs: number | undefined;
	timeToRestoreCompleteMs: number | undefined;
	totalDurationMs: number;
};

type AgentHostSessionSubscribeClassification = IAgentHostCopilotSkuClassification & {
	owner: 'roblourens';
	comment: 'Measures Agent Host subscription latency from the subscribe request through session restoration and provider-specific resume work to the returned snapshot.';
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Agent provider identifier.' };
	channel: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded subscribed channel kind: session, defaultChat, or chat.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal subscription outcome: success, failure, or timeout.' };
	servedFromMemory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the subscribed snapshot was already materialized when the request was received.' };
	joinedRestore: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this subscription joined restoration already in progress for the session.' };
	sdkResumeOutcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal Copilot SDK resume outcome: success, failure, fallbackCreate, incomplete, or notStarted.' };
	sdkResumeAttemptCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of Copilot SDK resumeSession attempts observed while this subscription was active.' };
	timeToRestoreStartMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from subscribe receipt until session restoration began.' };
	timeToSdkResumeStartMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from subscribe receipt until the first Copilot SDK resumeSession attempt began.' };
	sdkResumeDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total milliseconds spent awaiting Copilot SDK resumeSession attempts, including a retry without a missing custom agent.' };
	timeToSdkResumeCompleteMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from subscribe receipt until the last Copilot SDK resume attempt completed.' };
	timeToRestoreCompleteMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from subscribe receipt until Agent Host session restoration produced state.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from subscribe receipt until the terminal outcome.' };
};

class AgentHostSessionOpenTelemetryAttempt extends Disposable {
	readonly stopwatch = StopWatch.create(false);
	readonly resources = this._register(new DisposableStore());
	servedFromMemory: boolean | undefined;
	joinedRestore: boolean | undefined;
	sdkResumeOutcome: AgentHostCopilotSdkResumeOutcome | undefined;
	sdkResumeAttemptCount = 0;
	timeToRestoreStartMs: number | undefined;
	timeToSdkResumeStartMs: number | undefined;
	sdkResumeDurationMs = 0;
	timeToSdkResumeCompleteMs: number | undefined;
	timeToRestoreCompleteMs: number | undefined;
	activeSdkResumeStartMs: number | undefined;

	constructor(
		readonly id: number,
		readonly session: URI,
		readonly provider: AgentHostSessionSubscribeProvider,
		readonly channel: AgentHostSessionSubscribeChannel,
	) {
		super();
		this.sdkResumeOutcome = provider === 'copilotcli' ? 'notStarted' : undefined;
	}
}

export class AgentHostSessionOpenTelemetry extends Disposable implements IAgentHostSessionOpenTelemetry {
	declare readonly _serviceBrand: undefined;

	private readonly _attempts = new Map<number, AgentHostSessionOpenTelemetryAttempt>();
	private readonly _attemptsBySession = new Map<string, Set<AgentHostSessionOpenTelemetryAttempt>>();
	private _nextAttemptId = 1;

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const attempt of this._attempts.values()) {
				attempt.dispose();
			}
			this._attempts.clear();
			this._attemptsBySession.clear();
		}));
	}

	async withSubscription<T>(resource: URI, operation: (scope: IAgentHostSessionOpenTelemetryScope) => Promise<T>): Promise<T> {
		const attempt = this._start(resource);
		let servedFromMemory: boolean | undefined;
		const scope: IAgentHostSessionOpenTelemetryScope = {
			get servedFromMemory() {
				return servedFromMemory;
			},
			setServedFromMemory: value => {
				servedFromMemory = value;
				if (attempt) {
					attempt.servedFromMemory = value;
				}
			},
			restoreStarted: joinedRestore => {
				if (attempt) {
					this._restoreStarted(attempt, joinedRestore);
				}
			},
			restoreCompleted: () => {
				if (attempt) {
					this._restoreCompleted(attempt);
				}
			},
		};
		try {
			const result = await operation(scope);
			if (attempt) {
				this._finish(attempt, 'success', servedFromMemory);
			}
			return result;
		} catch (error) {
			if (attempt) {
				this._finish(attempt, 'failure', servedFromMemory);
			}
			throw error;
		}
	}

	async withSdkResume<T>(session: URI, operation: () => Promise<T>): Promise<T> {
		this._sdkResumeStarted(session);
		try {
			const result = await operation();
			this._sdkResumeCompleted(session, 'success');
			return result;
		} catch (error) {
			this._sdkResumeCompleted(session, 'failure');
			throw error;
		}
	}

	sdkResumeFallbackCreated(session: URI): void {
		this._sdkResumeCompleted(session, 'fallbackCreate');
	}

	private _start(resource: URI): AgentHostSessionOpenTelemetryAttempt | undefined {
		const info = this._classify(resource);
		if (!info) {
			return undefined;
		}

		const attempt = new AgentHostSessionOpenTelemetryAttempt(this._nextAttemptId++, info.session, info.provider, info.channel);
		this._attempts.set(attempt.id, attempt);
		let sessionAttempts = this._attemptsBySession.get(info.session.toString());
		if (!sessionAttempts) {
			sessionAttempts = new Set();
			this._attemptsBySession.set(info.session.toString(), sessionAttempts);
		}
		sessionAttempts.add(attempt);
		attempt.resources.add(disposableTimeout(() => this._finish(attempt, 'timeout', attempt.servedFromMemory), AgentHostSessionSubscribeTimeoutMs));
		return attempt;
	}

	private _restoreStarted(attempt: AgentHostSessionOpenTelemetryAttempt, joinedRestore: boolean): void {
		const activeAttempt = this._getActive(attempt);
		if (!activeAttempt || activeAttempt.timeToRestoreStartMs !== undefined) {
			return;
		}
		activeAttempt.joinedRestore = joinedRestore;
		activeAttempt.timeToRestoreStartMs = this._elapsed(activeAttempt);
	}

	private _restoreCompleted(attempt: AgentHostSessionOpenTelemetryAttempt): void {
		const activeAttempt = this._getActive(attempt);
		if (activeAttempt?.timeToRestoreStartMs !== undefined) {
			activeAttempt.timeToRestoreCompleteMs = this._elapsed(activeAttempt);
		}
	}

	private _sdkResumeStarted(session: URI): void {
		for (const attempt of this._getSessionAttempts(session)) {
			const elapsed = this._elapsed(attempt);
			attempt.timeToSdkResumeStartMs ??= elapsed;
			attempt.activeSdkResumeStartMs = elapsed;
			attempt.sdkResumeAttemptCount++;
		}
	}

	private _sdkResumeCompleted(session: URI, outcome: Exclude<AgentHostCopilotSdkResumeOutcome, 'notStarted'>): void {
		for (const attempt of this._getSessionAttempts(session)) {
			const elapsed = this._elapsed(attempt);
			if (attempt.activeSdkResumeStartMs !== undefined) {
				attempt.sdkResumeDurationMs += Math.max(0, elapsed - attempt.activeSdkResumeStartMs);
				attempt.timeToSdkResumeCompleteMs = elapsed;
				attempt.activeSdkResumeStartMs = undefined;
				attempt.sdkResumeOutcome = outcome;
			} else if (outcome === 'fallbackCreate' && attempt.sdkResumeAttemptCount > 0) {
				attempt.sdkResumeOutcome = outcome;
			}
		}
	}

	private _finish(attempt: AgentHostSessionOpenTelemetryAttempt, outcome: AgentHostSessionSubscribeOutcome, servedFromMemory: boolean | undefined): void {
		if (!this._attempts.delete(attempt.id)) {
			return;
		}
		const sessionKey = attempt.session.toString();
		const sessionAttempts = this._attemptsBySession.get(sessionKey);
		sessionAttempts?.delete(attempt);
		if (sessionAttempts?.size === 0) {
			this._attemptsBySession.delete(sessionKey);
		}

		const elapsed = this._elapsed(attempt);
		if (attempt.activeSdkResumeStartMs !== undefined) {
			attempt.sdkResumeDurationMs += Math.max(0, elapsed - attempt.activeSdkResumeStartMs);
			attempt.activeSdkResumeStartMs = undefined;
			attempt.sdkResumeOutcome = 'incomplete';
		}

		const timeToRestoreStartMs = attempt.timeToRestoreStartMs;
		const timeToSdkResumeStartMs = attempt.timeToSdkResumeStartMs === undefined
			? undefined
			: Math.max(timeToRestoreStartMs ?? 0, attempt.timeToSdkResumeStartMs);
		const timeToSdkResumeCompleteMs = attempt.timeToSdkResumeCompleteMs === undefined
			? undefined
			: Math.max(timeToSdkResumeStartMs ?? timeToRestoreStartMs ?? 0, attempt.timeToSdkResumeCompleteMs);
		const timeToRestoreCompleteMs = attempt.timeToRestoreCompleteMs === undefined
			? undefined
			: Math.max(timeToSdkResumeCompleteMs ?? timeToRestoreStartMs ?? 0, attempt.timeToRestoreCompleteMs);
		const totalDurationMs = Math.max(timeToRestoreCompleteMs ?? timeToSdkResumeCompleteMs ?? timeToRestoreStartMs ?? 0, elapsed);
		attempt.dispose();

		this._telemetryService.publicLog2<AgentHostSessionSubscribeEvent, AgentHostSessionSubscribeClassification>('agentHost.sessionSubscribe', {
			provider: attempt.provider,
			channel: attempt.channel,
			outcome,
			servedFromMemory,
			joinedRestore: attempt.joinedRestore,
			sdkResumeOutcome: attempt.sdkResumeOutcome,
			sdkResumeAttemptCount: attempt.provider === 'copilotcli' ? attempt.sdkResumeAttemptCount : undefined,
			timeToRestoreStartMs,
			timeToSdkResumeStartMs,
			sdkResumeDurationMs: attempt.sdkResumeAttemptCount > 0 ? attempt.sdkResumeDurationMs : undefined,
			timeToSdkResumeCompleteMs,
			timeToRestoreCompleteMs,
			totalDurationMs,
		});
	}

	private _getActive(attempt: AgentHostSessionOpenTelemetryAttempt): AgentHostSessionOpenTelemetryAttempt | undefined {
		return this._attempts.get(attempt.id);
	}

	private _getSessionAttempts(session: URI): readonly AgentHostSessionOpenTelemetryAttempt[] {
		return [...(this._attemptsBySession.get(session.toString()) ?? [])];
	}

	private _elapsed(attempt: AgentHostSessionOpenTelemetryAttempt): number {
		return Math.max(0, Math.round(attempt.stopwatch.elapsed()));
	}

	private _classify(resource: URI): { readonly session: URI; readonly provider: AgentHostSessionSubscribeProvider; readonly channel: AgentHostSessionSubscribeChannel } | undefined {
		const resourceString = resource.toString();
		const session = isAhpChatChannel(resourceString)
			? URI.parse(parseRequiredSessionUriFromChatUri(resourceString))
			: resource;
		const provider = this._providerService.getProviderForSession(session)?.id;
		if (!provider) {
			return undefined;
		}
		return {
			session,
			provider,
			channel: !isAhpChatChannel(resourceString) ? 'session' : isDefaultChatUri(resource) ? 'defaultChat' : 'chat',
		};
	}
}
