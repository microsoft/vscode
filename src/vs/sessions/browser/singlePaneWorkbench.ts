/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializableView, ISerializedNode, IViewSize } from '../../base/browser/ui/grid/grid.js';
import { alert } from '../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../base/browser/window.js';
import { Emitter, Event } from '../../base/common/event.js';
import { localize } from '../../nls.js';
import { IEditorWillOpenEvent } from '../../workbench/common/editor.js';
import { Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { DockedEditorInput } from '../common/dockedEditorInput.js';
import { DockedAuxiliaryBarController } from './dockedAuxiliaryBarController.js';
import { SinglePaneMainEditorPart } from './parts/singlePaneEditorPart.js';
import { EDITOR_PART_MINIMUM_WIDTH, SIDE_PANE_WIDTH_RATIO } from './parts/editorPartSizing.js';
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
	private static readonly _DETAIL_AUTO_SHOW_MARGIN = 100;

	private _dockedAuxiliaryBarWidth = DockedAuxiliaryBarController.DEFAULT_WIDTH;
	private _syncingEditorVisibility = false;
	private _detailHiddenForEditorResize = false;
	private readonly _memento = new DockedEditorSizeMemento();

	private readonly _onDidRevealSidePane = this._register(new Emitter<void>());
	override readonly onDidRevealSidePane: Event<void> = this._onDidRevealSidePane.event;

	override get isSinglePaneLayoutEnabled(): boolean {
		return true;
	}

	override isEditorPaneVisible(): boolean {
		return this.workbenchGrid
			? this.workbenchGrid.isViewVisible(this.editorPartView)
			: super.isEditorPaneVisible();
	}

	override toggleSecondarySideBar(): void {
		this.toggleEditorPane();
	}

	toggleEditorPane(): void {
		const visible = !this.isVisible(Parts.EDITOR_PART, mainWindow);
		this.setEditorHidden(!visible, /* explicit */ true);
		alert(visible
			? localize('editorPaneVisible', "Editor pane shown")
			: localize('editorPaneHidden', "Editor pane hidden"));
	}

	protected override _onSidePaneRevealed(): void {
		this._onDidRevealSidePane.fire();
	}

	/**
	 * A docked-detail editor (Changes/Files) renders its content in the docked
	 * detail panel. While that panel is open and the editor area is closed,
	 * re-activating such an editor (closing a neighbouring tab, or clicking the
	 * tab) must not reveal the editor area. When the detail panel is closed the
	 * base reveal still runs so the content becomes visible.
	 */
	protected override revealEditorOnOpen(e: IEditorWillOpenEvent): void {
		if (e.editor instanceof DockedEditorInput && this.partVisibility.auxiliaryBar && !this.partVisibility.editor) {
			return;
		}
		super.revealEditorOnOpen(e);
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
		if (typeof editorGridWidth !== 'number') {
			return editorGridWidth;
		}
		// The docked detail panel lives inside the editor grid node only while the
		// detail (auxiliary bar) is visible. Subtract it only in that case so the
		// persisted value is the pure editor-content width — mirroring the grid
		// descriptor, which adds the detail width back only when the detail is
		// visible. Subtracting it unconditionally would shrink an Editor-only
		// session's side pane by the detail width on every reload (compounding).
		const dockedDetailWidth = this.partVisibility.auxiliaryBar ? this._dockedAuxiliaryBarWidth : 0;
		return Math.max(0, editorGridWidth - dockedDetailWidth);
	}

	protected override _persistedGridViewSize(view: ISerializableView, dimension: 'width' | 'height', visible: boolean): number | undefined {
		// The docked auxiliary bar is not a grid view (it lives inside the editor
		// node), so its width comes from the docked layout state, not the grid.
		if (view === this.auxiliaryBarPartView) {
			return this._memento.detailWidthGrownForSidebarHide ?? this._dockedAuxiliaryBarWidth;
		}
		return super._persistedGridViewSize(view, dimension, visible);
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

	protected override _fireDidChangePartVisibility(partId: Parts, visible: boolean, source?: 'resize'): void {
		if (partId === Parts.AUXILIARYBAR_PART && source !== 'resize') {
			this._detailHiddenForEditorResize = false;
		}
		super._fireDidChangePartVisibility(partId, visible, source);
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
			const detailFitsBesideEditor = nodeWidth >= this._dockedAuxiliaryBarWidth + EDITOR_PART_MINIMUM_WIDTH;
			if (this.partVisibility.editor && this.partVisibility.auxiliaryBar && !detailFitsBesideEditor) {
				this._detailHiddenForEditorResize = true;
				this.setAuxiliaryBarHiddenForResize(true);
				return;
			}

			const detailShowThreshold = this._dockedAuxiliaryBarWidth + EDITOR_PART_MINIMUM_WIDTH + SinglePaneWorkbench._DETAIL_AUTO_SHOW_MARGIN;
			if (this.partVisibility.editor && !this.partVisibility.auxiliaryBar && this._detailHiddenForEditorResize && nodeWidth >= detailShowThreshold) {
				this.setAuxiliaryBarHiddenForResize(false);
				this._detailHiddenForEditorResize = false;
				return;
			}

			const editorContentVisible = nodeWidth > this._dockedAuxiliaryBarWidth + SinglePaneWorkbench._EDITOR_CONTENT_VISIBLE_THRESHOLD;

			// Hide: editor content is visible and the node is squeezed down to the detail
			// width. Only hide when the detail is visible, so we don't hide when both parts
			// are closed.
			if (this.partVisibility.editor && !editorContentVisible && this.partVisibility.auxiliaryBar) {
				this.partVisibility.editor = false;
				this._setMainEditorAreaHidden(true);
				this._editorRevealedExplicitly = false;
				this._memento.clearSidebarGrowSnapshots();
				this._layoutDockedAuxBar();
				this._fireDidChangePartVisibility(Parts.EDITOR_PART, false);
				this._savePartVisibility();
				return;
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
		// Part sizes are workbench-global, so hiding the side pane must not discard the
		// user's chosen editor width. Capture the current editor content width before the
		// grid collapses the node, so revealing later — e.g. switching back from a session
		// that closed the pane — restores it instead of resetting to the default split.
		if (hidden) {
			const contentWidth = this._persistedEditorWidth(this.workbenchGrid.getViewSize(this.editorPartView).width);
			if (contentWidth !== undefined && contentWidth >= EDITOR_PART_MINIMUM_WIDTH) {
				this._savedPartSizes = { ...this._savedPartSizes, editor: contentWidth };
			}
		}

		// When revealing without a captured "Hide Editor" size to restore, prefer the
		// remembered global editor width and only fall back to the 60%-of-window split
		// when there is no known good width (a genuine first open).
		const dockedEditorSizeBeforeHide = this._memento.dockedEditorSizeBeforeHide;
		const savedEditorWidth = this._savedPartSizes.editor;
		const canRestoreSavedWidth = savedEditorWidth !== undefined && savedEditorWidth >= EDITOR_PART_MINIMUM_WIDTH;
		const shouldRestoreDockedEditorSize = !hidden && !!dockedEditorSizeBeforeHide;
		const shouldRestoreSavedWidth = !hidden && !shouldRestoreDockedEditorSize && canRestoreSavedWidth;
		const shouldApplyEvenSplit = !hidden && !shouldRestoreDockedEditorSize && !shouldRestoreSavedWidth;

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
		} else if (shouldRestoreSavedWidth) {
			const height = this.workbenchGrid.getViewSize(this.editorPartView).height;
			const detailWidth = this.partVisibility.auxiliaryBar ? this._dockedAuxiliaryBarWidth : 0;
			this.workbenchGrid.resizeView(this.editorPartView, { width: savedEditorWidth + detailWidth, height });
		}

		if (shouldApplyEvenSplit) {
			this._hasAppliedInitialEditorSplit = true;
			this._applyEditorSplitSize(this.workbenchGrid.width);
		}

		this._layoutDockedAuxBar();
		this._fireDidChangePartVisibility(Parts.EDITOR_PART, !hidden);
		this._notifyContainerDidLayout();
	}

	protected override _applyEditorSplitSize(_mainAreaWidth: number): void {
		// The single-pane side pane opens to a fixed fraction of the full window width
		// (not an even split of the main area), so it always reveals at a comfortable size.
		const targetEditorWidth = Math.max(EDITOR_PART_MINIMUM_WIDTH, Math.floor(this.workbenchGrid.width * SIDE_PANE_WIDTH_RATIO));
		const currentEditorSize = this.workbenchGrid.getViewSize(this.editorPartView);
		this.workbenchGrid.resizeView(this.editorPartView, {
			width: targetEditorWidth,
			height: currentEditorSize.height
		});
	}

	protected override _onWillHideAuxiliaryBar(hidden: boolean): void {
		if (hidden && !this.partVisibility.editor && !this._isEditorPartAutoVisibilitySuppressed) {
			this.setEditorHidden(false, /* explicit */ true);
		}
	}

	/**
	 * No-op unless detail-only (editor content hidden): there the shared node is a
	 * snap view, so sash-drag collapse/reveal maps onto hiding/showing the auxiliary bar.
	 */
	protected override _onEditorPartGridVisibilityChange(visible: boolean): void {
		if (this.partVisibility.editor) {
			return;
		}
		if (!visible) {
			const suppression = this.suppressEditorPartAutoVisibility();
			try {
				this.setAuxiliaryBarHiddenForResize(true);
			} finally {
				suppression.dispose();
			}
			return;
		}
		this.setAuxiliaryBarHiddenForResize(false);
	}

	protected override _applyAuxiliaryBarVisibility(hidden: boolean, source?: 'resize'): void {
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
		this._fireDidChangePartVisibility(Parts.AUXILIARYBAR_PART, !hidden, source);
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
