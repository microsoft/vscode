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
import { WorkspaceSelectionOrigin } from '../../../../workbench/services/sessions/common/workspaceSelection.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { WorkspaceHandoffState } from '../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { SessionsView, SessionsViewId } from '../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { INewSessionComposerService } from '../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { IAgentsWindowDraft } from '../../../../platform/window/common/window.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { readNewChatDraftState } from '../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { IRemoteWorkspaceHandoffService } from '../../../common/remoteWorkspaceHandoff.js';
import { IAgentsWindowRemoteWorkspace } from './agentsWindowOpenIntent.js';
import { isSessionCreated } from '../../../../workbench/services/sessions/common/session.js';

export const WORKSPACE_HANDOFF_TIMEOUT_MS = 15_000;

export interface IAgentsWindowWorkspaceHandoff {
	readonly folderUri?: URI;
	/**
	 * The workspace of a remote editor window. Its folder replaces {@link folderUri} once the
	 * remote agent host on the same machine provides it; otherwise a non-draft intent starts
	 * without a workspace rather than with an unrelated local one.
	 */
	readonly remote?: IAgentsWindowRemoteWorkspace;
	readonly preferDevContainer: boolean;
	readonly isDefault: boolean;
	readonly draft?: IAgentsWindowDraft;
	readonly noWorkspace?: boolean;
	readonly revealNewSession?: boolean;
}

