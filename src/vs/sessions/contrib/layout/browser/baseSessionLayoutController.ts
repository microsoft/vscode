/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { isThenable, Sequencer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILifecycleService } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsWelcomeVisibleContext, IsQuickChatSessionContext } from '../../../common/contextkeys.js';
import { logSidePanelToggle } from '../../../common/sessionsTelemetry.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';

const secondarySidebarToggleClosedIcon = registerIcon('agent-secondary-sidebar-toggle-closed', Codicon.layoutSidebarRightOff, localize('agentSecondarySidebarToggleClosedIcon', "Icon for the sessions secondary sidebar when closed."));
const secondarySidebarToggleOpenIcon = registerIcon('agent-secondary-sidebar-toggle-open', Codicon.layoutSidebarRight, localize('agentSecondarySidebarToggleOpenIcon', "Icon for the sessions secondary sidebar when open."));

/**
 * Per-session view state: auxiliary bar visibility and active view container.
 * Treated as opaque persisted data by the base controller; only the desktop
 * controller interprets it (see `desktopSessionLayoutController.md`).
 */
export interface ISessionViewState {
	readonly auxiliaryBarVisible: boolean;
	readonly auxiliaryBarActiveViewContainerId: string | undefined;
	/** [D9] Marks an aux-bar hide caused only by collapsing the whole side pane. */
	readonly auxiliaryBarHiddenByCollapse?: boolean;
}

/**
 * Full per-session layout state persisted to storage.
 */
interface ISessionLayoutEntry {
	readonly sessionResource: string;
	readonly viewState?: ISessionViewState;
	readonly editorWorkingSet?: IEditorWorkingSet;
	readonly editorPartHidden?: boolean;
}

/** New unified storage key for all per-session layout state. */
const SESSION_LAYOUT_STATE_KEY = 'sessions.layoutState';
/** Legacy key — read on startup for migration only. */
const WORKING_SETS_STORAGE_KEY = 'sessions.workingSets';

/**
 * Shared, platform-agnostic per-session layout state management. The behaviour
 * specified here is enumerated as rules **B1-B5** in
 * [baseSessionLayoutController.md](./baseSessionLayoutController.md).
 *
 * It owns the panel visibility, editor working sets, persistence, and the
 * multi-session suppression that every layout needs. Auxiliary bar management
 * is platform-specific and supplied by subclasses through
 * {@link _registerViewStateManagement} (see the desktop / mobile controllers).
 */
export abstract class BaseLayoutController extends Disposable {

	// [B3] Per-session state, keyed by session resource and persisted to storage.
	protected readonly _panelVisibilityBySession = new ResourceMap<boolean>();
	protected readonly _viewStateBySession = new ResourceMap<ISessionViewState>();
	protected readonly _workingSets = new ResourceMap<IEditorWorkingSet>();
	/**
	 * [B2] Whether the editor part was hidden (e.g. the user closed the Side
	 * Panel while keeping editors open) for a session, captured on switch-away so
	 * restoring the session's working set does not force the editor part open.
	 */
	protected readonly _editorPartHiddenBySession = new ResourceMap<boolean>();
	private readonly _workingSetSequencer = new Sequencer();

	protected readonly activeSessionResourceObs;
	protected readonly multipleSessionsVisibleObs;

	/**
	 * `> 0` while the controller is restoring a session's layout on a session
	 * switch (editor working set and/or auxiliary bar). Subclasses can use this to
	 * re-baseline responsive behaviour instead of reacting to the restore-driven
	 * part-visibility changes (see the desktop controller's [D7] sidebar logic).
	 */
	private _restoringSessionLayoutDepth = 0;

	protected get _isRestoringSessionLayout(): boolean {
		return this._restoringSessionLayoutDepth > 0;
	}

	/**
	 * [D9] `true` while {@link toggleSidePane} hides/shows the editor + auxiliary
	 * bar together. The desktop controller's per-session aux-bar capture skips
	 * this window, so toggling the whole side pane is never recorded as an
	 * aux-bar choice.
	 */
	protected _togglingSidePane = false;

