/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { ILifecycleService, ShutdownReason } from '../../../../workbench/services/lifecycle/common/lifecycle.js';

export const FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS = 3 * 60 * 1000;

export interface ISessionsWindowOpenViewState {
	readonly workspacePreselected: boolean | undefined;
	readonly workspacePreselectionSource: string | undefined;
}

type SessionsWindowSessionStartEvent = {
	sessionStart: boolean;
	source: string;
	hasPreviouslyStartedSession: boolean;
};

type SessionsWindowSessionStartClassification = {
	owner: 'benibenj';
	comment: 'Reports one Agents window lifecycle start for device-day retention. The common.isAgentsWindow property scopes this event to the Agents window.';
	sessionStart: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Always true for an Agents window lifecycle start event.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor entry point used to open the Agents window.' };
	hasPreviouslyStartedSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the application-scoped session-start counter was nonzero when this Agents window lifecycle began.' };
};

/** Emits the single lifecycle-start event for an Agents window instance. */
export class SessionsWindowSessionStartTelemetry {
	constructor(source: AgentsWindowOpenSource, hasPreviouslyStartedSession: boolean, telemetryService: ITelemetryService) {
		telemetryService.publicLog2<SessionsWindowSessionStartEvent, SessionsWindowSessionStartClassification>('agents/windowSessionStart', {
			sessionStart: true,
			source,
			hasPreviouslyStartedSession,
		});
	}
}

type FirstTimeWindowOpenEmissionReason = 'timer' | 'close' | 'quit' | 'reload' | 'otherShutdown';

type FirstTimeWindowOpenEvent = {
	source: string;
	signInDialogShown: boolean;
	workspacePreselected: boolean | undefined;
	workspacePreselectionSource: string | undefined;
	windowCloseDurationMs: number | undefined;
	emissionReason: FirstTimeWindowOpenEmissionReason;
};

type FirstTimeWindowOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor entry point used to open the Agents window.' };
	signInDialogShown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial Agents setup flow showed a sign-in dialog.' };
	workspacePreselected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial new-session view had a workspace selected. Undefined when a created session was visible.' };
	workspacePreselectionSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the initial new-session workspace was selected: checked workspace, recent workspace, existing sessions, provided workspace, user selection, none, or unknown. Undefined when a created session was visible.' };
	windowCloseDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds before the Agents window closed, capped at three minutes.' };
	emissionReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the delayed first-time window event was emitted: timer, close, quit, reload, or otherShutdown.' };
	owner: 'benibenj';
	comment: 'Tracks how users who have never started an Agents session enter and initially experience the Agents window.';
};

export class SessionsWindowOpenTelemetry extends Disposable {

	private _viewState: ISessionsWindowOpenViewState | undefined;
	private _didSend = false;
	private readonly _openedAt = Date.now();

	constructor(
		private readonly _source: AgentsWindowOpenSource,
		private readonly _getSignInDialogShown: () => boolean,
		private readonly _getViewState: () => ISessionsWindowOpenViewState,
		private readonly _telemetryService: ITelemetryService,
		lifecycleService: ILifecycleService,
	) {
		super();

		const remainingDuration = Math.max(0, FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS - this._elapsed());
		this._register(disposableTimeout(() => this._send('timer', undefined), remainingDuration));
		this._register(lifecycleService.onWillShutdown(event => {
			const windowCloseDurationMs = event.reason === ShutdownReason.CLOSE || event.reason === ShutdownReason.QUIT
				? this._getCloseDuration()
				: undefined;
			this._send(this._getEmissionReason(event.reason), windowCloseDurationMs);
		}));
	}

	captureInitialViewState(): void {
		this._viewState ??= this._getViewState();
	}

	private _elapsed(): number {
		return Math.max(0, Date.now() - this._openedAt);
	}

	private _getCloseDuration(): number | undefined {
		const duration = this._elapsed();
		return duration <= FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS ? duration : undefined;
	}

	private _getEmissionReason(reason: ShutdownReason): FirstTimeWindowOpenEmissionReason {
		switch (reason) {
			case ShutdownReason.CLOSE:
				return 'close';
			case ShutdownReason.QUIT:
				return 'quit';
			case ShutdownReason.RELOAD:
				return 'reload';
			default:
				return 'otherShutdown';
		}
	}

	private _send(emissionReason: FirstTimeWindowOpenEmissionReason, windowCloseDurationMs: number | undefined): void {
		if (this._didSend) {
			return;
		}
		this._didSend = true;
		this.captureInitialViewState();

		this._telemetryService.publicLog2<FirstTimeWindowOpenEvent, FirstTimeWindowOpenClassification>('agents/firstTimeWindowOpen', {
			source: this._source,
			signInDialogShown: this._getSignInDialogShown(),
			workspacePreselected: this._viewState?.workspacePreselected,
			workspacePreselectionSource: this._viewState?.workspacePreselectionSource,
			windowCloseDurationMs,
			emissionReason,
		});
	}
}
