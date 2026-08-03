/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, IObservable, IReader, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorActivation, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../../workbench/common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SinglePaneChangesTabMissingContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { DockedEditorInput } from '../../../../common/dockedEditorInput.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/** Options to open the Changes tab pinned first, inactive (the workbench auto-activates it only when the group is empty). */
const CHANGES_TAB_OPTIONS: IEditorOptions = { pinned: true, index: 0, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };

/** Options to open the Changes tab pinned first *and active* (used on submit, where the group already holds the Files tab so it would otherwise stay inactive). Keeps `preserveFocus` so activating the tab for detail mapping never steals focus from the just-submitted chat. */
const CHANGES_TAB_ACTIVE_OPTIONS: IEditorOptions = { pinned: true, index: 0, preserveFocus: true, isExplicit: false };

/** Options to open the Files placeholder tab, pinned and inactive. */
const FILES_TAB_OPTIONS: IEditorOptions = { pinned: true, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };

/**
 * What the active session wants from its managed docked tabs.
 *  - `changesSessionResource`: set for any workspace session (the Changes multi-diff tab). `undefined` otherwise.
 *  - `wantsChangesTab`: `true` for any workspace, non-quick-chat session.
 *  - `wantsFilesTab`: `true` for any workspace, non-quick-chat session (the empty Files placeholder tab).
 */
interface IManagedTabsTarget {
	readonly changesSessionResource: URI | undefined;
	readonly wantsChangesTab: boolean;
	readonly wantsFilesTab: boolean;
}

/**
 * Why a reconcile was queued — which "ensure" actions it may take. All default to
 * `false`; each is set by exactly one trigger (see the constructor).
 */
interface IReconcileTrigger {
	/** Open the default docked tabs *if the group is empty* — a session switch, a side-pane reveal, or a settled layout restore. */
	readonly openDefaultsIfEmpty?: boolean;
	/** Ensure **all** docked inputs (Changes + Files) even in a non-empty group — a details-only side-pane reveal, where the docked details panel shows them. */
	readonly ensureAllInputs?: boolean;
	/** Ensure the Changes tab, inactive, when a new-session view becomes eligible or finishes restoring. */
	readonly ensureChanges?: boolean;
	/** Ensure the Changes tab, opened **active**, even in a non-empty group — new-session submit (so the detail panel maps to Changes rather than the still-present Files placeholder). */
	readonly ensureChangesActive?: boolean;
}

/** OR-combines two triggers so accumulated intents are never dropped when reconciles are coalesced. */
function mergeTriggers(a: IReconcileTrigger, b: IReconcileTrigger): IReconcileTrigger {
	return {
		openDefaultsIfEmpty: a.openDefaultsIfEmpty || b.openDefaultsIfEmpty,
		ensureAllInputs: a.ensureAllInputs || b.ensureAllInputs,
		ensureChanges: a.ensureChanges || b.ensureChanges,
		ensureChangesActive: a.ensureChangesActive || b.ensureChangesActive,
	};
}

/** Accumulated reconcile intents scoped to the session (`sessionKey`) they were queued for. */
interface IPendingReconcile {
	readonly sessionKey: string | undefined;
	readonly target: IManagedTabsTarget;
	readonly trigger: IReconcileTrigger;
}

/**
 * Owns the two managed docked tabs — the pinned Changes multi-diff tab and the
 * empty Files placeholder tab for workspace sessions. See
 * `SINGLE_PANE_SCENARIOS.md` for the full reconcile rules.
 */
export class SinglePaneManagedTabsStrategy extends SinglePaneLayoutStrategy {

	private _generation = 0;
	private _lastSyncedSessionKey: string | undefined;

	// The pending reconcile intents, **scoped to the session they were queued
	// for**. Multiple triggers can fire for one logical event on the same session
	// (e.g. submit fires [Trigger A] and, via the submit restore, [Trigger D]);
	// their intents are accumulated so the single surviving (latest-generation)
	// reconcile applies all of them. Scoping to `sessionKey` ensures a trigger
	// queued for one session is never merged into — nor applied to — a different
	// session it was superseded by (a session switch drops the stale intents).
	private _pending: IPendingReconcile | undefined;

	private readonly _changesTabMissingContext: IContextKey<boolean>;
	private readonly _filesTabMissingContext: IContextKey<boolean>;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _coordinator: SinglePaneDockedTabsCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(ctx);

		this._changesTabMissingContext = SinglePaneChangesTabMissingContext.bindTo(contextKeyService);
		this._filesTabMissingContext = SinglePaneFilesTabMissingContext.bindTo(contextKeyService);

