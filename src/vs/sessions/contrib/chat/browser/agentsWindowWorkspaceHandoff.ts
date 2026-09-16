/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';
import { WorkspaceSelectionOrigin } from '../../../common/workspaceSelection.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { WorkspaceHandoffState } from '../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { INewSessionComposerService } from './newSessionComposerService.js';

export const WORKSPACE_HANDOFF_TIMEOUT_MS = 15_000;

export interface IAgentsWindowWorkspaceHandoff {
	readonly folderUri: URI;
	readonly preferDevContainer: boolean;
	readonly isDefault: boolean;
}

/** Keeps one opening intent alive until the target composer applies it or a newer user intent wins. */
export class AgentsWindowWorkspaceHandoff extends Disposable {
	private readonly _pending = this._register(new MutableDisposable<DisposableStore>());
	private readonly _notification = this._register(new MutableDisposable());
	private _cancelPending: ((state: WorkspaceHandoffState) => void) | undefined;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IViewsService private readonly viewsService: IViewsService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(lifecycleService.onWillShutdown(() => this.cancel()));
	}

	cancel(): void {
		this._cancelPending?.('superseded');
		this._pending.clear();
		this._notification.clear();
	}

	async selectWorkspace(intent: IAgentsWindowWorkspaceHandoff, onState: (state: WorkspaceHandoffState) => void): Promise<void> {
		this.cancel();
		const store = new DisposableStore();
		this._pending.value = store;
		const source = new CancellationTokenSource();
		let finished = false;
		const cancel = (state: WorkspaceHandoffState) => {
			if (!finished && !source.token.isCancellationRequested) {
				onState(state);
				source.cancel();
			}
		};
		this._cancelPending = cancel;
		store.add(toDisposable(() => {
			cancel('cancelled');
			source.dispose(true);
			if (this._cancelPending === cancel) {
				this._cancelPending = undefined;
			}
		}));
		const selectionVersion = this.composerService.userWorkspaceSelectionVersion.get();
		const navigationVersion = this.composerService.userNavigationVersion.get();
		const navigationRequest = this.sessionsService.navigationRequest.get();
		store.add(autorun(reader => {
			const currentNavigation = this.sessionsService.navigationRequest.read(reader);
			if (this.composerService.userWorkspaceSelectionVersion.read(reader) !== selectionVersion
				|| this.composerService.userNavigationVersion.read(reader) !== navigationVersion
				|| (currentNavigation !== navigationRequest && currentNavigation?.token !== source.token)) {
				cancel('userChanged');
			}
		}));
		store.add(Event.once(this.sessionsManagementService.onWillSendRequest)(() => cancel('sessionAlreadyCreated')));
		store.add(Event.once(this.composerService.onWillSendRequest)(() => cancel('sessionAlreadyCreated')));
		let restoreComplete = this.sessionsService.initialRestoreComplete.get();
		let previousSession = this.sessionsService.activeSession.get();
		let previousCreated = previousSession?.isCreated.get() ?? false;
		store.add(autorun(reader => {
			const restored = this.sessionsService.initialRestoreComplete.read(reader);
			const session = this.sessionsService.activeSession.read(reader);
			const created = session?.isCreated.read(reader) ?? false;
			if (restoreComplete && created && (session !== previousSession || !previousCreated)) {
				cancel('sessionAlreadyCreated');
			}
			restoreComplete = restored;
			previousSession = session;
			previousCreated = created;
		}));
		try {
			onState('waitingForSetup');
			await raceCancellationError(this.sessionsSetUpService.whenWelcomeDone(), source.token);
			if (source.token.isCancellationRequested) {
				return;
			}
			onState('waitingForSessionView');
			if (intent.isDefault) {
				await waitForState(this.sessionsService.initialRestoreComplete, complete => complete, undefined, source.token);
			} else {
				await raceCancellationError(this.lifecycleService.when(LifecyclePhase.Restored), source.token);
				if (source.token.isCancellationRequested) {
					return;
				}
				await this.sessionsService.openNewSession({ cancelRestore: true }, source.token);
			}

			const deadline = Date.now() + WORKSPACE_HANDOFF_TIMEOUT_MS;
			while (!source.token.isCancellationRequested) {
				const session = this.sessionsService.activeSession.get();
				if (session?.isCreated.get() || session?.isQuickChat?.get()) {
					onState('preservedSession');
					return;
				}

				const resolved = this.sessionsManagementService.resolveWorkspace(intent.folderUri);
				const view = this.sessionsPartService.getSessionView(session?.sessionId);
				const result = resolved ? view?.selectWorkspace(intent.folderUri, {
					providerId: resolved.providerId,
					preferDevContainer: intent.preferDevContainer,
					selectionOrigin: intent.isDefault ? WorkspaceSelectionOrigin.WindowContext : WorkspaceSelectionOrigin.WindowOpen,
					isDefault: intent.isDefault,
				}) : undefined;
				if (result === 'preserved') {
					onState('preservedSession');
					return;
				}
				if (result === 'applied') {
					onState('applied');
					this.viewsService.getViewWithId<SessionsView>(SessionsViewId)?.sessionsControl?.setOpenWindowSourceFolder(intent.folderUri);
					return;
				}
				const state = !resolved ? 'waitingForProvider' : !view ? 'waitingForSessionView' : 'selectionRequested';
				onState(state);
				if (Date.now() >= deadline) {
					onState(!resolved ? 'providerUnavailable' : !view ? 'viewUnavailable' : 'selectionNotApplied');
					this.logService.warn(`[AgentsHandoff] Workspace selection timed out: ${state}`);
					if (!intent.isDefault) {
						this._showRecovery(intent, onState);
					}
					return;
				}
				// View construction and provider readiness can finish independently of lifecycle phases.
				await timeout(100, source.token);
			}
		} catch (error) {
			if (!source.token.isCancellationRequested && !isCancellationError(error)) {
				onState('error');
				this.logService.error('[AgentsHandoff] Workspace selection failed', error);
				if (!intent.isDefault) {
					this._showRecovery(intent, onState);
				}
			}
		} finally {
			finished = true;
			if (this._pending.value === store) {
				this._cancelPending = undefined;
				this._pending.clear();
			}
		}
	}

	private _showRecovery(intent: IAgentsWindowWorkspaceHandoff, onState: (state: WorkspaceHandoffState) => void): void {
		const notification = this.notificationService.prompt(Severity.Warning,
			localize('agentsHandoff.workspaceUnavailable', "The workspace could not be selected. Try again or choose a workspace to continue."),
			[
				{ label: localize('agentsHandoff.retry', "Retry"), run: () => this.selectWorkspace(intent, onState) },
				{ label: localize('agentsHandoff.chooseWorkspace', "Choose Workspace"), run: () => this.commandService.executeCommand('workbench.action.sessions.newSession.pickFolderQuickPick') },
			]);
		this._notification.value = toDisposable(() => notification.close());
	}
}