	/**
	 * Remembers which parts were visible when the side pane was last hidden, so
	 * re-opening restores the same parts instead of always showing both.
	 */
	private _lastVisibleSidePaneParts: { readonly editor: boolean; readonly auxiliaryBar: boolean } | undefined;

	private readonly _useModalConfigObs;

	/**
	 * Storage key for this controller's per-session layout state. Overridable so a
	 * sibling controller (e.g. single-pane) persists to a fresh key instead of
	 * sharing the classic desktop state.
	 */
	protected get _layoutStateStorageKey(): string {
		return SESSION_LAYOUT_STATE_KEY;
	}

	/**
	 * Legacy key migrated on first load, or `undefined` to skip migration (a fresh
	 * sibling controller has no legacy state to migrate).
	 */
	protected get _legacyWorkingSetsStorageKey(): string | undefined {
		return WORKING_SETS_STORAGE_KEY;
	}

	constructor(

		@IAgentWorkbenchLayoutService protected readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ISessionsService protected readonly _sessionsService: ISessionsService,
		@IViewsService protected readonly _viewsService: IViewsService,
		@IPaneCompositePartService protected readonly _paneCompositePartService: IPaneCompositePartService,
		@IStorageService protected readonly _storageService: IStorageService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IEditorService protected readonly _editorService: IEditorService,
		@IEditorGroupsService protected readonly _editorGroupsService: IEditorGroupsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISessionChangesService protected readonly _sessionChangesService: ISessionChangesService,
		@IChangesViewService protected readonly _changesViewService: IChangesViewService,
		@IViewDescriptorService protected readonly _viewDescriptorService: IViewDescriptorService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@ILifecycleService protected readonly _lifecycleService: ILifecycleService,
	) {
		super();

		// [B3] Restore persisted state (with one-time legacy migration).
		this._loadState();

		// [B4] Persist on shutdown.
		this._register(this._storageService.onWillSaveState(() => this._saveState()));

		// All session-switch logic is observable-driven.
		this.activeSessionResourceObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual
		}, reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			return activeSession?.resource;
		});

		this.multipleSessionsVisibleObs = derived<boolean>(reader => {
			return this._sessionsService.visibleSessions.read(reader).length > 1;
		});

		// [B5] When multiple sessions are visible, drop per-session view/panel state
		// for each visible session (editor working sets are preserved). This ensures
		// the default visibility logic runs again after collapsing back to one session.
		this._register(autorun(reader => {
			const visibleSessions = this._sessionsService.visibleSessions.read(reader);
			if (visibleSessions.length <= 1) {
				return;
			}
			for (const session of visibleSessions) {
				if (!session) {
					continue;
				}
				this._viewStateBySession.delete(session.resource);
				this._panelVisibilityBySession.delete(session.resource);
			}
		}));

		// [B1] Switch between sessions — sync panel visibility
		this._register(autorun(reader => {
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			if (this.multipleSessionsVisibleObs.read(reader)) {
				return;
			}
			this._syncPanelVisibility(activeSessionResource);
		}));

		// [B1] Track panel visibility changes by the user
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			if (this.multipleSessionsVisibleObs.get()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (activeSession) {
				this._panelVisibilityBySession.set(activeSession.resource, e.visible);
			}
		}));

		// [B2] Track editor-part (docked side-pane) visibility changes by the user
		// so a session's closed/open editor state is captured at the moment it
		// changes — not lazily re-read at switch-away time, which races with the
		// incoming session's async layout restore (the switch derive lags behind
		// the raw active-session change, so by the time the previous session is
		// saved the editor part may already reflect the new session). Skipped
		// while multiple sessions are visible (the editor area is shared) and
		// during a session-switch restore (those changes are layout-driven, not
		// user choices).
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.EDITOR_PART || this._isRestoringSessionLayout) {
				return;
			}
			if (this.multipleSessionsVisibleObs.get()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (activeSession) {
				this._editorPartHiddenBySession.set(activeSession.resource, !e.visible);
			}
		}));

		// [B2] Editor working sets

		this._useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		// Workspace folders — used to defer session switch until workspace is ready
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders);

		// [B2] The active session updates before the workspace folders do; hold back
		// the new session until the folders reflect its working directory.
		const activeSessionForWorkingSet = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, lastValue) => {
			const workspaceFolders = workspaceFoldersObs.read(reader);
			const activeSession = this._sessionsService.activeSession.read(reader);
			const activeSessionWorkspaceUri = activeSession?.workspace.read(reader)?.folders[0]?.workingDirectory;

			if (
				activeSessionWorkspaceUri &&
				!workspaceFolders.some(folder => isEqual(folder.uri, activeSessionWorkspaceUri))
			) {
				return lastValue;
			}

			if (isEqual(activeSession?.resource, lastValue?.resource)) {
				return lastValue;
			}

			return activeSession;
		});

		// Working sets are always active: browser editors dock in the shared grid
		// editor part even when `workbench.editor.useModal` is `'all'` (they
		// deliberately except themselves from the modal part), so their tabs
		// still need to be captured/restored per session in that mode.

		// [B2] Save the outgoing session's working set eagerly on the raw active
		// session change, not on the workspace-gated `activeSessionForWorkingSet`
		// derive below. The derive lags while the incoming session's workspace
		// resolves, and autoruns driven by the raw active session (e.g. the
		// single-pane managed-tabs sync) async-close the outgoing session's docked
		// editors during that window. Saving here synchronously — before those
		// closes run — captures which editor was active (e.g. the Changes tab) so it
		// is restored active on return.
		this._register(runOnChange(this._sessionsService.activeSession, (session, previousSession) => {
			if (
				previousSession
				&& !isEqual(previousSession.resource, session?.resource)
				&& previousSession.status.read(undefined) !== SessionStatus.Untitled
				&& !this._isRestoringSessionLayout
			) {
				this._saveWorkingSet(previousSession.resource);
			}
		}));

		// [B2] Session changed (apply)
		this._register(runOnChange(activeSessionForWorkingSet, (session, previousSession) => {
			// Apply working set for current session.
			// On initial load (no previous session), only apply if we have a saved working set —
			// skip applying 'empty' to avoid closing editors that are being restored.
			if (previousSession || (session && this._workingSets.has(session.resource))) {
				this._withSessionLayoutRestore(() => this._applyWorkingSet(session?.resource, { isInitialRestore: !previousSession }));
			}
		}));

		// [B2] Session state changed (archive, delete)
		this._register(this._sessionManagementService.onDidChangeSessions(e => {
			const archivedSessions = e.changed.filter(session => session.isArchived.read(undefined));
			for (const session of [...e.removed, ...archivedSessions]) {
				this._deleteWorkingSet(session.resource);
				this._viewStateBySession.delete(session.resource);
				this._editorPartHiddenBySession.delete(session.resource);
			}
		}));
		this._register(this._sessionManagementService.onDidReplaceSession(({ from, to }) => this._onSessionReplaced(from, to)));

		// Side-pane toggle UI (menu item, keybinding, command-palette entry).
		this._register(this._registerSidePaneToggleAction());

		// Platform-specific auxiliary bar / view-state management.
		this._registerViewStateManagement();

		// Layout-specific auxiliary controllers (e.g. single-pane detail/tab
		// controllers), created and owned by the layout controller so they share
		// its lifecycle and coordinate through it.
		this._registerAuxiliaryControllers();
	}

	/**
	 * Hook for a layout controller to create and own its auxiliary controllers.
	 * The base implementation does nothing.
	 */
	protected _registerAuxiliaryControllers(): void { }

	/**
	 * Registers the `Toggle Side Panel` action (menu item, keybinding,
	 * command-palette entry). The action delegates straight to `toggleSidePane()`,
	 * so no command/service indirection is needed; the controller owns the toggle
	 * behaviour and its memory.
	 */
	private _registerSidePaneToggleAction(): IDisposable {
		const that = this;
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.agentToggleSidePanel',
					title: localize2('toggleSecondarySidebar', 'Toggle Side Panel'),
					icon: secondarySidebarToggleClosedIcon,
					toggled: {
						condition: ContextKeyExpr.or(AuxiliaryBarVisibleContext, MainEditorAreaVisibleContext)!,
						icon: secondarySidebarToggleOpenIcon,
					},
					metadata: {
						description: localize('openAndCloseSidePanel', 'Open/Show and Close/Hide the Side Panel (editor area and auxiliary bar)'),
					},
					category: Categories.View,
					f1: true,
					// A quick chat has no side pane (Round 20 hides the empty aux bar
					// and the chat is full-width), so toggling it is meaningless.
					precondition: IsQuickChatSessionContext.negate(),
					keybinding: {
						weight: KeybindingWeight.SessionsContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
					},
					menu: [
						{
							id: Menus.TitleBarSessionMenu,
							group: 'navigation',
							order: 11, // After Open in VS Code (7), Run Script (8), and Open Terminal (10)
							when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
						}
					]
				});
			}

			run(accessor: ServicesAccessor): void {
				const nowVisible = that.toggleSidePane();

				logSidePanelToggle(accessor.get(ITelemetryService), nowVisible);

				// Announce visibility change to screen readers
				alert(nowVisible
					? localize('sidePanelVisible', "Side Panel shown")
					: localize('sidePanelHidden', "Side Panel hidden"));
			}
		});
	}

	/**
	 * Hook for subclasses to register platform-specific auxiliary bar
	 * view-state management. Runs at the end of the base constructor. The base
	 * implementation does nothing.
	 */
	protected _registerViewStateManagement(): void { }

	protected _onSessionReplaced(from: ISession, to: ISession): void {
		// `onDidReplaceSession` fires only when an untitled draft is atomically
		// replaced by its committed session on submit, so it always means "the
		// committed session inherits the draft's on-screen side-pane layout".
		// Persist the draft's live editor-part visibility onto the committed
		// session so the delayed working-set apply restores it as-left (instead of
		// the created-session default, which would reveal the docked editor) and it
		// also survives a reload.
		const activeSession = this._sessionsService.activeSession.get();
		const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
		const editorPartHidden = this._editorPartHiddenBySession.get(from.resource)
			?? (replacedSessionIsActive ? !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) : undefined);
		if (editorPartHidden !== undefined) {
			this._editorPartHiddenBySession.set(to.resource, editorPartHidden);
		}
	}

	/**
	 * Whether the auxiliary bar currently has at least one active view container
	 * (shown as a tab). Mirrors the workbench's own container-visibility rule
	 * (`!hideIfEmpty || isViewContainerActive`, folded into `isViewContainerActive`).
	 */
	protected _hasActiveAuxViewContainers(): boolean {
		return this._viewDescriptorService
			.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)
			.some(container => this._viewsService.isViewContainerActive(container.id));
	}

	/**
	 * Toggle the **side pane** — the editor area together with the auxiliary bar.
	 * Closing it hides both; re-opening restores exactly the parts that were
	 * visible when it was last closed (defaulting to both). The whole operation
	 * runs under {@link _togglingSidePane} so the desktop controller does not
	 * record it as a per-session aux-bar choice ([D9]). Returns `true` if the
	 * side pane is now visible.
	 */
	toggleSidePane(): boolean {
		this._togglingSidePane = true;
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			// Treat the side pane as visible when *either* part is visible so the
			// toggle always closes both, instead of just revealing the auxiliary
			// bar on top of an already-visible editor area.
			const editorVisible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
			const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
			const isCurrentlyVisible = editorVisible || auxiliaryBarVisible;

			// When hiding and unhiding the editor part and auxiliary bar, hiding
			// must be done in the opposite order than showing for sizing to restore
			// correct dimensions.
			if (isCurrentlyVisible) {
				this._lastVisibleSidePaneParts = { editor: editorVisible, auxiliaryBar: auxiliaryBarVisible };
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			} else {
				// Restore only the parts that were visible before hiding (falling back
				// to the layout's default parts when there is no remembered state,
				// e.g. after a reload).
				const restore = this._lastVisibleSidePaneParts ?? this._defaultReopenSidePaneParts();
				const hasEditors = this._editorGroupsService.groups.some(group => !group.isEmpty);
				const hasAuxViewContainers = this._hasActiveAuxViewContainers();
				if (restore.editor && hasEditors) {
					this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
				}
				if (restore.auxiliaryBar && hasAuxViewContainers) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				}
				// Ensure the toggle has a visible effect, but never reveal an empty
				// aux bar: prefer the editor when it has content, else the aux bar
				// only when it has active view containers (a quick chat with neither
				// has nothing to reveal).
				if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					if (hasEditors) {
						this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
					} else if (hasAuxViewContainers) {
						this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
					}
				}
			}

			// Let subclasses record the resulting side-pane state ([D2] capture is suppressed while toggling).
			this._onSidePaneToggled(isCurrentlyVisible, auxiliaryBarVisible);

			return !isCurrentlyVisible;
		} finally {
			suppressEditorPartAutoVisibility.dispose();
			this._togglingSidePane = false;
		}
	}

	/**
	 * Hook invoked at the end of {@link toggleSidePane}, while
	 * {@link _togglingSidePane} is still set, so subclasses can record the
	 * resulting side-pane state (which the [D2] capture listener deliberately
	 * ignores). `collapsed` is `true` when the toggle just hid the whole side
	 * pane; `previousAuxiliaryBarVisible` is the aux bar's visibility before the
	 * toggle. The base implementation does nothing.
	 */
	protected _onSidePaneToggled(_collapsed: boolean, _previousAuxiliaryBarVisible: boolean): void { }

	/**
	 * The parts to reveal when re-opening the side pane with no remembered state
	 * (e.g. after a reload). The base default shows both the editor and the
	 * auxiliary bar; subclasses can specialize per layout / session type.
	 */
	protected _defaultReopenSidePaneParts(): { readonly editor: boolean; readonly auxiliaryBar: boolean } {
		return { editor: true, auxiliaryBar: true };
	}

	/**
	 * [B4] Hook that lets a subclass snapshot the active session's view state when
	 * state is about to be persisted. The base implementation does nothing.
	 */
	protected _captureActiveSessionViewState(_sessionResource: URI): void { }

	/**
	 * Runs a session-switch layout restore with {@link _isRestoringSessionLayout}
	 * held until the (possibly async) work settles, so part-visibility changes the
	 * restore causes can be re-baselined rather than reacted to.
	 */
	protected _withSessionLayoutRestore(work: () => void | Promise<unknown>): void {
		this._restoringSessionLayoutDepth++;
		const suppression = this._suppressEditorVisibilityDuringRestore();
		let settledSync = true;
		try {
			const result = work();
			if (isThenable(result)) {
				settledSync = false;
				Promise.resolve(result).catch(() => undefined).finally(() => {
					this._restoringSessionLayoutDepth--;
					suppression?.dispose();
				});
			}
		} finally {
			if (settledSync) {
				this._restoringSessionLayoutDepth--;
				suppression?.dispose();
			}
		}
	}

	/**
	 * Hook to suppress editor-part auto-visibility for the whole session-switch
	 * restore. The base restore causes no layout-driven editor closes, so it
	 * returns `undefined`.
	 */
	protected _suppressEditorVisibilityDuringRestore(): IDisposable | undefined {
		return undefined;
	}

	/**
	 * Hook deciding whether {@link _applyWorkingSet} reveals the editor part when
	 * restoring a non-empty working set.
	 */
	protected _shouldRevealEditorPartOnApply(editorPartHidden: boolean, isModal: boolean): boolean {
		return !editorPartHidden && !isModal;
	}

	/**
	 * Hook deciding whether {@link _applyWorkingSet} reveals the editor part for an
	 * empty working set. The base never reveals in this case.
	 */
	protected _shouldRevealEditorPartForEmptyWorkingSet(_revealEditorPart: boolean): boolean {
		return false;
	}

	/**
	 * Hook deciding whether {@link _applyWorkingSet} actively hides the editor part
	 * when restoring a session that had it hidden. The base never hides (in the
	 * classic layout the editor part visibility is not a per-session choice); the
	 * single-pane layout restores its docked editor part both ways.
	 */
	protected _shouldHideEditorPartOnApply(_editorPartHidden: boolean): boolean {
		return false;
	}

	// --- Editor part reveal ---

	/**
	 * Reveals the editor part. Editor working sets are restored into the shared
	 * editor area on session switch, which requires the editor part to be visible.
	 */
	private _revealEditorPartForWorkingSet(): void {
		this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
	}

	/** Hides the editor part to restore a session that had its docked editor closed. */
	private _hideEditorPartForWorkingSet(): void {
		this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
	}

	// --- Persistence [B3] ---

	private _loadState(): void {
		// Load from new key first
		const raw = this._storageService.get(this._layoutStateStorageKey, StorageScope.WORKSPACE);
		if (raw) {
			try {
				for (const entry of JSON.parse(raw) as ISessionLayoutEntry[]) {
					const resource = URI.parse(entry.sessionResource);
					if (entry.editorWorkingSet) {
						this._workingSets.set(resource, entry.editorWorkingSet);
					}
					if (entry.editorPartHidden !== undefined) {
						this._editorPartHiddenBySession.set(resource, entry.editorPartHidden);
					}
					if (entry.viewState) {
						this._viewStateBySession.set(resource, entry.viewState);
					}
				}
				return;
			} catch {
				// Corrupted data — remove the bad key so we don't keep failing, then fall through to legacy migration
				this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
			}
		}

		// Migrate from legacy key (sessions.workingSets)
		const legacyKey = this._legacyWorkingSetsStorageKey;
		if (!legacyKey) {
			return;
		}
		const legacyRaw = this._storageService.get(legacyKey, StorageScope.WORKSPACE);
		if (legacyRaw) {
			try {
				type LegacyEntry = { sessionResource: string; editorWorkingSet?: IEditorWorkingSet; auxiliaryBarState?: { visible: boolean; activeViewContainerId: string | undefined } };
				for (const entry of JSON.parse(legacyRaw) as LegacyEntry[]) {
					const resource = URI.parse(entry.sessionResource);
					if (entry.editorWorkingSet) {
						this._workingSets.set(resource, entry.editorWorkingSet);
					}
					if (entry.auxiliaryBarState) {
						this._viewStateBySession.set(resource, {
							auxiliaryBarVisible: entry.auxiliaryBarState.visible,
							auxiliaryBarActiveViewContainerId: entry.auxiliaryBarState.activeViewContainerId,
						});
					}
				}
			} catch {
				// ignore corrupted data
			}
			// Remove legacy key after migration
			this._storageService.remove(legacyKey, StorageScope.WORKSPACE);
		}
	}

	private _saveState(): void {
		const activeSession = this._sessionsService.activeSession.get();
		const multipleVisible = this._sessionsService.visibleSessions.get().length > 1;

		// [B4] Capture current state for the active session (skip multiple-visible and untitled).
		if (activeSession && !multipleVisible && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
			this._captureActiveSessionViewState(activeSession.resource);
		}

		// [B4] Capture working set for the active session (skip untitled)
		if (activeSession && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
			this._saveWorkingSet(activeSession.resource);
		}

		// Collect all session resources across all maps
		const allResources = new ResourceMap<true>();
		this._workingSets.forEach((_, r) => allResources.set(r, true));
		this._viewStateBySession.forEach((_, r) => allResources.set(r, true));
		this._editorPartHiddenBySession.forEach((_, r) => allResources.set(r, true));

		if (allResources.size === 0) {
			this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
			return;
		}

		const entries: ISessionLayoutEntry[] = [];
		allResources.forEach((_, resource) => {
			entries.push({
				sessionResource: resource.toString(),
				editorWorkingSet: this._workingSets.get(resource),
				viewState: this._viewStateBySession.get(resource),
				editorPartHidden: this._editorPartHiddenBySession.get(resource),
			});
		});
		this._storageService.store(this._layoutStateStorageKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	// --- Panel [B1] ---

	private _syncPanelVisibility(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this._layoutService.setPartHidden(true, Parts.PANEL_PART);
			return;
		}

		const wasVisible = this._panelVisibilityBySession.get(sessionResource);
		// Default to hidden if we have no record for this session
		this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
	}

	// --- Editor working sets [B2] ---

	private async _applyWorkingSet(sessionResource: URI | undefined, options?: { readonly isInitialRestore?: boolean }): Promise<void> {
		// Restoring a session's editor working set must never pull keyboard focus
		// into the editor area. Focus during a session switch is owned by the
		// switch itself (it moves focus into the active session's chat input, or
		// leaves it on the panel); letting the editor restore grab focus would
		// steal it from the chat input whenever the target session has editors
		// open.
		const preserveFocus = true;
		const workingSet: IEditorWorkingSet | 'empty' = sessionResource
			? (this._workingSets.get(sessionResource) ?? 'empty')
			: 'empty';

		return this._workingSetSequencer.queue(async () => {
			// When multiple sessions are visible, applying a working set must never
			// change the visibility of the editor part: the editor area is shared
			// across the visible sessions and its visibility is controlled by the
			// user (and by direct editor open/close events outside this path).
			if (this._sessionsService.visibleSessions.get().length > 1) {
				const suppression = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				} finally {
					suppression.dispose();
				}
				return;
			}

			const isModal = this._useModalConfigObs.get() === 'all';
			// The user may have hidden the editor part for this session (e.g. by
			// closing the Side Panel while keeping editors open). Restore it as
			// left instead of forcing the editor part back open on switch. A
			// draft→committed submit records the draft's editor-part visibility onto
			// the committed session (see `_onSessionReplaced`), so this restores the
			// submitted layout too.
			const editorPartHidden = sessionResource ? this._editorPartHiddenBySession.get(sessionResource) === true : false;
			const revealEditorPart = !options?.isInitialRestore
				&& this._shouldRevealEditorPartOnApply(editorPartHidden, isModal);
			// Restore a session that had its (docked) editor part closed by actively
			// hiding it, so returning from a session that had it open does not leave
			// it visible. Mutually exclusive with revealing.
			const hideEditorPart = !options?.isInitialRestore
				&& !revealEditorPart
				&& this._shouldHideEditorPartOnApply(editorPartHidden);

			if (workingSet === 'empty') {
				await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				if (this._shouldRevealEditorPartForEmptyWorkingSet(revealEditorPart) && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
					this._revealEditorPartForWorkingSet();
				} else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
					this._hideEditorPartForWorkingSet();
				}
				return;
			}

			// On the initial restore after a reload, preserve the editor part
			// visibility that the workbench already restored. Single-pane is the
			// exception: its per-session editor-part visibility is authoritative and
			// persisted, so a Detail-only (or whole-side-pane-closed) session must be
			// restored with its editor hidden rather than left visible if the
			// workbench (or an init-time width sync) revealed it. `_shouldHideEditorPartOnApply`
			// returns `false` for the classic layout, so this is a no-op there.
			if (options?.isInitialRestore) {
				const suppression = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				} finally {
					suppression.dispose();
				}
				if (this._shouldHideEditorPartOnApply(editorPartHidden) && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
					this._hideEditorPartForWorkingSet();
				}
				return;
			}

			if (revealEditorPart && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._revealEditorPartForWorkingSet();
			} else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._hideEditorPartForWorkingSet();
			}

			const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			if (revealEditorPart && result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._revealEditorPartForWorkingSet();
			} else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._hideEditorPartForWorkingSet();
			}
		});
	}

	private _saveWorkingSet(sessionResource: URI): void {
		this._deleteWorkingSet(sessionResource);

		// Note: the editor part's hidden state is captured eagerly by the [B2]
		// part-visibility listener at the moment the user changes it, not here —
		// re-reading it lazily at switch-away time races with the incoming
		// session's async layout restore and could record the wrong value.

		if (this._editorService.visibleEditors.length > 0) {
			const workingSetName = `session-working-set:${sessionResource.toString()}`;
			const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
			this._workingSets.set(sessionResource, workingSet);
		}
	}

	private _deleteWorkingSet(sessionResource: URI): void {
		const existingWorkingSet = this._workingSets.get(sessionResource);
		if (!existingWorkingSet) {
			return;
		}

		this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
		this._workingSets.delete(sessionResource);
	}
}
