/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { ILifecycleService, ShutdownReason } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IWorkspaceSelectionSnapshot, WorkspaceArgumentKind } from '../../../common/workspaceSelection.js';

export const FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS = 3 * 60 * 1000;

export interface ISessionsWindowOpenViewState {
	readonly workspacePreselected: boolean | undefined;
	readonly workspacePreselectionSource: string | undefined;
	readonly viewKind: 'newSession' | 'createdSession' | 'noComposer';
	readonly workspaceSelection?: IWorkspaceSelectionSnapshot;
}

export interface ISessionsWindowOpenContext {
	readonly workspaceArgumentKind: WorkspaceArgumentKind;
	readonly hasSessionArgument: boolean;
	readonly workspaceArgumentIsDefault?: boolean;
}

export type WorkspaceHandoffState = 'notRequested' | 'notApplicable' | 'unsupportedWorkspace'
	| 'waitingForSetup' | 'waitingForSessionView' | 'waitingForProvider' | 'providerUnavailable'
	| 'viewUnavailable' | 'sessionAlreadyCreated' | 'selectionRequested' | 'selectionNotApplied' | 'applied' | 'error'
	| 'userChanged' | 'superseded' | 'cancelled' | 'preservedSession';

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
type FirstTimeWindowOpenCaptureReason = 'initialization' | FirstTimeWindowOpenEmissionReason;

interface ISessionsWindowOpenSnapshot extends ISessionsWindowOpenViewState {
	readonly captureReason: FirstTimeWindowOpenCaptureReason;
	readonly captureDurationMs: number;
	readonly workspaceHandoffState: WorkspaceHandoffState;
}

type FirstTimeWindowOpenEvent = {
	source: string;
	signInDialogShown: boolean;
	workspacePreselected: boolean | undefined;
	workspacePreselectionSource: string | undefined;
	workspaceArgumentKind: WorkspaceArgumentKind;
	hasSessionArgument: boolean;
	workspaceArgumentIsDefault: boolean;
	initialViewKind: ISessionsWindowOpenViewState['viewKind'];
	initialStateCaptureReason: FirstTimeWindowOpenCaptureReason;
	initialStateCaptureDurationMs: number;
	workspaceSelectionOrigin: IWorkspaceSelectionSnapshot['origin'] | undefined;
	workspaceSelectionState: IWorkspaceSelectionSnapshot['state'] | undefined;
	workspaceHistoryState: IWorkspaceSelectionSnapshot['historyState'] | undefined;
	workspaceSessionFallbackState: IWorkspaceSelectionSnapshot['sessionFallbackState'] | undefined;
	workspaceProviderCount: number | undefined;
	workspaceHandoffState: WorkspaceHandoffState;
	workspaceHandoffStateAtEmission: WorkspaceHandoffState;
	workspaceHandoffDurationMs: number | undefined;
	viewKindAtEmission: ISessionsWindowOpenViewState['viewKind'];
	workspacePreselectedAtEmission: boolean | undefined;
	workspaceSelectionOriginAtEmission: IWorkspaceSelectionSnapshot['origin'] | undefined;
	workspaceSelectionStateAtEmission: IWorkspaceSelectionSnapshot['state'] | undefined;
	windowCloseDurationMs: number | undefined;
	emissionReason: FirstTimeWindowOpenEmissionReason;
};

type FirstTimeWindowOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor entry point used to open the Agents window.' };
	signInDialogShown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial Agents setup flow showed a sign-in dialog.' };
	workspacePreselected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial new-session view had a workspace selected. Undefined when a created session was visible.' };
	workspacePreselectionSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the initial new-session workspace was selected: checked workspace, recent workspace, existing sessions, provided workspace, user selection, none, or unknown. Undefined when a created session was visible.' };
	workspaceArgumentKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Kind of workspace argument received by the initial window open: none, local, devContainer, remote, or other. Contains no URI or authority.' };
	hasSessionArgument: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial window open requested an existing session, which takes precedence over a workspace argument.' };
	workspaceArgumentIsDefault: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the initial workspace argument was inferred from the invoking editor and must not replace an existing session or user choice.' };
	initialViewKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the initial snapshot saw a new-session composer, a created session, or no composer.' };
	initialStateCaptureReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Why the initial snapshot was captured: initialization, timer, close, quit, reload, or otherShutdown. Distinct from the later emission reason.' };
	initialStateCaptureDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time from initial open IPC to the initial snapshot, capped at three minutes.' };
	workspaceSelectionOrigin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Origin of the initially selected folder: none, checkedWorkspace, agentsRecent, vscodeRecent, vscodeWorkspace, existingSessions, windowOpen, windowContext, restoredDraft, sessionSync, programmatic, or user. Same-folder synchronization preserves the original origin.' };
	workspaceSelectionState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Initial picker state: none, noWorkspace, selected, or unresolved. Selected means provider-resolved, not that a session is ready to run.' };
	workspaceHistoryState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'VS Code recent-folder history lookup state at capture: loading, loaded, or error. Loaded means a lookup completed, not that every provider is ready.' };
	workspaceSessionFallbackState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Existing-session workspace lookup state at capture: idle, pending, completed, error, or disabled. Completed may have found no candidate.' };
	workspaceProviderCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of registered session providers at capture, capped at 100. Registration does not imply readiness.' };
	workspaceHandoffState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Initial workspace handoff state at capture: notRequested, notApplicable, unsupportedWorkspace, waitingForSetup, waitingForSessionView, waitingForProvider, providerUnavailable, viewUnavailable, sessionAlreadyCreated, selectionRequested, selectionNotApplied, applied, error, userChanged, superseded, cancelled, or preservedSession. Applied requires the target view to acknowledge its provider-resolved selection.' };
	workspaceHandoffStateAtEmission: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Latest state of the initial workspace handoff when the event is emitted, using the same states as workspaceHandoffState.' };
	workspaceHandoffDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time from initial open IPC to observing the handed-off folder in the composer after selection, capped at three minutes. Undefined if not observed.' };
	viewKindAtEmission: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'View kind at delayed emission: newSession, createdSession, or noComposer. Not a selection-settled signal.' };
	workspacePreselectedAtEmission: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the new-session view has a workspace when this event is emitted. May include later user actions; undefined for a created session.' };
	workspaceSelectionOriginAtEmission: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Detailed workspace origin at delayed emission, using the same values as workspaceSelectionOrigin. Allows later user selection to be distinguished from automatic selection.' };
	workspaceSelectionStateAtEmission: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Picker state at delayed emission: none, noWorkspace, selected, or unresolved. Not a selection-settled signal.' };
	windowCloseDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds before the Agents window closed, capped at three minutes.' };
	emissionReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the delayed first-time window event was emitted: timer, close, quit, reload, or otherShutdown.' };
	owner: 'benibenj';
	comment: 'Tracks how users who have never started an Agents session enter and initially experience the Agents window.';
};

