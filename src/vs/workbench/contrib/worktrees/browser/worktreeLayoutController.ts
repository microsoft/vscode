/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, derivedObservableWithCache, derivedOpts, observableFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorIdentifier } from '../../../common/editor.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorktree, IWorktreeGroupService } from '../../../services/worktrees/common/worktrees.js';

/**
 * Editor input typeIds that don't survive `editorGroupsService.applyWorkingSet`
 * because their backing model lives in a separate manager which disposes the
 * model when the editor closes. On restore, the saved input's `resolve()`
 * asserts that the model still exists and throws. We pre-close these on
 * switch so the working set only contains restore-safe inputs.
 *
 * - `workbench.editors.webviewEditor`: CustomEditorInput (e.g. Markdown
 *   preview, image previewer, any contributed custom editor).
 * - `workbench.editors.webviewInput`: WebviewInput (extension webview panels
 *   surfaced as editors).
 */
const UNRESTORABLE_EDITOR_TYPE_IDS: ReadonlySet<string> = new Set([
	'workbench.editors.webviewEditor',
	'workbench.editors.webviewInput',
]);

/**
 * Per-worktree view state captured when switching away.
 */
interface IWorktreeViewState {
	readonly auxiliaryBarVisible: boolean;
	readonly auxiliaryBarActiveViewContainerId: string | undefined;
}

interface IWorktreeLayoutEntry {
	readonly worktreeResource: string;
	readonly viewState?: IWorktreeViewState;
	readonly editorWorkingSet?: IEditorWorkingSet;
	readonly panelVisible?: boolean;
}

const WORKTREE_LAYOUT_STATE_KEY = 'worktrees.layoutState';

/**
 * Saves and restores per-worktree layout state: editor working set, auxiliary
 * bar visibility, and panel visibility. Mirrors the Sessions layout controller
 * but keyed by worktree URI instead of session resource.
 */
export class WorktreeLayoutController extends Disposable {

	static readonly ID = 'workbench.contrib.worktrees.layoutController';

	private readonly _panelVisibilityByWorktree = new ResourceMap<boolean>();
	private readonly _viewStateByWorktree = new ResourceMap<IWorktreeViewState>();
	private readonly _workingSets = new ResourceMap<IEditorWorkingSet>();
	private readonly _workingSetSequencer = new Sequencer();