/** Keeps one opening intent alive until the target composer applies it or a newer user intent wins. */
export class AgentsWindowWorkspaceHandoff extends Disposable {
	private readonly _pending = this._register(new MutableDisposable<DisposableStore>());
	private readonly _notification = this._register(new MutableDisposable());
	private _cancelPending: ((state: WorkspaceHandoffState) => void) | undefined;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IViewsService private readonly viewsService: IViewsService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IRemoteWorkspaceHandoffService private readonly remoteWorkspaceHandoffService: IRemoteWorkspaceHandoffService,
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
		const draftInputVersion = this.composerService.draftInputVersion.get();
		const navigationRequest = this.sessionsService.navigationRequest.get();
		store.add(autorun(reader => {
			const currentNavigation = this.sessionsService.navigationRequest.read(reader);
			if (this.composerService.userWorkspaceSelectionVersion.read(reader) !== selectionVersion
				|| this.composerService.userNavigationVersion.read(reader) !== navigationVersion
				|| (intent.draft && this.composerService.draftInputVersion.read(reader) !== draftInputVersion)
				|| (currentNavigation !== navigationRequest && currentNavigation?.token !== source.token)) {
				cancel('userChanged');
			}
		}));
		store.add(Event.once(this.sessionsManagementService.onWillSendRequest)(() => cancel('sessionAlreadyCreated')));
		store.add(Event.once(this.composerService.onWillSendRequest)(() => cancel('sessionAlreadyCreated')));
		let restoreComplete = this.sessionsService.initialRestoreComplete.get();
		let previousSession = this._focusedSessionHostService.focusedHost.get().session.get();
		let previousCreated = isSessionCreated(previousSession);
		store.add(autorun(reader => {
			const restored = this.sessionsService.initialRestoreComplete.read(reader);
			const session = this._focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			const created = isSessionCreated(session, reader);
			if (restoreComplete && created && (session !== previousSession || !previousCreated)) {
				cancel('sessionAlreadyCreated');
			}
			restoreComplete = restored;
			previousSession = session;
			previousCreated = created;
		}));
		try {
			if (intent.draft && !intent.revealNewSession && this._hasDraftInput()) {
				onState('preservedSession');
				return;
			}
			const startRemoteResolution = () => {
				const resolution = intent.remote?.folder ? this.remoteWorkspaceHandoffService.resolveFolder(intent.remote.folder, source.token) : undefined;
				resolution?.catch(() => undefined);
				return resolution;
			};
			// Registering and connecting the remote host runs while setup and the session view get ready. An inferred
			// default waits for restore instead, so it never adds or connects a host for a window that keeps its session.
			const inferredDefault = intent.isDefault && !intent.draft && !intent.revealNewSession;
			let remoteResolution = inferredDefault ? undefined : startRemoteResolution();
			onState('waitingForSetup');
			await raceCancellationError(this.sessionsSetUpService.whenWelcomeDone(), source.token);
			if (source.token.isCancellationRequested) {
				return;
			}
			onState('waitingForSessionView');
			if (inferredDefault) {
				await waitForState(this.sessionsService.initialRestoreComplete, complete => complete, undefined, source.token);
				if (!isSessionCreated(this._focusedSessionHostService.focusedHost.get().session.get())) {
					remoteResolution = startRemoteResolution();
				}
			} else {
				await raceCancellationError(this.lifecycleService.when(LifecyclePhase.Restored), source.token);
				if (source.token.isCancellationRequested) {
					return;
				}
				if (intent.draft && !intent.revealNewSession && this._hasDraftInput()) {
					onState('preservedSession');
					return;
				}
				if (!intent.draft || intent.revealNewSession) {
					// Navigation can rebind the mounted composer before its draft is restored.
					const preserveDraft = intent.revealNewSession && this._hasDraftInput();
					await this.sessionsService.openNewSession({ cancelRestore: true }, source.token);
					if (preserveDraft) {
						if (!source.token.isCancellationRequested) {
							onState('preservedSession');
						}
						return;
					}
				}
			}

			let folderUri = intent.folderUri;
			let remoteUnavailableReason: string | undefined;
			if (remoteResolution) {
				onState('waitingForProvider');
				const resolution = await raceCancellationError(remoteResolution, source.token);
				folderUri = resolution.folderUri ?? folderUri;
				remoteUnavailableReason = resolution.unavailableReason;
			}
			// A remote editor window must not fall back to an unrelated local folder.
			const remoteWithoutFolder = !!intent.remote && !intent.draft && !folderUri;
			let draftNeedsNavigation = !!intent.draft && !intent.revealNewSession;
			let noWorkspaceNeedsSelection = !!intent.noWorkspace || remoteWithoutFolder;
			const deadline = Date.now() + WORKSPACE_HANDOFF_TIMEOUT_MS;
			while (!source.token.isCancellationRequested) {
				const currentSession = this._focusedSessionHostService.focusedHost.get().session.get();
				if ((!intent.draft && isSessionCreated(currentSession)) || ((intent.draft || intent.revealNewSession) && this._hasDraftInput())) {
					onState('preservedSession');
					return;
				}

				const resolved = folderUri ? this.sessionsManagementService.resolveWorkspace(folderUri) : undefined;
				const providerReady = !folderUri || !!resolved;
				if (draftNeedsNavigation && providerReady) {
					await this.sessionsService.openNewSession({ cancelRestore: true }, source.token);
					draftNeedsNavigation = false;
					if (source.token.isCancellationRequested) {
						return;
					}
				}
				const session = this._focusedSessionHostService.focusedHost.get().session.get();
				if (!draftNeedsNavigation && isSessionCreated(session)) {
					onState('preservedSession');
					return;
				}
				const view = draftNeedsNavigation ? undefined : this.sessionsPartService.getSessionView(session?.sessionId);
				if (noWorkspaceNeedsSelection && view) {
					const result = view.selectNoWorkspace({ userSelection: false, preserveNavigation: true, isDefault: intent.isDefault && !intent.draft });
					if (intent.draft) {
						noWorkspaceNeedsSelection = false;
						continue;
					}
					if (result === 'preserved') {
						onState('preservedSession');
						return;
					}
					if (result === 'applied') {
						if (remoteWithoutFolder) {
							onState(remoteUnavailableReason ? 'providerUnavailable' : 'unsupportedWorkspace');
							this._showRemoteUnavailable(intent, remoteUnavailableReason);
						} else {
							onState('applied');
						}
						return;
					}
				}
				const options = {
					providerId: resolved?.providerId,
					preferDevContainer: intent.preferDevContainer,
					selectionOrigin: intent.isDefault && !intent.draft ? WorkspaceSelectionOrigin.WindowContext : WorkspaceSelectionOrigin.WindowOpen,
					isDefault: intent.isDefault && !intent.draft,
				};
				const result = intent.draft
					? providerReady ? await view?.applyDraft(intent.draft, folderUri, options, source.token) : undefined
					: resolved && folderUri ? view?.selectWorkspace(folderUri, options) : undefined;
				if (source.token.isCancellationRequested) {
					return;
				}
				if (result === 'preserved') {
					onState('preservedSession');
					return;
				}
				if (result === 'applied') {
					onState('applied');
					if (folderUri) {
						this.viewsService.getViewWithId<SessionsView>(SessionsViewId)?.sessionsControl?.setOpenWindowSourceFolder(folderUri);
					}
					return;
				}
				const state = !providerReady ? 'waitingForProvider' : !view ? 'waitingForSessionView' : 'selectionRequested';
				onState(state);
				if (Date.now() >= deadline) {
					onState(!providerReady ? 'providerUnavailable' : !view ? 'viewUnavailable' : 'selectionNotApplied');
					this.logService.warn(`[AgentsHandoff] Workspace selection timed out: ${state}`);
					if (intent.draft || !intent.isDefault) {
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
				if (intent.draft) {
					this.logService.error('[AgentsHandoff] Draft handoff failed');
				} else {
					this.logService.error('[AgentsHandoff] Workspace selection failed', error);
				}
				if (intent.draft || !intent.isDefault) {
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

	private _hasDraftInput(): boolean {
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		if (!isSessionCreated(activeSession) && !activeSession?.isQuickChat?.get()) {
			const mountedInput = this.composerService.getDraftInputStateForSession(activeSession?.resource);
			if (mountedInput !== undefined) {
				return mountedInput;
			}
		}
		const savedDraft = readNewChatDraftState(this.storageService);
		return !!savedDraft && (!!savedDraft.inputText || savedDraft.attachments.length > 0);
	}

	private _showRecovery(intent: IAgentsWindowWorkspaceHandoff, onState: (state: WorkspaceHandoffState) => void): void {
		const notification = this.notificationService.prompt(Severity.Warning,
			intent.draft
				? localize('agentsHandoff.draftUnavailable', "The draft could not be copied to the Agents Window. Your prompt and attachments are still in the editor. Try again or choose a workspace to continue.")
				: localize('agentsHandoff.workspaceUnavailable', "The workspace could not be selected. Try again or choose a workspace to continue."),
			[
				{ label: localize('agentsHandoff.retry', "Retry"), run: () => this.selectWorkspace(intent, onState) },
				{ label: localize('agentsHandoff.chooseWorkspace', "Choose Workspace"), run: () => this.commandService.executeCommand('workbench.action.sessions.newSession.pickFolderQuickPick') },
			]);
		this._notification.value = toDisposable(() => notification.close());
	}

	/** Explains why the remote editor window's folder is not selected after starting without a workspace. */
	private _showRemoteUnavailable(intent: IAgentsWindowWorkspaceHandoff, reason: string | undefined): void {
		const message = reason
			? localize('agentsHandoff.remoteUnavailable', "The folder of your remote window could not be opened in the Agents Window. {0}", reason)
			: intent.remote?.kind === 'codespaces'
				? localize('agentsHandoff.codespacesUnsupported', "The Agents Window cannot open folders from GitHub Codespaces yet. Choose a workspace to continue.")
				: localize('agentsHandoff.remoteUnsupported', "The Agents Window cannot open folders from this kind of remote yet. Choose a workspace to continue.");
		const notification = this.notificationService.prompt(Severity.Warning, message, [
			{ label: localize('agentsHandoff.chooseWorkspace', "Choose Workspace"), run: () => this.commandService.executeCommand('workbench.action.sessions.newSession.pickFolderQuickPick') },
		]);
		this._notification.value = toDisposable(() => notification.close());
	}
}
