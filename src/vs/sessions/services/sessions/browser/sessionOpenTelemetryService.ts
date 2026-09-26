/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { getSessionsTelemetryProviderId, SessionsTelemetryProviderId } from '../../../common/sessionsTelemetry.js';

export const SESSION_OPEN_TIMEOUT_MS = 60_000;

export type SessionOpenSource = 'sessionsList' | 'navigation' | 'link' | 'notification' | 'automation' | 'chat' | 'voice' | 'fork' | 'fallback' | 'unknown';
export type SessionOpenOutcome = 'success' | 'cancelled' | 'failure' | 'timeout';

export interface ISessionOpenTelemetryAttempt {
	readonly id: number;
}

export interface ISessionOpenTelemetryService {
	readonly _serviceBrand: undefined;

	withOpenRequest<T>(source: SessionOpenSource, token: CancellationToken, operation: (attempt: ISessionOpenTelemetryAttempt) => Promise<T>): Promise<T>;
	sessionResolved(attempt: ISessionOpenTelemetryAttempt, sessionResource: URI, providerId: string, alreadyActive: boolean, sessionWasLoading: boolean): void;
	sessionActivated(attempt: ISessionOpenTelemetryAttempt, chatResource: URI): void;
	sessionLoaded(attempt: ISessionOpenTelemetryAttempt): void;
	modelBound(sessionResource: URI, chatResource: URI): void;
	modelUnbound(sessionResource: URI, chatResource: URI): void;
	modelBindFailed(sessionResource: URI, chatResource: URI): void;
}

export const ISessionOpenTelemetryService = createDecorator<ISessionOpenTelemetryService>('sessionOpenTelemetryService');

type SessionOpenEvent = {
	outcome: string;
	source: string;
	provider: string;
	alreadyActive: boolean | undefined;
	sessionWasLoading: boolean | undefined;
	modelAlreadyBound: boolean | undefined;
	resourceResolvedDurationMs: number | undefined;
	sessionLoadedDurationMs: number | undefined;
	modelBoundDurationMs: number | undefined;
	totalDurationMs: number;
};

type SessionOpenClassification = {
	owner: 'roblourens';
	comment: 'Measures terminal outcomes and cumulative latency milestones for existing-session open requests in the Agents window.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal outcome: success, cancelled, failure, or timeout.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded surface that initiated the open request, or unknown when the caller does not provide one.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded provider category, or unknown when resolution did not identify a provider.' };
	alreadyActive: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the requested session was already active before this open changed visibility.' };
	sessionWasLoading: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the resolved session was loading when it was opened.' };
	modelAlreadyBound: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the requested session already had a chat model bound in its view.' };
	resourceResolvedDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until the session resource and provider were resolved.' };
	sessionLoadedDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until provider-backed session loading completed.' };
	modelBoundDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until the requested chat model was bound, view state was restored, and chat loading exited.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the open request until its terminal outcome.' };
};

class SessionOpenTelemetryAttempt extends Disposable implements ISessionOpenTelemetryAttempt {
	readonly stopwatch = StopWatch.create(false);
	readonly resources = this._register(new DisposableStore());
	sessionResource: URI | undefined;
	chatResource: URI | undefined;
	provider: SessionsTelemetryProviderId | 'unknown' = 'unknown';
	alreadyActive: boolean | undefined;
	sessionWasLoading: boolean | undefined;
	modelAlreadyBound: boolean | undefined;
	resourceResolvedDurationMs: number | undefined;
	sessionLoadedDurationMs: number | undefined;
	modelBoundDurationMs: number | undefined;
	modelBindFailedChatResource: URI | undefined;

	constructor(
		readonly id: number,
		readonly source: SessionOpenSource,
	) {
		super();
	}
}

