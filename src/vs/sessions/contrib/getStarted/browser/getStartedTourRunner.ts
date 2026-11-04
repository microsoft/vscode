/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { distinct } from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { TEXT_DIFF_EDITOR_ID } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { MultiDiffEditor } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';
import { registerOnboardingTargetProvider } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../changes/common/changes.js';
import { ISessionChangesService } from '../../changes/common/sessionChangesService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../sessions/browser/automationsConstants.js';
import { SessionsList } from '../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { GetStartedItemId } from '../common/getStartedChecklist.js';
import { createGetStartedTourSteps, GetStartedTourTarget, IGetStartedTourContext, IGetStartedTourNavigation } from './getStartedTours.js';

const SHOW_ME_SCENARIO_PREFIX = 'sessions.getStarted.showMe.';

/** Editors that show a session's changes, as diffs. */
const CHANGES_EDITOR_IDS: ReadonlySet<string> = new Set([SessionChangesEditorInput.EDITOR_ID, MultiDiffEditor.ID, TEXT_DIFF_EDITOR_ID]);

/** Waits this long for the editor window's recent projects to load. */
const RECENT_PROJECTS_TIMEOUT_MS = 2_000;

interface IGetStartedTourRun {
	readonly item: GetStartedItemId;
	readonly outcome: Promise<OnboardingOutcome>;
}

interface ISessionWithChanges {
	readonly session: ISession;
	readonly fileCount: number;
}

/** Runs the Show Me tours of the Get Started checklist, adapted to the user's sessions and projects. */
export class GetStartedTourRunner extends Disposable {

	/** Resources that the current tour keeps, like a revealed row in the sessions list. Disposing it ends the tour. */
	private readonly _runStore = this._register(new MutableDisposable<DisposableStore>());
	private _current: IGetStartedTourRun | undefined;

	constructor(
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ICustomViewService private readonly _customViewService: ICustomViewService,
		@ISessionsRecentWorkspacesService private readonly _recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	/**
	 * Runs an item's tour after any onboarding that is already showing, and resolves when it ends.
	 * Asking again for the same item joins its tour, and asking for another item ends it.
	 */
	run(item: GetStartedItemId): Promise<OnboardingOutcome> {
		if (this._current?.item === item) {
			return this._current.outcome;
		}
		const store = new DisposableStore();
		this._runStore.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		store.add(registerOnboardingTargetProvider(GetStartedTourTarget.ChangesEditor, () => {
			const pane = this._editorService.activeEditorPane;
			const element = pane instanceof EditorPane && this._isChangesEditorShowing() ? pane.getContainer() : undefined;
			return element ? { element } : undefined;
		}));
		const id = `${SHOW_ME_SCENARIO_PREFIX}${item}`;
		const scenario: IOnboardingScenario<ISpotlightPayload> = {
			id,
			repeatable: true,
			when: ChatContextKeys.enabled,
			trigger: { kind: 'command', commandId: id },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: { steps: [], resolveSteps: () => this._resolveSteps(item, store) },
			},
		};
		store.add(onboardingScenarioRegistry.register(scenario));
		const current: IGetStartedTourRun = {
			item,
			outcome: this._onboardingService.runScenario(id, cancellation.token).finally(() => {
				if (this._current === current) {
					this._current = undefined;
					this._runStore.clear();
				}
			}),
		};
		this._current = current;
		return current.outcome;
	}

	/** Resolved when the tour starts, so it reflects the window at that moment. */
	private async _resolveSteps(item: GetStartedItemId, store: DisposableStore): Promise<readonly ISpotlightStep[]> {
		try {
			return createGetStartedTourSteps(item, await this._createContext(item, store));
		} catch (error) {
			onUnexpectedError(error);
			return [];
		}
	}

