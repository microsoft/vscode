/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorActivation, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { EditorResourceAccessor, IUntypedEditorInput, SideBySideEditor } from '../../../../../workbench/common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { DockedEditorInput } from '../../../../common/dockedEditorInput.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionChangesEditorInput } from '../../../changes/browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISinglePaneLayoutContext } from './singlePaneLayoutStrategy.js';

/** Options to open the Changes tab pinned first, inactive (the workbench auto-activates it only when the group is empty). */
const CHANGES_TAB_OPTIONS: IEditorOptions = { pinned: true, index: 0, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };

/** Options to open the Changes tab pinned first *and active* (used on submit, where the group already holds the Files tab so it would otherwise stay inactive). Keeps `preserveFocus` so activating the tab for detail mapping never steals focus from the just-submitted chat. */
const CHANGES_TAB_ACTIVE_OPTIONS: IEditorOptions = { pinned: true, index: 0, preserveFocus: true, isExplicit: false };

/** Options to open the Files placeholder tab, pinned and inactive. */
const FILES_TAB_OPTIONS: IEditorOptions = { pinned: true, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };

/**
 * What the active session wants from its managed docked tabs.
 *  - `changesSessionResource`: set for any workspace session (the Changes multi-diff tab). `undefined` otherwise.
 *  - `wantsChangesTab`: `true` for any workspace session.
 *  - `wantsFilesTab`: `true` for any workspace, non-quick-chat session (the empty Files placeholder tab).
 */
export interface IManagedTabsTarget {
	readonly changesSessionResource: URI | undefined;
	readonly workspace: ISessionWorkspace | undefined;
	readonly wantsChangesTab: boolean;
	readonly wantsFilesTab: boolean;
}

/**
 * Why a reconcile was queued — which "ensure" actions it may take. All default to
 * `false`; each is set by exactly one caller (the New/Existing lifecycle strategies, or one
 * of this coordinator's own ambient triggers).
 */
export interface IReconcileTrigger {
	/** Open the default docked tabs *if the group is empty* — a session switch, a side-pane reveal, or a settled layout restore. */
	readonly openDefaultsIfEmpty?: boolean;
	/** Ensure the Changes tab, inactive, when a new-session view becomes eligible or finishes restoring. */
	readonly ensureChanges?: boolean;
	/** Ensure the Changes tab, opened **active**, even in a non-empty group — new-session submit (so the detail panel maps to Changes rather than the still-present Files placeholder). */
	readonly ensureChangesActive?: boolean;
	/** A saved working set finished restoring for the active session. */
	readonly workingSetRestored?: boolean;
}

/** OR-combines two triggers so accumulated intents are never dropped when reconciles are coalesced. */
function mergeTriggers(a: IReconcileTrigger, b: IReconcileTrigger): IReconcileTrigger {
	return {
		openDefaultsIfEmpty: a.openDefaultsIfEmpty || b.openDefaultsIfEmpty,
		ensureChanges: a.ensureChanges || b.ensureChanges,
		ensureChangesActive: a.ensureChangesActive || b.ensureChangesActive,
		workingSetRestored: a.workingSetRestored || b.workingSetRestored,
	};
}

/** Accumulated reconcile intents scoped to the session (`sessionKey`) they were queued for. */
interface IPendingReconcile {
	readonly sessionKey: string | undefined;
	readonly target: IManagedTabsTarget;
	readonly trigger: IReconcileTrigger;
}

/**
 * Owns the two managed docked tabs (the pinned Changes multi-diff tab and the empty Files
 * placeholder tab for workspace sessions) and the detail-only editor-area collapse. Shared
 * (not a strategy) because both belong to one reconcile pipeline that must stay single-instance
 * across the New→Existing submit transition — see `SinglePaneLayoutStrategy`'s doc comment.
 * Owned and disposed by {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}.
 * `SinglePaneNewSessionStrategy` supplies its own supplementary reconcile intents via
 * {@link queueReconcile}; `SinglePaneQuickChatStrategy` never wants managed tabs, so it never
 * calls in — the ambient session-change trigger below reconciles them away on its own.
 *
 * See `SINGLE_PANE_SCENARIOS.md` for the full reconcile rules.
 */
