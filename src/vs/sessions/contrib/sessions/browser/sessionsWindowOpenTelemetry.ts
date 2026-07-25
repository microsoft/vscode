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
}

type FirstTimeWindowOpenEvent = {
	source: string;
	signInDialogShown: boolean;
	workspacePreselected: boolean | undefined;
	windowCloseDurationMs: number | undefined;
};

type FirstTimeWindowOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor entry point used to open the Agents window.' };
	signInDialogShown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial Agents setup flow showed a sign-in dialog.' };
	workspacePreselected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial new-session view had a workspace selected. Undefined when a created session was visible.' };
	windowCloseDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds before the Agents window closed, capped at three minutes.' };
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
		this._register(disposableTimeout(() => this._send(undefined), remainingDuration));
		this._register(lifecycleService.onWillShutdown(event => {
			const windowCloseDurationMs = event.reason === ShutdownReason.CLOSE || event.reason === ShutdownReason.QUIT
				? this._getCloseDuration()
				: undefined;
			this._send(windowCloseDurationMs);
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

	private _send(windowCloseDurationMs: number | undefined): void {
		if (this._didSend) {
			return;
		}
		this._didSend = true;
		this.captureInitialViewState();

		this._telemetryService.publicLog2<FirstTimeWindowOpenEvent, FirstTimeWindowOpenClassification>('agents/firstTimeWindowOpen', {
			source: this._source,
			signInDialogShown: this._getSignInDialogShown(),
			workspacePreselected: this._viewState?.workspacePreselected,
			windowCloseDurationMs,
		});
	}
}