	private async _createContext(item: GetStartedItemId, store: DisposableStore): Promise<IGetStartedTourContext> {
		const sessions = this._sessionsManagementService.getSessions()
			.filter(session => !session.isArchived.get() && !session.isAutomation?.get() && session.status.get() !== SessionStatus.Untitled)
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());
		const sessionWithChanges = item === GetStartedItemId.KeepChanges ? this._findSessionWithChanges(sessions) : undefined;
		const navigation: IGetStartedTourNavigation = {
			showSessionsList: async () => {
				await this._showSessionsList();
			},
			showNewSession: async () => {
				this._customViewService.hideCustomView();
				if (this._sessionsService.activeSession.get()?.isCreated.get()) {
					await this._sessionsService.openNewSession();
				}
			},
			showSessionWithChanges: async () => {
				if (sessionWithChanges) {
					await this._showSession(sessionWithChanges.session);
				}
			},
			showChanges: async () => {
				if (sessionWithChanges && !this._isChangesEditorShowing(sessionWithChanges.session)) {
					// Opens the changes like the session's Changes pills do, revealing the editor area.
					await this._showSession(sessionWithChanges.session);
					await this._commandService.executeCommand(VIEW_SESSION_CHANGES_COMMAND_ID);
				}
			},
			showAutomations: async () => {
				this._customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
			},
		};
		return {
			onNewSessionView: !this._sessionsService.activeSession.get()?.isCreated.get(),
			currentProject: item === GetStartedItemId.SecondProject ? await this._revealCurrentProject(sessions, store) : undefined,
			suggestedProjects: item === GetStartedItemId.SecondProject ? await this._getSuggestedProjects(sessions) : [],
			sessionWithChanges: sessionWithChanges && { fileCount: sessionWithChanges.fileCount },
			navigation,
		};
	}

	/** Shows the project of the most recent session in the sessions list, for as long as the tour runs. */
	private async _revealCurrentProject(sessions: readonly ISession[], store: DisposableStore): Promise<IGetStartedTourContext['currentProject']> {
		const session = sessions.find(candidate => !candidate.isQuickChat?.get() && !!candidate.workspace.get()?.label);
		const label = session?.workspace.get()?.label;
		if (!session || !label) {
			return undefined;
		}
		const list = await this._showSessionsList();
		if (!list || store.isDisposed) {
			return undefined;
		}
		try {
			const reveal = store.add(list.revealSessionWorkspaceForOnboarding(session));
			return { label, targetId: reveal.targetId };
		} catch {
			// The session can no longer be shown, so the tour starts at the project picker.
			return undefined;
		}
	}

	/** Recent projects without sessions in this window, preferring those from the editor window. */
	private async _getSuggestedProjects(sessions: readonly ISession[]): Promise<string[]> {
		const history = this._recentWorkspacesService.historyLoadState;
		if (history.get() === 'loading') {
			await raceTimeout(waitForState(history, state => state !== 'loading'), RECENT_PROJECTS_TIMEOUT_MS);
		}
		const extUri = this._uriIdentityService.extUri;
		const usedWorkspaces = sessions.map(session => session.workspace.get()).filter(isDefined);
		const candidates = this._recentWorkspacesService.getRecentWorkspaces(true, true).filter(recent =>
			!!recent.workspace.label && !usedWorkspaces.some(used => used.label === recent.workspace.label || extUri.isEqual(used.uri, recent.workspace.uri)));
		const fromEditor = candidates.filter(recent => recent.source !== 'agents');
		const fromAgentsWindow = candidates.filter(recent => recent.source === 'agents');
		return distinct([...fromEditor, ...fromAgentsWindow].map(recent => recent.workspace.label)).slice(0, 2);
	}

	/** The active session when it has changes, otherwise the most recently updated session with changes. */
	private _findSessionWithChanges(sessions: readonly ISession[]): ISessionWithChanges | undefined {
		const active = this._sessionsService.activeSession.get();
		if (active?.isCreated.get() && !active.isArchived.get()) {
			const fileCount = this._changesViewService.activeSessionChangesSummaryObs.get()?.files ?? active.changesSummary?.get()?.files ?? 0;
			if (fileCount > 0) {
				return { session: active, fileCount };
			}
		}
		for (const session of sessions) {
			const fileCount = session.changesSummary?.get()?.files ?? 0;
			if (fileCount > 0) {
				return { session, fileCount };
			}
		}
		return undefined;
	}

	private async _showSession(session: ISession): Promise<void> {
		this._customViewService.hideCustomView();
		if (!isEqual(this._sessionsService.activeSession.get()?.resource, session.resource)) {
			await this._sessionsService.openSession(session.resource);
		}
	}

	private async _showSessionsList(): Promise<SessionsList | undefined> {
		const view = await this._viewsService.openView<SessionsView>(SessionsViewId);
		view?.setExpanded(true);
		return view?.sessionsControl;
	}

	/** Whether the active editor shows changes in an editor area that is on screen, and not those of another session. */
	private _isChangesEditorShowing(session?: ISession): boolean {
		const pane = this._editorService.activeEditorPane;
		const id = pane?.getId();
		if (!id || !CHANGES_EDITOR_IDS.has(id) || !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return false;
		}
		const editorResource = pane?.input?.resource;
		const editorSession = editorResource && this._sessionChangesService.getSessionResource(editorResource);
		return !session || !editorSession || isEqual(editorSession, session.resource);
	}
}