export class SessionsWindowOpenTelemetry extends Disposable {

	private _viewState: ISessionsWindowOpenSnapshot | undefined;
	private _workspaceHandoffState: WorkspaceHandoffState;
	private _workspaceHandoffDurationMs: number | undefined;
	private _didSend = false;
	private readonly _openedAt = Date.now();

	constructor(
		private readonly _source: AgentsWindowOpenSource,
		private readonly _context: ISessionsWindowOpenContext,
		private readonly _getSignInDialogShown: () => boolean,
		private readonly _getViewState: () => ISessionsWindowOpenViewState,
		private readonly _telemetryService: ITelemetryService,
		lifecycleService: ILifecycleService,
	) {
		super();
		this._workspaceHandoffState = _context.hasSessionArgument ? 'notApplicable'
			: _context.workspaceArgumentKind === 'none' ? 'notRequested' : 'unsupportedWorkspace';

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
		if (!this._viewState) {
			this._captureInitialViewState('initialization', this._getViewState());
		}
	}

	recordWorkspaceHandoffState(state: WorkspaceHandoffState): void {
		if (this._didSend) {
			return;
		}
		this._workspaceHandoffState = state;
		if (state === 'applied') {
			this._workspaceHandoffDurationMs ??= Math.min(this._elapsed(), FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
		}
	}

	private _captureInitialViewState(reason: FirstTimeWindowOpenCaptureReason, state: ISessionsWindowOpenViewState): ISessionsWindowOpenSnapshot {
		if (this._viewState) {
			return this._viewState;
		}
		return this._viewState = {
			...state,
			workspaceSelection: state.workspaceSelection ? { ...state.workspaceSelection } : undefined,
			captureReason: reason,
			captureDurationMs: Math.min(this._elapsed(), FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS),
			workspaceHandoffState: this._workspaceHandoffState,
		};
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
		const emissionState = this._getViewState();
		const initialState = this._captureInitialViewState(emissionReason, emissionState);
		const selection = initialState.workspaceSelection;

		this._telemetryService.publicLog2<FirstTimeWindowOpenEvent, FirstTimeWindowOpenClassification>('agents/firstTimeWindowOpen', {
			source: this._source,
			signInDialogShown: this._getSignInDialogShown(),
			workspacePreselected: initialState.workspacePreselected,
			workspacePreselectionSource: initialState.workspacePreselectionSource,
			workspaceArgumentKind: this._context.workspaceArgumentKind,
			hasSessionArgument: this._context.hasSessionArgument,
			workspaceArgumentIsDefault: this._context.workspaceArgumentIsDefault ?? false,
			initialViewKind: initialState.viewKind,
			initialStateCaptureReason: initialState.captureReason,
			initialStateCaptureDurationMs: initialState.captureDurationMs,
			workspaceSelectionOrigin: selection?.origin,
			workspaceSelectionState: selection?.state,
			workspaceHistoryState: selection?.historyState,
			workspaceSessionFallbackState: selection?.sessionFallbackState,
			workspaceProviderCount: selection ? Math.min(selection.registeredProviderCount, 100) : undefined,
			workspaceHandoffState: initialState.workspaceHandoffState,
			workspaceHandoffStateAtEmission: this._workspaceHandoffState,
			workspaceHandoffDurationMs: this._workspaceHandoffDurationMs,
			viewKindAtEmission: emissionState.viewKind,
			workspacePreselectedAtEmission: emissionState.workspacePreselected,
			workspaceSelectionOriginAtEmission: emissionState.workspaceSelection?.origin,
			workspaceSelectionStateAtEmission: emissionState.workspaceSelection?.state,
			windowCloseDurationMs,
			emissionReason,
		});
	}
}