export class SinglePaneDockedTabsCoordinator extends Disposable {

	/** Non-docked editors closed (as reopenable inputs + tab index) while the editor area is hidden. */
	private _collapsedEditors: { readonly editor: IUntypedEditorInput; readonly index: number }[] | undefined;
	private readonly _sequencer = new Sequencer();

	private _generation = 0;
	private _lastSyncedSessionKey: string | undefined;
	private _preserveMissingFilesForSessionKey: string | undefined;
	private _filesTabDismissed = false;
	private _changingFilesInternally = false;

	// The pending reconcile intents, **scoped to the session they were queued for**. Multiple
	// triggers can fire for one logical event on the same session (e.g. submit fires the
	// ambient session-change trigger and, via the submit restore, the settled-restore trigger);
	// their intents are accumulated so the single surviving (latest-generation) reconcile
	// applies all of them. Scoping to `sessionKey` ensures a trigger queued for one session is
	// never merged into — nor applied to — a different session it was superseded by (a session
	// switch drops the stale intents).
	private _pending: IPendingReconcile | undefined;

	private readonly _changesTabMissingContext: IContextKey<boolean>;
	private readonly _filesTabMissingContext: IContextKey<boolean>;
	private readonly _changesTabAvailableContext: IContextKey<boolean>;
	private readonly _filesTabAvailableContext: IContextKey<boolean>;

	/** Last observed editor-area visibility, to act only on transitions. */
	private _editorAreaVisible: boolean | undefined;

