/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { ISashEvent, IVerticalSashLayoutProvider, Sash, SashState, Orientation as SashOrientation } from '../../base/browser/ui/sash/sash.js';
import { Part } from '../../workbench/browser/part.js';

/** Accessors the controller uses to read/write the docked panel width and query visibility. */
export interface IDockedAuxiliaryBarHost {
	getWidth(): number;
	setWidth(width: number): void;
	/** Whether the editor area (editor or docked aux bar) is visible. */
	isEditorAreaVisible(): boolean;
	/** Whether the editor part itself is visible, excluding the docked aux bar. */
	isEditorVisible(): boolean;
	/** Whether the docked auxiliary bar (detail panel) is visible. */
	isAuxiliaryBarVisible(): boolean;
	/** Hide the docked auxiliary bar via the workbench part-visibility API. */
	hideAuxiliaryBar(): void;
	/**
	 * Reserves an inset (px) on the right of the editor content while the editor
	 * tab bar keeps the full width, so the docked panel can sit beside it. `0`
	 * restores full-width content.
	 */
	setEditorContentRightInset(px: number): void;
	/** Extra top offset (px) below the tab bar, e.g. reserved by the full-width header. */
	getHeaderHeight(): number;
}

/**
 * Owns the single-pane "docked detail panel" behaviour: reparenting the auxiliary
 * bar into the editor part as an absolutely-positioned overlay on the right (below
 * the editor tab strip), sizing it, insetting the editor content, and the draggable
 * resize sash. Created by the workbench only in single-pane mode; the standard
 * layout never constructs it.
 */
export class DockedAuxiliaryBarController extends Disposable {

	static readonly TOP = 34;
	/** Thickness (px) of the header/tab-bar bottom divider the aux bar starts below. */
	static readonly DIVIDER = 1;
	static readonly MIN_WIDTH = 220;
	static readonly EDITOR_MIN_WIDTH = 300;
	static readonly DEFAULT_WIDTH = 300;
	static readonly COLLAPSE_WIDTH = 4;

	private _docked = false;
	private _sash: Sash | undefined;
	private _sashStartWidth = 0;
	private _sashCollapsed = false;

	constructor(
		private readonly editorPartContainer: HTMLElement,
		private readonly auxiliaryBarPart: Part,
		private readonly host: IDockedAuxiliaryBarHost,
	) {
		super();
	}

	/**
	 * Position the auxiliary bar inside the editor part's right region so the editor
	 * tab bar spans the full width across the editor content and the detail panel.
	 */
	layout(): void {
		const auxiliaryBarContainer = this.auxiliaryBarPart.getContainer();
		if (!auxiliaryBarContainer) {
			return;
		}

		// Reparent the auxiliary bar into the editor part once, as an absolutely
		// positioned overlay on the right that moves with the editor part.
		if (!this._docked) {
			this.editorPartContainer.appendChild(auxiliaryBarContainer);
			auxiliaryBarContainer.classList.add('docked-auxiliarybar');
			this._docked = true;
		}

		if (!this.host.isEditorAreaVisible() || !this.host.isAuxiliaryBarVisible()) {
			auxiliaryBarContainer.style.display = 'none';
			this.host.setEditorContentRightInset(0);
			if (this._sash) {
				this._sash.state = SashState.Disabled;
			}
			return;
		}

		const editorRect = this.editorPartContainer.getBoundingClientRect();
		const editorContentHidden = !this.host.isEditorVisible();
		const auxWidth = editorContentHidden ? editorRect.width : this._auxiliaryBarWidth(this.host.getWidth(), editorRect.width);
		const top = DockedAuxiliaryBarController.TOP + DockedAuxiliaryBarController.DIVIDER + this.host.getHeaderHeight();
		const height = Math.max(0, editorRect.height - top);

		auxiliaryBarContainer.style.display = '';
		auxiliaryBarContainer.style.position = 'absolute';
		auxiliaryBarContainer.style.right = '0';
		auxiliaryBarContainer.style.top = `${top}px`;
		auxiliaryBarContainer.style.width = `${auxWidth}px`;
		auxiliaryBarContainer.style.height = `${height}px`;

		this.host.setEditorContentRightInset(auxWidth);
		this.auxiliaryBarPart.layout(auxWidth, height, top, editorRect.width - auxWidth);

		this._ensureSash();
		this._sash!.state = SashState.Enabled;
		this._sash!.layout();
	}

	private _auxiliaryBarWidth(hostWidth: number, editorWidth: number): number {
		const maxWidth = editorWidth - DockedAuxiliaryBarController.EDITOR_MIN_WIDTH;
		// When the editor is too narrow, the detail panel yields instead of enforcing its minimum.
		if (maxWidth < DockedAuxiliaryBarController.MIN_WIDTH) {
			return Math.max(0, maxWidth);
		}

		return Math.max(DockedAuxiliaryBarController.MIN_WIDTH, Math.min(hostWidth, maxWidth));
	}

	private _ensureSash(): void {
		if (this._sash) {
			return;
		}

		const editorPartContainer = this.editorPartContainer;
		const layoutProvider: IVerticalSashLayoutProvider = {
			getVerticalSashLeft: () => {
				const width = editorPartContainer.clientWidth;
				const auxWidth = this.host.isEditorVisible() ? this._auxiliaryBarWidth(this.host.getWidth(), width) : width;
				return Math.max(0, width - auxWidth);
			},
			getVerticalSashTop: () => DockedAuxiliaryBarController.TOP + DockedAuxiliaryBarController.DIVIDER + this.host.getHeaderHeight(),
			getVerticalSashHeight: () => Math.max(0, editorPartContainer.clientHeight - DockedAuxiliaryBarController.TOP - DockedAuxiliaryBarController.DIVIDER - this.host.getHeaderHeight()),
		};

		const sash = this._register(new Sash(editorPartContainer, layoutProvider, { orientation: SashOrientation.VERTICAL }));
		this._sash = sash;

		this._register(sash.onDidStart(() => {
			this._sashStartWidth = this.host.getWidth();
			this._sashCollapsed = false;
		}));
		this._register(sash.onDidChange((e: ISashEvent) => {
			if (this._sashCollapsed) {
				return;
			}
			// Dragging left (currentX < startX) widens the detail panel.
			const delta = e.startX - e.currentX;
			const width = editorPartContainer.clientWidth;
			const requestedWidth = this._sashStartWidth + delta;
			const collapseWidth = this.host.isEditorVisible()
				? DockedAuxiliaryBarController.COLLAPSE_WIDTH
				: DockedAuxiliaryBarController.MIN_WIDTH;
			if (requestedWidth < collapseWidth) {
				this._sashCollapsed = true;
				this.host.hideAuxiliaryBar();
				return;
			}
			this.host.setWidth(this._auxiliaryBarWidth(requestedWidth, width));
			this.layout();
		}));
		this._register(sash.onDidReset(() => {
			this.host.setWidth(DockedAuxiliaryBarController.DEFAULT_WIDTH);
			this.layout();
		}));
	}
}