export class SessionOpenTelemetryService extends Disposable implements ISessionOpenTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _boundChats = new ResourceMap<URI>();
	private _activeAttempt: SessionOpenTelemetryAttempt | undefined;
	private _nextAttemptId = 1;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._register(toDisposable(() => this._finishActive('cancelled')));
	}

	async withOpenRequest<T>(source: SessionOpenSource, token: CancellationToken, operation: (attempt: ISessionOpenTelemetryAttempt) => Promise<T>): Promise<T> {
		const attempt = this._start(source, token);
		try {
			return await operation(attempt);
		} catch (error) {
			this._finish(attempt, 'failure');
			throw error;
		}
	}

	private _start(source: SessionOpenSource, token: CancellationToken): SessionOpenTelemetryAttempt {
		this._finishActive('cancelled');

		const attempt = new SessionOpenTelemetryAttempt(this._nextAttemptId++, source);
		this._activeAttempt = attempt;
		attempt.resources.add(token.onCancellationRequested(() => this._finish(attempt, 'cancelled')));
		attempt.resources.add(disposableTimeout(() => this._finish(attempt, 'timeout'), SESSION_OPEN_TIMEOUT_MS));
		return attempt;
	}

	sessionResolved(attempt: ISessionOpenTelemetryAttempt, sessionResource: URI, providerId: string, alreadyActive: boolean, sessionWasLoading: boolean): void {
		const activeAttempt = this._getActive(attempt);
		if (!activeAttempt) {
			return;
		}

		activeAttempt.sessionResource = sessionResource;
		activeAttempt.provider = getSessionsTelemetryProviderId(providerId);
		activeAttempt.alreadyActive = alreadyActive;
		activeAttempt.sessionWasLoading = sessionWasLoading;
		activeAttempt.resourceResolvedDurationMs = this._elapsed(activeAttempt);
	}

	sessionActivated(attempt: ISessionOpenTelemetryAttempt, chatResource: URI): void {
		const activeAttempt = this._getActive(attempt);
		if (!activeAttempt?.sessionResource) {
			return;
		}

		activeAttempt.chatResource = chatResource;
		if (activeAttempt.modelBindFailedChatResource && isEqual(activeAttempt.modelBindFailedChatResource, chatResource)) {
			this._finish(activeAttempt, 'failure');
			return;
		}
		activeAttempt.modelAlreadyBound = isEqual(this._boundChats.get(activeAttempt.sessionResource), chatResource);
		if (activeAttempt.modelAlreadyBound) {
			activeAttempt.modelBoundDurationMs = this._elapsed(activeAttempt);
		}
	}

	sessionLoaded(attempt: ISessionOpenTelemetryAttempt): void {
		const activeAttempt = this._getActive(attempt);
		if (!activeAttempt) {
			return;
		}

		activeAttempt.sessionLoadedDurationMs = this._elapsed(activeAttempt);
		this._completeIfReady(activeAttempt);
	}

	modelBound(sessionResource: URI, chatResource: URI): void {
		this._boundChats.set(sessionResource, chatResource);
		const activeAttempt = this._activeAttempt;
		if (!activeAttempt?.sessionResource
			|| !activeAttempt.chatResource
			|| !isEqual(activeAttempt.sessionResource, sessionResource)
			|| !isEqual(activeAttempt.chatResource, chatResource)) {
			return;
		}

		activeAttempt.modelBoundDurationMs = this._elapsed(activeAttempt);
		this._completeIfReady(activeAttempt);
	}

	modelUnbound(sessionResource: URI, chatResource: URI): void {
		const boundChat = this._boundChats.get(sessionResource);
		if (boundChat && isEqual(boundChat, chatResource)) {
			this._boundChats.delete(sessionResource);
		}
	}

	modelBindFailed(sessionResource: URI, chatResource: URI): void {
		const activeAttempt = this._activeAttempt;
		if (!activeAttempt?.sessionResource || !isEqual(activeAttempt.sessionResource, sessionResource)) {
			return;
		}
		if (!activeAttempt.chatResource) {
			activeAttempt.modelBindFailedChatResource = chatResource;
		} else if (isEqual(activeAttempt.chatResource, chatResource)) {
			this._finish(activeAttempt, 'failure');
		} else {
			activeAttempt.modelBindFailedChatResource = chatResource;
		}
	}

	private _completeIfReady(attempt: SessionOpenTelemetryAttempt): void {
		if (attempt.sessionLoadedDurationMs !== undefined && attempt.modelBoundDurationMs !== undefined) {
			this._finish(attempt, 'success');
		}
	}

	private _getActive(attempt: ISessionOpenTelemetryAttempt): SessionOpenTelemetryAttempt | undefined {
		const activeAttempt = this._activeAttempt;
		return activeAttempt?.id === attempt.id ? activeAttempt : undefined;
	}

	private _finishActive(outcome: SessionOpenOutcome): void {
		if (this._activeAttempt) {
			this._finish(this._activeAttempt, outcome);
		}
	}

	private _finish(attempt: SessionOpenTelemetryAttempt, outcome: SessionOpenOutcome): void {
		if (this._activeAttempt !== attempt) {
			return;
		}

		this._activeAttempt = undefined;
		const resourceResolvedDurationMs = attempt.resourceResolvedDurationMs;
		const sessionLoadedDurationMs = attempt.sessionLoadedDurationMs === undefined
			? undefined
			: Math.max(resourceResolvedDurationMs ?? 0, attempt.sessionLoadedDurationMs);
		const modelBoundDurationMs = attempt.modelBoundDurationMs === undefined
			? undefined
			: Math.max(sessionLoadedDurationMs ?? resourceResolvedDurationMs ?? 0, attempt.modelBoundDurationMs);
		const totalDurationMs = Math.max(modelBoundDurationMs ?? sessionLoadedDurationMs ?? resourceResolvedDurationMs ?? 0, this._elapsed(attempt));
		attempt.dispose();

		this.telemetryService.publicLog2<SessionOpenEvent, SessionOpenClassification>('agents/sessionOpen', {
			outcome,
			source: attempt.source,
			provider: attempt.provider,
			alreadyActive: attempt.alreadyActive,
			sessionWasLoading: attempt.sessionWasLoading,
			modelAlreadyBound: attempt.modelAlreadyBound,
			resourceResolvedDurationMs,
			sessionLoadedDurationMs,
			modelBoundDurationMs,
			totalDurationMs,
		});
	}

	private _elapsed(attempt: SessionOpenTelemetryAttempt): number {
		return Math.max(0, Math.round(attempt.stopwatch.elapsed()));
	}
}

registerSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