	constructor(
		private readonly _ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._changesTabMissingContext = SinglePaneChangesTabMissingContext.bindTo(contextKeyService);
		this._filesTabMissingContext = SinglePaneFilesTabMissingContext.bindTo(contextKeyService);
		this._changesTabAvailableContext = SinglePaneChangesTabAvailableContext.bindTo(contextKeyService);
		this._filesTabAvailableContext = SinglePaneFilesTabAvailableContext.bindTo(contextKeyService);

		// [Ambient trigger] Session switch / created transition, kind-agnostic (fires for New,
		// Existing, and Quick Chat alike — a quick chat's target wants neither tab, so this
		// reconciles any stray managed tabs away).
		let previousChangesSessionResource: URI | undefined;
		this._register(autorun(reader => {
			const target = this._readTarget(reader);
			const ensureChanges = !!target.changesSessionResource
				&& (!previousChangesSessionResource || !isEqual(previousChangesSessionResource, target.changesSessionResource));
			previousChangesSessionResource = target.changesSessionResource;
			if (!target.wantsChangesTab) {
				this._filesTabDismissed = false;
			}
			this.queueReconcile(target, { openDefaultsIfEmpty: true, ensureChanges });
		}));

		// [Ambient trigger] The user opened the side pane.
		this._register(this._layoutService.onDidRevealSidePane(() => {
			this.queueReconcile(this._readTarget(undefined), { openDefaultsIfEmpty: true });
		}));

		// [Ambient trigger] Editor list / side-pane visibility change. This tidies the tabs
		// (removing the redundant Files placeholder while a real file is open) but must not
		// open the defaults — a user file open/close is not a view-open moment, so closing the
		// last tab still closes the side pane. The layout-driven add (a working-set apply
		// during a switch, which empties the group) is handled by the settled-restore trigger
		// below, not here — the editor change fires *during* the async apply, racing the empty
		// state.
		const partVisibilityChangedSignal = observableSignalFromEvent(this, this._layoutService.onDidChangePartVisibility);
		const editorsChangedSignal = observableSignalFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange));
		this._register(autorun(reader => {
			partVisibilityChangedSignal.read(reader);
			editorsChangedSignal.read(reader);
			this.queueReconcile(this._readTarget(undefined), {});
		}));

		// [Ambient trigger] Reconcile after the session-switch working set has fully settled.
		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const session = this._sessionsService.activeSession.get();
			const target = this._readTarget(undefined);
			const ensureChanges = target.wantsChangesTab && session?.isCreated.get() === false;
			this.queueReconcile(target, { openDefaultsIfEmpty: true, ensureChanges, workingSetRestored: true });
		}));

		// [Tidy strip] Opening a real workspace file makes the empty Files placeholder
		// redundant, so remove it (a tidy `[Changes][file]` strip). This is a **one-shot
		// reaction to a genuinely new file open**, not a standing rule: the user can still add
		// the Files tab via `+` while a file is open (that opens an EmptyFileEditorInput, not a
		// real file, so it is not removed). Skipped when the editor is merely *re-activated*
		// (selecting an already-open file, or a close revealing the next editor — both fire
		// `onWillOpenEditor` while the editor is already in the group), when it targets a
		// non-main-part group, or during a restore-driven open.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (e.editor instanceof EmptyFileEditorInput && !this._changingFilesInternally && !this._ctx.isRestoringSessionLayout) {
				this._filesTabDismissed = false;
			}
			if (this._ctx.isRestoringSessionLayout || !this._isWorkspaceFileEditor(e.editor)) {
				return;
			}
			const group = this._editorGroupsService.mainPart.getGroup(e.groupId);
			if (!group || group.contains(e.editor)) {
				return;
			}
			void this._sequencer.queue(() => this._removeFilesTab(this._editorGroupsService.mainPart.activeGroup)).catch(onUnexpectedError);
		}));
		this._register(this._editorService.onDidCloseEditor(e => {
			if (e.editor instanceof EmptyFileEditorInput
				&& !this._changingFilesInternally
				&& !this._ctx.isRestoringSessionLayout
				&& !this._layoutService.isEditorPartAutoVisibilitySuppressed()
				&& this._readTarget(undefined).wantsChangesTab) {
				this._filesTabDismissed = true;
			}
		}));

		// [Editor-area collapse] When the editor area is hidden **while the detail panel (aux
		// bar) stays open** — a detail-only collapse — close every non-docked editor so only
		// the docked Changes/Files tabs remain. Closing the **whole side pane** (both the
		// editor area and the aux bar) is *not* a collapse — editors are left untouched so they
		// are still there when the side pane is reopened. Kind-agnostic: applies the same way
		// whether the detail-only state belongs to a New Session or an Existing Session.
		const editorAreaVisibleObs = observableSignalFromEvent(this, this._layoutService.onDidChangePartVisibility);
		this._register(autorun(reader => {
			editorAreaVisibleObs.read(reader);
			const visible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
			if (this._editorAreaVisible === undefined) {
				this._editorAreaVisible = visible;
				return;
			}
			if (visible === this._editorAreaVisible) {
				return;
			}
			this._editorAreaVisible = visible;

			// Session-switch restores toggle editor-area visibility as a side effect; those
			// are layout-driven, not a user hide/show, so skip them.
			if (this._ctx.isRestoringSessionLayout) {
				return;
			}

			if (visible) {
				void this._sequencer.queue(() => this._restoreCollapsedTabs()).catch(onUnexpectedError);
				return;
			}

			// Only collapse on a **detail-only** hide (editor closed, detail kept).
			if (this._ctx.togglingSidePane) {
				return;
			}
			if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				void this._sequencer.queue(() => this._collapseNonManagedTabs()).catch(onUnexpectedError);
			}
		}));

		this._register(this._ctx.onDidEndSessionLayoutRestore(() => this._queueCollapseIfDetailsOnly()));
		this._register(this._editorService.onDidEditorsChange(() => {
			if (!this._ctx.isRestoringSessionLayout) {
				this._queueCollapseIfDetailsOnly();
			}
		}));
	}

	/** The resource this managed Changes editor input shows, if it is one. */
	getChangesEditorResource(editor: EditorInput): URI | undefined {
		const resource = editor.resource;
		return resource && this._sessionChangesService.getSessionResource(resource) ? resource : undefined;
	}

	prepareWorkingSetRestore(hasSavedWorkingSet: boolean): void {
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		this._preserveMissingFilesForSessionKey = hasSavedWorkingSet && this._filesTabDismissed ? sessionKey : undefined;
	}

	// --- Trigger plumbing (called by the New/Existing lifecycle strategies) -----------------

	/** Reads the current managed-tabs target for the active session (or for `reader`'s transaction, if given). */
	readTarget(reader: IReader | undefined): IManagedTabsTarget {
		return this._readTarget(reader);
	}

	/** Queues a reconcile for the active session, merging `trigger` with any not-yet-applied pending intents for that session. */
	queueReconcile(target: IManagedTabsTarget, trigger: IReconcileTrigger): void {
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		// Accumulate intents only within the same session; a session switch drops the previous
		// session's pending intents (and takes the latest target).
		const mergedTrigger = this._pending && this._pending.sessionKey === sessionKey
			? mergeTriggers(this._pending.trigger, trigger)
			: trigger;
		this._pending = { sessionKey, target, trigger: mergedTrigger };
		const generation = ++this._generation;
		void this._sequencer.queue(() => this._reconcile(generation)).catch(onUnexpectedError);
	}

	private _readTarget(reader: IReader | undefined): IManagedTabsTarget {
		const read = <T>(obs: IObservable<T>): T => reader ? obs.read(reader) : obs.get();
		const session = read(this._sessionsService.activeSession);
		const isQuickChat = session?.isQuickChat ? read(session.isQuickChat) : false;
		const workspace = session ? read(session.workspace) : undefined;
		if (!session || isQuickChat || !workspace) {
			return { changesSessionResource: undefined, workspace: undefined, wantsChangesTab: false, wantsFilesTab: false };
		}
		return { changesSessionResource: session.resource, workspace, wantsChangesTab: true, wantsFilesTab: true };
	}

	// --- Reconcile --------------------------------------------------------

	private async _reconcile(generation: number): Promise<void> {
		if (generation !== this._generation || !this._pending) {
			return;
		}

		// Consume the accumulated intents. If this reconcile is superseded mid-run, the finally
		// block hands them back — but only if the successor is for the *same* session, so
		// intents never leak across a session switch.
		const pending = this._pending;
		this._pending = undefined;
		try {
			await this._reconcileCore(pending.target, pending.trigger, generation);
		} finally {
			// If a newer reconcile superseded this one, hand our intents to it — but only when
			// it targets the same session, so intents never leak across a session switch.
			const successor = this._pending as IPendingReconcile | undefined;
			if (generation !== this._generation && successor && successor.sessionKey === pending.sessionKey) {
				this._pending = { ...successor, trigger: mergeTriggers(successor.trigger, pending.trigger) };
			}
		}
	}

	private async _reconcileCore(target: IManagedTabsTarget, trigger: IReconcileTrigger, generation: number): Promise<void> {
		const group = this._editorGroupsService.mainPart.activeGroup;
		this._resetCollapsedEditorsOnSessionChange();

		const changesResource = target.changesSessionResource ? this._sessionChangesService.getChangesEditorResource(target.changesSessionResource) : undefined;

		// Reconciling can transiently empty the group (e.g. closing a stale Changes tab).
		// Suppress editor-part auto-visibility across the whole operation so a transient empty
		// group is never mistaken for the user closing all tabs (which would close the side pane).
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			// [1] Replace an outgoing session's Changes tab in place when the incoming
			// session also wants Changes; close only additional stale tabs.
			await this._reconcileForeignChangesEditors(group, changesResource);
			if (generation !== this._generation) {
				return;
			}
			this._updateFilesEditors(group, target.workspace);
			const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
			const preserveMissingFiles = !!trigger.workingSetRestored && this._preserveMissingFilesForSessionKey === sessionKey;
			if (preserveMissingFiles) {
				await this._removeFilesTab(group);
				if (generation !== this._generation) {
					return;
				}
			}

			// [2] Decide which docked inputs to open, from the trigger + group state.
			const openIntoEmpty = !!trigger.openDefaultsIfEmpty && group.editors.length === 0;
			const changesPresent = !!changesResource && !!this._findChangesEditor(group, changesResource);
			const filesPresent = group.editors.some(editor => editor instanceof EmptyFileEditorInput);
			const activeChangesResource = this._editorService.activeEditor && this.getChangesEditorResource(this._editorService.activeEditor);
			const activateChanges = !!trigger.ensureChangesActive && !!changesResource && (!activeChangesResource || !isEqual(activeChangesResource, changesResource));
			const ensureAllInputs = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
				&& !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);

			const openChanges = target.wantsChangesTab && !!changesResource && (activateChanges || (!changesPresent && (openIntoEmpty || ensureAllInputs || trigger.ensureChanges)));
			const openFiles = target.wantsFilesTab && !filesPresent && !preserveMissingFiles && (openIntoEmpty || ensureAllInputs);
			const isCreated = this._sessionsService.activeSession.get()?.isCreated.get() ?? false;
			const openFilesFirst = openChanges && openFiles && !isCreated && group.editors.length === 0;

			// [3] Keep Files active by default for a new-session view.
			if (openFilesFirst) {
				await this._openFilesTab(group, target.workspace);
				if (generation !== this._generation) {
					return;
				}
			}

			// [4] Open Changes (active on submit so the detail panel maps to it).
			if (openChanges && changesResource) {
				if (!await this._openChangesTab(target.changesSessionResource!, changesResource, group, generation, activateChanges)) {
					return;
				}
			}

			// [5] Open the Files placeholder after Changes for created sessions.
			if (openFiles && !openFilesFirst) {
				await this._openFilesTab(group, target.workspace);
				if (generation !== this._generation) {
					return;
				}
			}
		} finally {
			suppression.dispose();
			if (generation === this._generation) {
				if (trigger.workingSetRestored) {
					this._preserveMissingFilesForSessionKey = undefined;
				}
				this._updateAddTabContexts(target);
			}
		}
	}

	/** On a session change, drop editors captured while the previous session's editor area was hidden so they are not reopened here. */
	private _resetCollapsedEditorsOnSessionChange(): void {
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		if (sessionKey !== this._lastSyncedSessionKey) {
			this._collapsedEditors = undefined;
			this._lastSyncedSessionKey = sessionKey;
		}
	}

	// --- Tab operations ---------------------------------------------------

	/** Opens the Changes editor pinned first (active on submit). Returns `false` if a newer reconcile superseded this one mid-open. */
	private async _openChangesTab(sessionResource: URI, changesResource: URI, group: IEditorGroup, generation: number, active: boolean): Promise<boolean> {
		this._changesViewService.setChangesetId(undefined);
		await this._sessionChangesService.openChangesEditor(sessionResource, active ? CHANGES_TAB_ACTIVE_OPTIONS : CHANGES_TAB_OPTIONS, group);
		if (generation !== this._generation) {
			return false;
		}
		const changesEditor = this._findChangesEditor(group, changesResource);
		if (changesEditor) {
			this._pinFirst(group, changesEditor);
		}
		return true;
	}

	private async _openFilesTab(group: IEditorGroup, workspace: ISessionWorkspace | undefined): Promise<void> {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		this._changingFilesInternally = true;
		try {
			await this._editorService.openEditor(this._instantiationService.createInstance(EmptyFileEditorInput, workspace), FILES_TAB_OPTIONS, group);
			this._filesTabDismissed = false;
		} finally {
			this._changingFilesInternally = false;
			suppression.dispose();
		}
	}

	private async _removeFilesTab(group: IEditorGroup): Promise<void> {
		const placeholder = group.editors.find((editor): editor is EmptyFileEditorInput => editor instanceof EmptyFileEditorInput);
		if (placeholder) {
			this._changingFilesInternally = true;
			try {
				await this._closeManagedEditors(group, [placeholder]);
			} finally {
				this._changingFilesInternally = false;
			}
		}
	}

	private async _reconcileForeignChangesEditors(group: IEditorGroup, activeChangesResource: URI | undefined): Promise<void> {
		const foreign = group.editors.filter(editor => {
			const resource = this.getChangesEditorResource(editor);
			return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
		});
		if (foreign.length === 0) {
			return;
		}

		if (!activeChangesResource) {
			await this._closeManagedEditors(group, foreign);
			return;
		}

		const [editorToReplace, ...editorsToClose] = foreign;
		const wasActive = group.activeEditor === editorToReplace;
		await group.replaceEditors([{
			editor: editorToReplace,
			replacement: this._instantiationService.createInstance(SessionChangesEditorInput, activeChangesResource),
			options: wasActive ? CHANGES_TAB_ACTIVE_OPTIONS : CHANGES_TAB_OPTIONS,
		}]);
		if (editorsToClose.length > 0) {
			await this._closeManagedEditors(group, editorsToClose);
		}
	}

	private _updateFilesEditors(group: IEditorGroup, workspace: ISessionWorkspace | undefined): void {
		for (const editor of group.editors) {
			if (editor instanceof EmptyFileEditorInput) {
				editor.setWorkspace(workspace);
			}
		}
	}

	/** Closes editors we own, preserving focus so a transient close never steals it. */
	private async _closeManagedEditors(group: IEditorGroup, editors: EditorInput[]): Promise<void> {
		await this._editorService.closeEditors(editors.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true, force: true });
	}

	private _pinFirst(group: IEditorGroup, editor: EditorInput): void {
		if (!group.isPinned(editor)) {
			group.pinEditor(editor);
		}
		if (group.getIndexOfEditor(editor) !== 0) {
			group.moveEditor(editor, group, CHANGES_TAB_OPTIONS);
		}
	}

	// --- Queries ----------------------------------------------------------

	private _findChangesEditor(group: IEditorGroup, changesResource: URI): EditorInput | undefined {
		return group.editors.find(editor => {
			const resource = this.getChangesEditorResource(editor);
			return !!resource && isEqual(resource, changesResource);
		});
	}

	/** Whether the editor shows a workspace file (a file-system resource), excluding managed docked placeholders. */
	private _isWorkspaceFileEditor(editor: EditorInput): boolean {
		if (editor instanceof DockedEditorInput) {
			return false;
		}
		const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		return resource?.scheme === Schemas.file || resource?.scheme === Schemas.vscodeRemote;
	}

	/** Offer the `+` "Changes"/"Files" entries when the session supports them but their tabs are closed. */
	private _updateAddTabContexts(target: IManagedTabsTarget): void {
		const group = this._editorGroupsService.mainPart.activeGroup;
		const changesPresent = group.editors.some(editor => this.getChangesEditorResource(editor) !== undefined);
		const filesPresent = group.editors.some(editor => editor instanceof EmptyFileEditorInput);
		this._changesTabAvailableContext.set(target.wantsChangesTab);
		this._filesTabAvailableContext.set(target.wantsFilesTab);
		this._changesTabMissingContext.set(target.wantsChangesTab && !changesPresent);
		this._filesTabMissingContext.set(target.wantsFilesTab && !filesPresent);
	}

	// --- Editor-area collapse ----------------------------------------------

	private _queueCollapseIfDetailsOnly(): void {
		if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			void this._sequencer.queue(() => this._collapseNonManagedTabs()).catch(onUnexpectedError);
		}
	}

	private async _collapseNonManagedTabs(): Promise<void> {
		const group = this._editorGroupsService.mainPart.activeGroup;
		const captured: { editor: IUntypedEditorInput; index: number }[] = [...(this._collapsedEditors ?? [])];
		const toClose: EditorInput[] = [];
		group.editors.forEach((editor, index) => {
			if (editor instanceof DockedEditorInput || this.getChangesEditorResource(editor)) {
				return;
			}
			// Capture editors that can be reopened so they are restored when the editor area is
			// shown again; the rest are still closed but not restored.
			const untyped = editor.toUntyped();
			if (untyped) {
				captured.push({ editor: untyped, index });
			}
			toClose.push(editor);
		});
		if (toClose.length === 0) {
			return;
		}

		this._collapsedEditors = captured;
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			await this._editorService.closeEditors(toClose.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
		} finally {
			suppressEditorPartAutoVisibility.dispose();
		}
	}

	private async _restoreCollapsedTabs(): Promise<void> {
		const captured = this._collapsedEditors;
		this._collapsedEditors = undefined;
		if (!captured || captured.length === 0) {
			return;
		}

		const group = this._editorGroupsService.mainPart.activeGroup;
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			// Reopen in ascending index order, each at its original tab position, so the tabs
			// return to where they were before the editor area was hidden.
			await this._editorService.openEditors(
				[...captured]
					.sort((a, b) => a.index - b.index)
					.map(({ editor, index }) => ({ ...editor, options: { ...editor.options, index, inactive: true, preserveFocus: true, pinned: true } })),
				group);
		} finally {
			suppressEditorPartAutoVisibility.dispose();
		}
	}
}