	constructor(
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWorktreeGroupService private readonly _worktreeGroupService: IWorktreeGroupService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IPaneCompositePartService private readonly _paneCompositePartService: IPaneCompositePartService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._loadState();
		this._register(this._storageService.onWillSaveState(() => this._saveState()));

		const activeWorktreeUriObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual,
		}, reader => this._worktreeGroupService.activeWorktree.read(reader)?.uri);

		// Auxiliary bar: capture outgoing state immediately so we snapshot the
		// user's current aux bar before the workspace folder swap fires any
		// resets. Restore happens later, on `activeWorktreeForWorkingSet`,
		// after the workspace has caught up — otherwise the workbench's own
		// per-workspace layout restoration overwrites ours.
		let previousWorktreeUri: URI | undefined;
		this._register(autorun(reader => {
			const activeUri = activeWorktreeUriObs.read(reader);

			const isWorktreeSwitch = previousWorktreeUri !== undefined
				&& !isEqual(previousWorktreeUri, activeUri);
			if (isWorktreeSwitch) {
				this._captureViewState(previousWorktreeUri!);
			}
			previousWorktreeUri = activeUri;
		}));

		// Panel visibility tracking — record user toggles.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			const active = this._worktreeGroupService.activeWorktree.get();
			if (active) {
				this._panelVisibilityByWorktree.set(active.uri, e.visible);
			}
		}));

		// Panel visibility: restore on switch.
		this._register(autorun(reader => {
			const activeUri = activeWorktreeUriObs.read(reader);
			this._syncPanelVisibility(activeUri);
		}));

		// Editor working sets — only apply after workspace folders match the
		// active worktree, otherwise we'd close editors mid-swap.
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders,
		);

		const activeWorktreeForWorkingSet = derivedObservableWithCache<IWorktree | undefined>(this, (reader, lastValue) => {
			const folders = workspaceFoldersObs.read(reader);
			const active = this._worktreeGroupService.activeWorktree.read(reader);
			if (active && !folders.some(f => isEqual(f.uri, active.uri))) {
				// Workspace hasn't caught up to the new worktree yet — keep last value.
				return lastValue;
			}
			if (isEqual(active?.uri, lastValue?.uri)) {
				return lastValue;
			}
			return active;
		});

		this._register(runOnChange(activeWorktreeForWorkingSet, (worktree, previous) => {
			void this._workingSetSequencer.queue(async () => {
				try {
					if (previous) {
						await this._closeUnrestorableEditors();
						this._saveWorkingSet(previous.uri);
					}
					// On initial load (no previous), only apply if we have a saved
					// working set — skip applying 'empty' to avoid closing editors
					// being restored.
					if (previous || (worktree && this._workingSets.has(worktree.uri))) {
						await this._applyWorkingSetInner(worktree?.uri);
					}
				} catch (err) {
					this._logService.warn('[Worktrees] layout transition failed', err);
				}
			});
		}));

		// Aux bar restore: runs once the workspace folders have caught up to
		// the active worktree, so the workbench's own per-workspace layout
		// restoration can't overwrite us. Falls back to the previous worktree's
		// state on a first visit so visibility "carries over" naturally rather
		// than collapsing to the new workspace's default.
		this._register(runOnChange(activeWorktreeForWorkingSet, (worktree, previous) => {
			if (!worktree) {
				return;
			}
			this._syncAuxiliaryBarVisibility(worktree.uri, previous?.uri);
		}));

		// Drop state for worktrees that disappeared from the filesystem.
		this._register(this._worktreeGroupService.onDidChangeWorktrees(e => {
			for (const removed of e.removed) {
				this._deleteWorkingSet(removed.uri);
			}
		}));
	}

	// --- Auxiliary bar ---

	private _captureViewState(worktreeUri: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
		this._viewStateByWorktree.set(worktreeUri, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: activeViewContainerId,
		});
	}

	private _syncAuxiliaryBarVisibility(worktreeUri: URI, fallbackUri: URI | undefined): void {
		// Prefer the worktree's own saved state. On a first visit there's no
		// saved state, so carry over from the worktree we just switched away
		// from — this keeps aux bar visibility stable across switches instead
		// of collapsing to the new workspace's default (which is what the
		// workbench's per-workspace restoration produces).
		const state = this._viewStateByWorktree.get(worktreeUri)
			?? (fallbackUri ? this._viewStateByWorktree.get(fallbackUri) : undefined);
		if (!state) {
			return;
		}
		if (!state.auxiliaryBarVisible) {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			return;
		}
		// Explicit show — `openViewContainer` alone doesn't unhide the part,
		// so without this we'd silently no-op when the workbench has just
		// hidden the aux bar as part of its workspace-folder restoration.
		this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		if (state.auxiliaryBarActiveViewContainerId) {
			this._viewsService.openViewContainer(state.auxiliaryBarActiveViewContainerId, false);
		}
	}

	// --- Panel ---

	private _syncPanelVisibility(worktreeUri: URI | undefined): void {
		if (!worktreeUri) {
			return;
		}
		const saved = this._panelVisibilityByWorktree.get(worktreeUri);
		if (saved === undefined) {
			// No record — leave panel as the user last set it.
			return;
		}
		this._layoutService.setPartHidden(!saved, Parts.PANEL_PART);
	}

	// --- Editor working sets ---

	private async _applyWorkingSetInner(worktreeUri: URI | undefined): Promise<void> {
		const preserveFocus = this._layoutService.hasFocus(Parts.PANEL_PART);
		const workingSet: IEditorWorkingSet | 'empty' = worktreeUri
			? (this._workingSets.get(worktreeUri) ?? 'empty')
			: 'empty';

		if (workingSet === 'empty') {
			await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			return;
		}

		if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}

		const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
		if (result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}

	/**
	 * Closes editors whose typeIds are listed in `UNRESTORABLE_EDITOR_TYPE_IDS`,
	 * so the subsequent `saveWorkingSet` snapshot contains only inputs that can
	 * be restored cleanly later. Best-effort: failures are non-fatal.
	 */
	private async _closeUnrestorableEditors(): Promise<void> {
		const toClose: IEditorIdentifier[] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (UNRESTORABLE_EDITOR_TYPE_IDS.has(editor.typeId)) {
					toClose.push({ editor, groupId: group.id });
				}
			}
		}
		if (toClose.length === 0) {
			return;
		}
		await this._editorService.closeEditors(toClose, { preserveFocus: true });
	}

	private _saveWorkingSet(worktreeUri: URI): void {
		this._deleteWorkingSet(worktreeUri);
		if (this._editorService.visibleEditors.length === 0) {
			return;
		}
		// Defensive: never persist a working set that contains an editor whose
		// restore would throw. The runtime switch path already pre-closes these
		// via `_closeUnrestorableEditors`, but the sync shutdown path
		// (onWillSaveState) can't await, so the guard keeps the saved state
		// safe to apply later.
		if (this._editorService.visibleEditors.some(e => UNRESTORABLE_EDITOR_TYPE_IDS.has(e.typeId))) {
			return;
		}
		const workingSetName = `worktree-working-set:${worktreeUri.toString()}`;
		const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
		this._workingSets.set(worktreeUri, workingSet);
	}

	private _deleteWorkingSet(worktreeUri: URI): void {
		const existing = this._workingSets.get(worktreeUri);
		if (!existing) {
			return;
		}
		this._editorGroupsService.deleteWorkingSet(existing);
		this._workingSets.delete(worktreeUri);
		this._viewStateByWorktree.delete(worktreeUri);
		this._panelVisibilityByWorktree.delete(worktreeUri);
	}

	// --- Persistence ---

	private _loadState(): void {
		const raw = this._storageService.get(WORKTREE_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			for (const entry of JSON.parse(raw) as IWorktreeLayoutEntry[]) {
				const uri = URI.parse(entry.worktreeResource);
				if (entry.editorWorkingSet) {
					this._workingSets.set(uri, entry.editorWorkingSet);
				}
				if (entry.viewState) {
					this._viewStateByWorktree.set(uri, entry.viewState);
				}
				if (typeof entry.panelVisible === 'boolean') {
					this._panelVisibilityByWorktree.set(uri, entry.panelVisible);
				}
			}
		} catch (err) {
			this._logService.warn('[Worktrees] failed to parse layout state, discarding', err);
			this._storageService.remove(WORKTREE_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _saveState(): void {
		const active = this._worktreeGroupService.activeWorktree.get();
		if (active) {
			this._captureViewState(active.uri);
			this._saveWorkingSet(active.uri);
		}

		const allResources = new ResourceMap<true>();
		this._workingSets.forEach((_, r) => allResources.set(r, true));
		this._viewStateByWorktree.forEach((_, r) => allResources.set(r, true));
		this._panelVisibilityByWorktree.forEach((_, r) => allResources.set(r, true));

		if (allResources.size === 0) {
			this._storageService.remove(WORKTREE_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const entries: IWorktreeLayoutEntry[] = [];
		allResources.forEach((_, resource) => {
			entries.push({
				worktreeResource: resource.toString(),
				editorWorkingSet: this._workingSets.get(resource),
				viewState: this._viewStateByWorktree.get(resource),
				panelVisible: this._panelVisibilityByWorktree.get(resource),
			});
		});
		this._storageService.store(WORKTREE_LAYOUT_STATE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