		// [Trigger A] Session switch / created transition. A submit (uncreated →
		// created) additionally opens the Changes tab active even though the group
		// already holds the Files placeholder.
		let previousIsCreated: boolean | undefined;
		let previousSessionKey: string | undefined;
		let previousWantsChangesTab = false;
		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			const isCreated = session ? session.isCreated.read(reader) : false;
			const sessionKey = session?.resource.toString();
			const target = this._readTarget(reader);
			const isSubmit = previousIsCreated === false && isCreated;
			const ensureChanges = !isCreated && target.wantsChangesTab
				&& (sessionKey !== previousSessionKey || !previousWantsChangesTab);
			previousIsCreated = session ? isCreated : undefined;
			previousSessionKey = sessionKey;
			previousWantsChangesTab = target.wantsChangesTab;
			this._queueReconcile(target, { openDefaultsIfEmpty: true, ensureChanges, ensureChangesActive: isSubmit });
		}));

		// [Trigger B] The user opened the side pane. A details-only reveal (aux
		// shown, editor hidden) ensures all docked inputs; otherwise the defaults
		// are opened only if the group is empty.
		this._register(this._layoutService.onDidRevealSidePane(() => {
			const detailsOnly = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
			this._queueReconcile(this._readTarget(undefined), { openDefaultsIfEmpty: true, ensureAllInputs: detailsOnly });
		}));

		// [Trigger C] Editor list / side-pane visibility change. This tidies the
		// tabs (removing the redundant Files placeholder while a real file is open)
		// but must not open the defaults — a user file open/close is not a view-open
		// moment, so closing the last tab still closes the side pane. The
		// layout-driven add (a working-set apply during a switch, which empties the
		// group) is handled by [Trigger D] on the *settled* restore, not here — the
		// editor change fires *during* the async apply, racing the empty state.
		const sidePaneVisibleSignal = observableFromEvent(this, this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		const editorsChangedSignal = observableSignalFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange));
		this._register(autorun(reader => {
			sidePaneVisibleSignal.read(reader);
			editorsChangedSignal.read(reader);
			this._queueReconcile(this._readTarget(undefined), {});
		}));

		// [Trigger D] Reconcile after the session-switch working set has fully settled.
		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const session = this._sessionsService.activeSession.get();
			const target = this._readTarget(undefined);
			const ensureChanges = target.wantsChangesTab && session?.isCreated.get() === false;
			this._queueReconcile(target, { openDefaultsIfEmpty: true, ensureChanges });
		}));

		// [Tidy strip] Opening a real workspace file makes the empty Files
		// placeholder redundant, so remove it (a tidy `[Changes][file]` strip).
		// This is a **one-shot reaction to a genuinely new file open**, not a
		// standing rule: the user can still add the Files tab via `+` while a file
		// is open (that opens an EmptyFileEditorInput, not a real file, so it is
		// not removed). Skipped when the editor is merely *re-activated* (selecting
		// an already-open file, or a close revealing the next editor — both fire
		// `onWillOpenEditor` while the editor is already in the group), when it
		// targets a non-main-part group, or during a restore-driven open.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (this._ctx.isRestoringSessionLayout || !this._isWorkspaceFileEditor(e.editor)) {
				return;
			}
			const group = this._editorGroupsService.mainPart.getGroup(e.groupId);
			if (!group || group.contains(e.editor)) {
				return;
			}
			void this._coordinator.sequencer.queue(() => this._removeFilesTab(this._editorGroupsService.mainPart.activeGroup)).catch(onUnexpectedError);
		}));
	}

	// --- Trigger plumbing -------------------------------------------------

	private _readTarget(reader: IReader | undefined): IManagedTabsTarget {
		const read = <T>(obs: IObservable<T>): T => reader ? obs.read(reader) : obs.get();
		const session = read(this._sessionsService.activeSession);
		const isQuickChat = session?.isQuickChat ? read(session.isQuickChat) : false;
		const hasWorkspace = !!session && !!read(session.workspace);
		if (!session || isQuickChat || !hasWorkspace) {
			return { changesSessionResource: undefined, wantsChangesTab: false, wantsFilesTab: false };
		}
		return { changesSessionResource: session.resource, wantsChangesTab: true, wantsFilesTab: true };
	}

	private _queueReconcile(target: IManagedTabsTarget, trigger: IReconcileTrigger): void {
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		// Accumulate intents only within the same session; a session switch drops
		// the previous session's pending intents (and takes the latest target).
		const mergedTrigger = this._pending && this._pending.sessionKey === sessionKey
			? mergeTriggers(this._pending.trigger, trigger)
			: trigger;
		this._pending = { sessionKey, target, trigger: mergedTrigger };
		const generation = ++this._generation;
		void this._coordinator.sequencer.queue(() => this._reconcile(generation)).catch(onUnexpectedError);
	}

	// --- Reconcile --------------------------------------------------------

	private async _reconcile(generation: number): Promise<void> {
		if (generation !== this._generation || !this._pending) {
			return;
		}

		// Consume the accumulated intents. If this reconcile is superseded mid-run,
		// the finally block hands them back — but only if the successor is for the
		// *same* session, so intents never leak across a session switch.
		const pending = this._pending;
		this._pending = undefined;
		try {
			await this._reconcileCore(pending.target, pending.trigger, generation);
		} finally {
			// If a newer reconcile superseded this one, hand our intents to it — but
			// only when it targets the same session, so intents never leak across a
			// session switch.
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

		// Reconciling can transiently empty the group (e.g. closing a stale Changes
		// tab). Suppress editor-part auto-visibility across the whole operation so a
		// transient empty group is never mistaken for the user closing all tabs
		// (which would close the side pane).
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			// [1] Close stale/foreign Changes editors. Compute the empty-group ensure
			// only after this, so a group left empty by the cleanup counts as empty.
			await this._closeForeignChangesEditors(group, changesResource);
			if (generation !== this._generation) {
				return;
			}

			// [2] Decide which docked inputs to open, from the trigger + group state.
			const openIntoEmpty = !!trigger.openDefaultsIfEmpty && group.editors.length === 0;
			const changesPresent = !!changesResource && !!this._findChangesEditor(group, changesResource);
			const filesPresent = group.editors.some(editor => editor instanceof EmptyFileEditorInput);
			const activeChangesResource = this._editorService.activeEditor && this._coordinator.getChangesEditorResource(this._editorService.activeEditor);
			const activateChanges = !!trigger.ensureChangesActive && !!changesResource && (!activeChangesResource || !isEqual(activeChangesResource, changesResource));

			const openChanges = target.wantsChangesTab && !!changesResource && (activateChanges || (!changesPresent && (openIntoEmpty || trigger.ensureAllInputs || trigger.ensureChanges)));
			const openFiles = target.wantsFilesTab && !filesPresent && (openIntoEmpty || trigger.ensureAllInputs);
			const isCreated = this._sessionsService.activeSession.get()?.isCreated.get() ?? false;
			const openFilesFirst = openChanges && openFiles && !isCreated && group.editors.length === 0;

			// [3] Keep Files active by default for a new-session view.
			if (openFilesFirst) {
				await this._openFilesTab(group);
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
				await this._openFilesTab(group);
				if (generation !== this._generation) {
					return;
				}
			}
		} finally {
			suppression.dispose();
			if (generation === this._generation) {
				this._updateAddTabContexts(target);
			}
		}
	}

	/** On a session change, drop editors captured while the previous session's editor area was hidden so they are not reopened here. */
	private _resetCollapsedEditorsOnSessionChange(): void {
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		if (sessionKey !== this._lastSyncedSessionKey) {
			this._coordinator.collapsedEditors = undefined;
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

	private async _openFilesTab(group: IEditorGroup): Promise<void> {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			await this._editorService.openEditor(this._instantiationService.createInstance(EmptyFileEditorInput), FILES_TAB_OPTIONS, group);
		} finally {
			suppression.dispose();
		}
	}

	private async _removeFilesTab(group: IEditorGroup): Promise<void> {
		const placeholder = group.editors.find((editor): editor is EmptyFileEditorInput => editor instanceof EmptyFileEditorInput);
		if (placeholder) {
			await this._closeManagedEditors(group, [placeholder]);
		}
	}

	private async _closeForeignChangesEditors(group: IEditorGroup, activeChangesResource: URI | undefined): Promise<void> {
		const foreign = group.editors.filter(editor => {
			const resource = this._coordinator.getChangesEditorResource(editor);
			return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
		});
		if (foreign.length > 0) {
			await this._closeManagedEditors(group, foreign);
		}
	}

	/** Closes editors we own, preserving focus so a transient close never steals it. */
	private async _closeManagedEditors(group: IEditorGroup, editors: EditorInput[]): Promise<void> {
		await this._editorService.closeEditors(editors.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
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
			const resource = this._coordinator.getChangesEditorResource(editor);
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
		const changesPresent = group.editors.some(editor => this._coordinator.getChangesEditorResource(editor) !== undefined);
		const filesPresent = group.editors.some(editor => editor instanceof EmptyFileEditorInput);
		this._changesTabMissingContext.set(target.wantsChangesTab && !changesPresent);
		this._filesTabMissingContext.set(target.wantsFilesTab && !filesPresent);
	}
}
