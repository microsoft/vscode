/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializedNode, IViewSize } from '../../base/browser/ui/grid/grid.js';
import { Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { DockedAuxiliaryBarController } from './dockedAuxiliaryBarController.js';
import { SinglePaneMainEditorPart } from './parts/singlePaneEditorPart.js';
import { ISideBarResizeContext, Workbench } from './workbench.js';

interface IDockedSideBarResizeContext extends ISideBarResizeContext {
	readonly freedSideBarWidth: number;
	readonly editorSizeBeforeSideBarHide: IViewSize | undefined;
	readonly detailWidthBeforeSideBarHide: number | undefined;
}

/**
 * Remembers editor/detail widths captured around visibility and sidebar-collapse
 * transitions so the docked side pane restores the user's chosen sizes.
 */
export class DockedEditorSizeMemento {
	/** Editor node size captured when "Hide Editor" is used with the detail still visible. */
	dockedEditorSizeBeforeHide: IViewSize | undefined;
	/** Editor node size grown while the sidebar is collapsed (editor content visible). */
	editorSizeGrownForSidebarHide: IViewSize | undefined;
	/** Detail-panel width grown while the sidebar is collapsed (editor content hidden). */
	detailWidthGrownForSidebarHide: number | undefined;

	/** Drop the sidebar-collapse snapshots, e.g. once the node returns to the detail width. */
	clearSidebarGrowSnapshots(): void {
		this.editorSizeGrownForSidebarHide = undefined;
		this.detailWidthGrownForSidebarHide = undefined;
	}
}

/**
 * Single-pane workbench: the auxiliary bar is docked inside the editor part (below
 * a shared tab bar) rather than being its own grid column. The editor part
 * ({@link SinglePaneMainEditorPart}) owns the auxiliary bar and its docked
 * controller; this workbench owns the docked width, the reveal-sync, and the
 * docked size bookkeeping.
 */
export class SinglePaneWorkbench extends Workbench {

	/** Node width past the detail width at which editor content counts as visible. */
	private static readonly _EDITOR_CONTENT_VISIBLE_THRESHOLD = 4;

	private _dockedAuxiliaryBarWidth = DockedAuxiliaryBarController.DEFAULT_WIDTH;
	private _syncingEditorVisibility = false;
	private readonly _memento = new DockedEditorSizeMemento();

	override get isSinglePaneLayoutEnabled(): boolean {
		return true;
	}

	override getDockedAuxiliaryBarWidth(): number {
		return this._dockedAuxiliaryBarWidth;
	}

	override setDockedAuxiliaryBarWidth(width: number): void {
		this._dockedAuxiliaryBarWidth = width;
	}

	/** Re-layouts the docked auxiliary bar, which the editor part owns. */
	private _layoutDockedAuxBar(): void {
		(this.editorGroupService.mainPart as SinglePaneMainEditorPart).layoutDockedAuxiliaryBar();
	}

	protected override _applyLayoutContainerClass(): void {
		this.mainContainer.classList.toggle('dock-detail-panel', true);
	}

	protected override _auxiliaryBarLayoutWidth(): number {
		return this._dockedAuxiliaryBarWidth;
	}

	protected override _auxiliaryBarViewSize(): IViewSize {
		return { width: this._dockedAuxiliaryBarWidth, height: this._editorPartContainer?.clientHeight ?? 0 };
	}

	protected override _setAuxiliaryBarViewSize(size: IViewSize): void {
		this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, size.width);
		this._layoutDockedAuxBar();
	}

	protected override _resizeAuxiliaryBarBy(deltaWidth: number, _deltaHeight: number): void {
		this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, this._dockedAuxiliaryBarWidth + deltaWidth);
		this._layoutDockedAuxBar();
	}

	protected override _restoreAuxiliaryBarWidth(width: number): void {
		this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, width);
	}

	protected override _persistedEditorWidth(editorGridWidth: number | undefined): number | undefined {
		// The docked panel lives inside the editor grid node; exclude it to avoid reload drift.
		return typeof editorGridWidth === 'number'
			? Math.max(0, editorGridWidth - this._dockedAuxiliaryBarWidth)
			: editorGridWidth;
	}

	protected override _persistedAuxiliaryBarWidth(_gridWidth: number | undefined): number | undefined {
		return this._memento.detailWidthGrownForSidebarHide ?? this._dockedAuxiliaryBarWidth;
	}

	protected override _defaultSideBarSize(policySideBarSize: number): number {
		return Math.min(policySideBarSize, 280);
	}

	protected override _editorNodeSize(effectiveEditorWidth: number, effectiveAuxBarWidth: number): number {
		// The editor part spans the editor + auxiliary bar width (the aux bar is
		// docked inside it, not a grid column) so the editor tab bar spans the full width.
		return effectiveEditorWidth + effectiveAuxBarWidth;
	}

	protected override _editorNodeVisible(editorVisible: boolean, auxBarVisible: boolean): boolean {
		return editorVisible || auxBarVisible;
	}

	protected override _topRightSectionChildren(sessionsNode: ISerializedNode, editorNode: ISerializedNode, _auxiliaryBarNode: ISerializedNode): ISerializedNode[] {
		// The auxiliary bar is inside the editor part and omitted from the grid.
		return [sessionsNode, editorNode];
	}

	protected override _layoutSidePane(): void {
		this._layoutDockedAuxBar();
	}

	protected override _onGridDidChange(): void {
		this._syncEditorVisibility(this.workbenchGrid.getViewSize(this.editorPartView).width);
	}

	protected override _onEditorNodeResized(nodeWidth: number): void {
		this._syncEditorVisibility(nodeWidth);
	}

	private _syncEditorVisibility(nodeWidth: number): void {
		if (this._syncingEditorVisibility) {
			return;
		}
		// A session-switch / reload layout restore holds `suppressEditorPartAutoVisibility`
		// while it applies the working set, which can widen the docked node before the
		// controller has set the target editor-part visibility. The width-based sync must
		// not race that: revealing (or hiding) the editor here from the restored geometry
		// flickers the editor open for a Detail-only session (and can persist it on reload).
		// Only the user dragging the sash (unsuppressed) should drive width-based visibility.
		if (this._isEditorPartAutoVisibilitySuppressed) {
			return;
		}

		this._syncingEditorVisibility = true;
		try {
			const editorContentVisible = nodeWidth > this._dockedAuxiliaryBarWidth + SinglePaneWorkbench._EDITOR_CONTENT_VISIBLE_THRESHOLD;

			// Reveal: if editor content is hidden and the node is wide enough
			if (!this.partVisibility.editor && editorContentVisible) {
				this.partVisibility.editor = true;
				this._setMainEditorAreaHidden(false);
				this._memento.dockedEditorSizeBeforeHide = undefined;
				this._layoutDockedAuxBar();
				this._fireDidChangePartVisibility(Parts.EDITOR_PART, true);
				this._savePartVisibility();
			}

			// Hide: if editor content is visible and the node is squeezed down to the detail width.
			// Only hide when the detail is visible, so we don't hide when both parts are closed.
			if (this.partVisibility.editor && !editorContentVisible && this.partVisibility.auxiliaryBar) {
				this.partVisibility.editor = false;
				this._setMainEditorAreaHidden(true);
				this._editorRevealedExplicitly = false;
				this._memento.clearSidebarGrowSnapshots();
				this._layoutDockedAuxBar();
				this._fireDidChangePartVisibility(Parts.EDITOR_PART, false);
				this._savePartVisibility();
			}
		} finally {
			this._syncingEditorVisibility = false;
		}
	}

	protected override _runWithEditorResizeSyncSuspended(fn: () => void): void {
		this._syncingEditorVisibility = true;
		try {
			fn();
		} finally {
			this._syncingEditorVisibility = false;
		}
	}

	protected override _applyEditorVisibility(hidden: boolean): void {
		// Give the editor a comfortable even split when revealed without a user-chosen
		// width to restore. Hiding collapses the node to the detail width and the grid
		// caches it, so a later cross-session reveal would otherwise come back narrow.
		// A captured size in the memento always wins.
		const dockedEditorSizeBeforeHide = this._memento.dockedEditorSizeBeforeHide;
		const shouldRestoreDockedEditorSize = !hidden && !!dockedEditorSizeBeforeHide;
		const shouldApplyEvenSplit = !hidden && !shouldRestoreDockedEditorSize;

		const mainAreaWidthBeforeReveal = shouldApplyEvenSplit
			? this.workbenchGrid.getViewSize(this.sessionsPartView).width
			: 0;

		this.workbenchGrid.setViewVisible(this.editorPartView, this.partVisibility.editor || this.partVisibility.auxiliaryBar);

		if (hidden) {
			// Only "Hide Editor" (detail still visible) keeps the editor grid node
			// visible, so its width is a real user-chosen width to restore later.
			// Closing the whole side pane collapses the node to 0px, so reset instead.
			if (this.partVisibility.auxiliaryBar) {
				this._memento.dockedEditorSizeBeforeHide = this.workbenchGrid.getViewSize(this.editorPartView);
				this.workbenchGrid.resizeView(this.editorPartView, {
					width: this._dockedAuxiliaryBarWidth,
					height: this._memento.dockedEditorSizeBeforeHide.height
				});
				this._memento.clearSidebarGrowSnapshots();
			} else {
				this._memento.dockedEditorSizeBeforeHide = undefined;
				this._memento.clearSidebarGrowSnapshots();
			}
		} else if (dockedEditorSizeBeforeHide) {
			this.workbenchGrid.resizeView(this.editorPartView, dockedEditorSizeBeforeHide);
			this._memento.dockedEditorSizeBeforeHide = undefined;
		}

		if (shouldApplyEvenSplit) {
			this._hasAppliedInitialEditorSplit = true;
			this._applyEditorSplitSize(mainAreaWidthBeforeReveal);
		}

		this._layoutDockedAuxBar();
		this._fireDidChangePartVisibility(Parts.EDITOR_PART, !hidden);
		this._notifyContainerDidLayout();
	}

	protected override _onWillHideAuxiliaryBar(hidden: boolean): void {
		if (hidden && !this.partVisibility.editor && !this._isEditorPartAutoVisibilitySuppressed) {
			this.setEditorHidden(false, /* explicit */ true);
		}
	}

	/**
	 * No-op: the editor-part grid view hosts the docked auxiliary bar, so its
	 * visibility flips whenever the *detail* opens/closes (not the editor content).
	 * Editor-content visibility and its part-visibility events are driven directly
	 * by `setEditorHidden` / `_applyEditorVisibility` / `_applyAuxiliaryBarVisibility`
	 * / `_syncEditorVisibility`, so mapping the shared node's grid visibility to
	 * `setEditorHidden` here would wrongly reveal the editor when only the detail is
	 * shown.
	 */
	protected override _onEditorPartGridVisibilityChange(_visible: boolean): void { }

	protected override _applyAuxiliaryBarVisibility(hidden: boolean): void {
		// The auxiliary bar is docked inside the editor part (not a grid view), so
		// drive its visibility through the docked layout and fire the visibility
		// event the grid path would otherwise raise (the layout controller listens
		// for it to capture per-session state).
		if (this.workbenchGrid) {
			this.workbenchGrid.setViewVisible(
				this.editorPartView,
				this.partVisibility.editor || this.partVisibility.auxiliaryBar
			);
			if (!hidden && !this.partVisibility.editor) {
				this._syncingEditorVisibility = true;
				try {
					this.workbenchGrid.resizeView(this.editorPartView, {
						width: this._dockedAuxiliaryBarWidth,
						height: this.workbenchGrid.getViewSize(this.editorPartView).height
					});
				} finally {
					this._syncingEditorVisibility = false;
				}
			}
		}
		this._layoutDockedAuxBar();
		this._fireDidChangePartVisibility(Parts.AUXILIARYBAR_PART, !hidden);
		this._notifyContainerDidLayout();
	}

	protected override _shouldOpenAuxiliaryPaneComposite(containerId: string): boolean {
		// Never force-open a container that has no active views: doing so would leave
		// the detail panel rendered but blank while the toggle/context key reads "on".
		return this._isAuxViewContainerActive(containerId);
	}

	protected override _handleAllEditorsClosed(): void {
		if (!this.partVisibility.editor && !this.partVisibility.auxiliaryBar) {
			return;
		}
		if (this.partVisibility.editor) {
			this.rememberAttachedEditorMaximizedState();
		}
		const suppress = this.suppressEditorPartAutoVisibility();
		try {
			if (this.partVisibility.editor) {
				this.setEditorHidden(true);
			}
			if (this.partVisibility.auxiliaryBar) {
				this.setAuxiliaryBarHidden(true);
			}
		} finally {
			suppress.dispose();
		}
	}

	protected override _prepareSideBarResize(hidden: boolean): ISideBarResizeContext {
		const shouldResize = this.partVisibility.editor || this.partVisibility.auxiliaryBar;
		// Grow the editor node when the editor is visible, else the detail (keeps node == detail width so reveal-sync can't misfire).
		const growEditorNode = shouldResize && this.partVisibility.editor;
		const growDetailPanel = shouldResize && !this.partVisibility.editor;
		return {
			freedSideBarWidth: hidden && shouldResize ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0,
			editorSizeBeforeSideBarHide: hidden && growEditorNode ? this.workbenchGrid.getViewSize(this.editorPartView) : undefined,
			detailWidthBeforeSideBarHide: hidden && growDetailPanel ? this._dockedAuxiliaryBarWidth : undefined,
		} satisfies IDockedSideBarResizeContext;
	}

	protected override _applySideBarResize(hidden: boolean, context: ISideBarResizeContext): void {
		const { freedSideBarWidth, editorSizeBeforeSideBarHide, detailWidthBeforeSideBarHide } = context as IDockedSideBarResizeContext;

		if (editorSizeBeforeSideBarHide) {
			this._memento.editorSizeGrownForSidebarHide = editorSizeBeforeSideBarHide;
			this._resizeEditorAfterSidebarChange({
				width: editorSizeBeforeSideBarHide.width + freedSideBarWidth,
				height: editorSizeBeforeSideBarHide.height
			});
		} else if (detailWidthBeforeSideBarHide !== undefined) {
			this._memento.detailWidthGrownForSidebarHide = detailWidthBeforeSideBarHide;
			this._growDetailAfterSidebarChange(detailWidthBeforeSideBarHide + freedSideBarWidth);
		} else if (!hidden && this._memento.editorSizeGrownForSidebarHide) {
			this._resizeEditorAfterSidebarChange(this._memento.editorSizeGrownForSidebarHide);
			this._memento.editorSizeGrownForSidebarHide = undefined;
		} else if (!hidden && this._memento.detailWidthGrownForSidebarHide !== undefined) {
			this._growDetailAfterSidebarChange(this._memento.detailWidthGrownForSidebarHide);
			this._memento.detailWidthGrownForSidebarHide = undefined;
		} else if (!hidden) {
			this._memento.clearSidebarGrowSnapshots();
		}
	}

	private _resizeEditorAfterSidebarChange(size: IViewSize): void {
		this._syncingEditorVisibility = true;
		try {
			this.workbenchGrid.resizeView(this.editorPartView, size);
		} finally {
			this._syncingEditorVisibility = false;
		}
		this._layoutDockedAuxBar();
	}

	private _growDetailAfterSidebarChange(width: number): void {
		this._dockedAuxiliaryBarWidth = Math.max(DockedAuxiliaryBarController.MIN_WIDTH, width);
		this._syncingEditorVisibility = true;
		try {
			this.workbenchGrid.resizeView(this.editorPartView, {
				width: this._dockedAuxiliaryBarWidth,
				height: this.workbenchGrid.getViewSize(this.editorPartView).height
			});
		} finally {
			this._syncingEditorVisibility = false;
		}
		this._layoutDockedAuxBar();
	}
}
