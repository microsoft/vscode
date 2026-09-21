/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { ILifecycleService, ShutdownReason } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../common/workspaceSelection.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions } from '../../../services/sessions/common/sessionsProvider.js';
import { INewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, ISessionsWindowOpenContext } from './sessionsWindowOpenTelemetry.js';

type ObservationReason = 'firstRequest' | 'timer' | 'close' | 'quit' | 'reload' | 'otherShutdown';

interface IDefaultWorkspace {
	readonly folderUri: URI;
	readonly origin: WorkspaceSelectionOrigin;
	readonly durationMs: number;
	readyDurationMs?: number;
}

interface IRequestSelection {
	readonly defaultWorkspace: IDefaultWorkspace | undefined;
	readonly selection: IWorkspaceSelectionSnapshot | undefined;
	readonly userSelectedWorkspace: boolean;
}

type WorkspaceSelectionOutcomeEvent = {
	source: AgentsWindowOpenSource;
	workspaceArgumentKind: ISessionsWindowOpenContext['workspaceArgumentKind'];
	workspaceArgumentIsDefault: boolean;
	observationReason: ObservationReason;
	observationDurationMs: number;
	firstRequestSent: boolean;
	defaultAvailable: boolean;
	defaultOrigin: WorkspaceSelectionOrigin | undefined;
	timeToDefaultMs: number | undefined;
	timeToUsableDefaultMs: number | undefined;
	userSelectedWorkspace: boolean;
	defaultRetainedAtFirstRequest: boolean | undefined;
	workspaceSelectedAtFirstRequest: boolean | undefined;
};

type WorkspaceSelectionOutcomeClassification = {
	owner: 'benibenj';
	comment: 'Reports workspace-default acceptance and first-request conversion for first-time Agents window openings within three minutes. No request in that interval is not proof of permanent abandonment.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Entry point of the initial Agents window opening.' };
	workspaceArgumentKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Original workspace argument category; never a resource identifier.' };
	workspaceArgumentIsDefault: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the workspace argument was inferred from the invoking editor.' };
	observationReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Observation ended at firstRequest, timer, close, quit, reload, or otherShutdown.' };
	observationDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Observation duration, capped at three minutes.' };
	firstRequestSent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a request was successfully sent in this window within the observation interval.' };
	defaultAvailable: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an automatic provider-resolved default was observed before the first user workspace choice.' };
	defaultOrigin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Origin of the last automatic default before the first user workspace choice or send, using WorkspaceSelectionOrigin categories.' };
	timeToDefaultMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time until that provider-resolved default was selected. Does not imply a runnable session.' };
	timeToUsableDefaultMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time until a non-loading draft with the same folder was observed for that default. Undefined if not observed.' };
	userSelectedWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user explicitly changed, cleared, or reselected the workspace or harness during observation.' };
	defaultRetainedAtFirstRequest: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Local URI comparison between the default and the workspace captured before the successfully sent composer request. Undefined without a default or correlated composer request.' };
	workspaceSelectedAtFirstRequest: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the correlated composer request had a provider-resolved workspace. Undefined for a request not sent from that composer.' };
};

/** Observes a bounded first-use funnel without persisting or emitting workspace identifiers. */
export class SessionsWorkspaceSelectionTelemetry extends Disposable {
	private readonly _observation = this._register(new DisposableStore());
	private readonly _startedAt = Date.now();
	private _didSend = false;
	private _defaultWorkspace: IDefaultWorkspace | undefined;
	private _requests = new WeakMap<ISendRequestOptions, IRequestSelection>();
	private readonly _initialSelectionVersion: number;

	constructor(
		private readonly source: AgentsWindowOpenSource,
		private readonly context: ISessionsWindowOpenContext,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		this._initialSelectionVersion = composerService.userWorkspaceSelectionVersion.get();
		this._observation.add(autorun(reader => {
			const version = composerService.userWorkspaceSelectionVersion.read(reader);
			const selection = composerService.workspaceSelection.read(reader);
			const session = sessionsService.activeSession.read(reader);
			const created = session?.isCreated.read(reader);
			const loading = session?.loading.read(reader);
			const folderUri = session?.workspace.read(reader)?.folders[0]?.root;
			if (version !== this._initialSelectionVersion || created || selection?.state !== 'selected'
				|| !selection.folderUri || selection.origin === WorkspaceSelectionOrigin.User || selection.origin === WorkspaceSelectionOrigin.None) {
				return;
			}
			if (!this._defaultWorkspace || !this.uriIdentityService.extUri.isEqual(this._defaultWorkspace.folderUri, selection.folderUri)
				|| this._defaultWorkspace.origin !== selection.origin) {
				this._defaultWorkspace = { folderUri: selection.folderUri, origin: selection.origin, durationMs: this._elapsed() };
			}
			if (loading === false && this.uriIdentityService.extUri.isEqual(folderUri, selection.folderUri)) {
				this._defaultWorkspace.readyDurationMs ??= this._elapsed();
			}
		}));
		this._observation.add(composerService.onWillSendRequest(({ options, selection }) => {
			this._requests.set(options, {
				defaultWorkspace: this._defaultWorkspace ? { ...this._defaultWorkspace } : undefined,
				selection,
				userSelectedWorkspace: this._userSelectedWorkspace(),
			});
		}));
		this._observation.add(sessionsManagementService.onDidSendRequest(event => this._send('firstRequest', this._requests.get(event.options))));
		this._observation.add(disposableTimeout(() => this._send('timer'), FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS));
		this._observation.add(lifecycleService.onWillShutdown(event => this._send(
			event.reason === ShutdownReason.CLOSE ? 'close'
				: event.reason === ShutdownReason.QUIT ? 'quit'
					: event.reason === ShutdownReason.RELOAD ? 'reload' : 'otherShutdown',
		)));
	}

	private _userSelectedWorkspace(): boolean {
		return this.composerService.userWorkspaceSelectionVersion.get() !== this._initialSelectionVersion;
	}

	private _elapsed(): number {
		return Math.min(Math.max(0, Date.now() - this._startedAt), FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
	}

	private _send(reason: ObservationReason, request?: IRequestSelection): void {
		if (this._didSend) {
			return;
		}
		this._didSend = true;
		const defaultWorkspace = request ? request.defaultWorkspace : this._defaultWorkspace;
		this.telemetryService.publicLog2<WorkspaceSelectionOutcomeEvent, WorkspaceSelectionOutcomeClassification>('agents/workspaceSelectionOutcome', {
			source: this.source,
			workspaceArgumentKind: this.context.workspaceArgumentKind,
			workspaceArgumentIsDefault: this.context.workspaceArgumentIsDefault ?? false,
			observationReason: reason,
			observationDurationMs: this._elapsed(),
			firstRequestSent: reason === 'firstRequest',
			defaultAvailable: defaultWorkspace !== undefined,
			defaultOrigin: defaultWorkspace?.origin,
			timeToDefaultMs: defaultWorkspace?.durationMs,
			timeToUsableDefaultMs: defaultWorkspace?.readyDurationMs,
			userSelectedWorkspace: request?.userSelectedWorkspace ?? this._userSelectedWorkspace(),
			defaultRetainedAtFirstRequest: request && defaultWorkspace
				? request.selection?.state === 'selected' && this.uriIdentityService.extUri.isEqual(defaultWorkspace.folderUri, request.selection.folderUri)
				: undefined,
			workspaceSelectedAtFirstRequest: request ? request.selection?.state === 'selected' : undefined,
		});
		this._observation.clear();
		this._defaultWorkspace = undefined;
		this._requests = new WeakMap();
	}
}
