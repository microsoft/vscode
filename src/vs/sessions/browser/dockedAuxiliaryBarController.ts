/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { ISashEvent, IHorizontalSashLayoutProvider, IVerticalSashLayoutProvider, Sash, SashState, Orientation as SashOrientation } from '../../base/browser/ui/sash/sash.js';
import { Part } from '../../workbench/browser/part.js';
import { SESSIONS_LIST_MINIMUM_WIDTH } from './parts/sidebarPart.js';
import { FloatingAuxiliaryBarController } from './floatingAuxiliaryBarController.js';
import { DetailsPosition } from '../../workbench/contrib/sessions/common/sessionConfig.js';

/** Geometry and visibility accessors for details inside the editor frame. */
export interface IDockedAuxiliaryBarHost {
	getPosition(): DetailsPosition;
	getWidth(): number;
	setWidth(width: number): void;
	getHeight(): number;
	setHeight(height: number): void;
	/** Whether the editor area (editor or docked aux bar) is visible. */
	isEditorAreaVisible(): boolean;
	/** Whether the editor part itself is visible, excluding the docked aux bar. */
	isEditorVisible(): boolean;
	/** Whether the docked auxiliary bar (detail panel) is visible. */
	isAuxiliaryBarVisible(): boolean;
	/** Hide the docked auxiliary bar via the workbench part-visibility API. */
	hideAuxiliaryBar(): void;
	setEditorContentInsets(right: number, top: number, bottom: number, left: number): void;
	/** Height of the editor tabs above the optional header. */
	getTabsHeight(): number;
	getEditorContentTop(): number;
}

/** Positions and resizes desktop details beside, above, or below editor content. */
export class DockedAuxiliaryBarController extends Disposable {

	static readonly MIN_WIDTH = 220;
	static readonly EDITOR_MIN_WIDTH = 300;
	static readonly EDITOR_PREFERRED_WIDTH = 1000;
	static readonly DEFAULT_WIDTH = 300;
	static readonly MIN_HEIGHT = 120;
	static readonly EDITOR_MIN_HEIGHT = 120;
	static readonly DEFAULT_HEIGHT = 240;
	static readonly COLLAPSE_WIDTH = 4;
	static readonly NO_EDITOR_MIN_WIDTH = SESSIONS_LIST_MINIMUM_WIDTH;

	private _docked = false;
	private _sash: Sash | undefined;
	private _horizontalSash: Sash | undefined;
	private _sashStartWidth = 0;
	private _sashStartHeight = 0;
	private _sashCollapsed = false;
	private _layoutState: { requestedWidth: number; editorWidth: number; auxiliaryBarWidth: number } | undefined;
	private _floatingController: FloatingAuxiliaryBarController | undefined;
	private _verticalLayoutState: { height: number; sashTop: number } | undefined;
	private _pinFloatingOnReveal = false;

	constructor(
		private readonly editorPartContainer: HTMLElement,
		private readonly auxiliaryBarPart: Part,
		private readonly host: IDockedAuxiliaryBarHost,
		private readonly floating?: { isEnabled(): boolean; createController(): FloatingAuxiliaryBarController },
	) {
		super();
	}

	/** Lays out details within the editor frame without changing the workbench grid. */
	layout(): void {
		const auxiliaryBarContainer = this.auxiliaryBarPart.getContainer();
		if (!auxiliaryBarContainer) {
			return;
		}

		if (!this._docked) {
			this.editorPartContainer.appendChild(auxiliaryBarContainer);
			auxiliaryBarContainer.classList.add('docked-auxiliarybar');
			this._docked = true;
		}
		if (!this.floating?.isEnabled()) {
			this._pinFloatingOnReveal = false;
		}

		if (this.floating?.isEnabled() && this.host.isEditorAreaVisible() && this.host.isEditorVisible() && this.host.isAuxiliaryBarVisible()) {
			this._layoutState = undefined;
			this.host.setEditorContentInsets(0, 0, 0, 0);
			this._disableSashes();
			auxiliaryBarContainer.classList.remove('docked-auxiliarybar-left', 'docked-auxiliarybar-top', 'docked-auxiliarybar-bottom');
			this._floatingController ??= this._register(this.floating.createController());
			if (this._pinFloatingOnReveal) {
				this._floatingController.setPinned(true);
				this._pinFloatingOnReveal = false;
			}
			this._floatingController.layout(this.host.getEditorContentTop());
			return;
		}
		this._floatingController?.hide();

		if (!this.host.isEditorAreaVisible() || !this.host.isAuxiliaryBarVisible()) {
			this._layoutState = undefined;
			auxiliaryBarContainer.style.display = 'none';
			this.host.setEditorContentInsets(0, 0, 0, 0);
			this._disableSashes();
			return;
		}

		const position = this.host.getPosition();
		auxiliaryBarContainer.classList.toggle('docked-auxiliarybar-left', position === 'left');
		auxiliaryBarContainer.classList.toggle('docked-auxiliarybar-top', position === 'top');
		auxiliaryBarContainer.classList.toggle('docked-auxiliarybar-bottom', position === 'bottom');
		if (position === 'top' || position === 'bottom') {
			this._layoutVertical(auxiliaryBarContainer, position);
			return;
		}
		this._verticalLayoutState = undefined;
		if (this._horizontalSash) {
			this._horizontalSash.state = SashState.Disabled;
		}

		const editorRect = this.editorPartContainer.getBoundingClientRect();
		const editorContentHidden = !this.host.isEditorVisible();
		const auxWidth = editorContentHidden ? editorRect.width : this._getLayoutWidth(this.host.getWidth(), editorRect.width);
		if (editorContentHidden) {
			this._layoutState = undefined;
		}
		const top = this._getTop();
		const height = Math.max(0, editorRect.height - top);

		auxiliaryBarContainer.style.display = '';
		auxiliaryBarContainer.style.position = 'absolute';
		auxiliaryBarContainer.style.left = position === 'left' ? '0' : '';
		auxiliaryBarContainer.style.right = position === 'right' ? '0' : '';
		auxiliaryBarContainer.style.top = `${top}px`;
		auxiliaryBarContainer.style.width = `${auxWidth}px`;
		auxiliaryBarContainer.style.height = `${height}px`;

		this.host.setEditorContentInsets(position === 'right' ? auxWidth : 0, 0, 0, position === 'left' ? auxWidth : 0);
		this.auxiliaryBarPart.layout(auxWidth, height, top, position === 'left' ? 0 : editorRect.width - auxWidth);

		this._ensureSash();
		// The real grid sash owns resizing/collapsing when editor content is hidden.
		this._sash!.state = editorContentHidden ? SashState.Disabled : SashState.Enabled;
		this._sash!.layout();
	}

	revealFloatingDetails(): void {
		if (this.floating?.isEnabled() && this.host.isEditorVisible()) {
			if (this._floatingController) {
				this._floatingController.setPinned(true);
			} else {
				this._pinFloatingOnReveal = true;
			}
		}
	}

	get floatingDetails(): FloatingAuxiliaryBarController | undefined {
		return this.floating?.isEnabled() && this.host.isEditorAreaVisible() && this.host.isEditorVisible() && this.host.isAuxiliaryBarVisible()
			? this._floatingController : undefined;
	}

	onDidOpenItem(): void {
		if (this.floating?.isEnabled()) {
			this._floatingController?.onDidOpenItem();
		}
	}

	private _layoutVertical(container: HTMLElement, position: 'top' | 'bottom'): void {
		this._layoutState = undefined;
		const width = this.editorPartContainer.clientWidth;
		const frameHeight = this.editorPartContainer.clientHeight;
		const editorVisible = this.host.isEditorVisible();
		const contentTop = editorVisible ? this.host.getEditorContentTop() : this._getTop();
		const availableHeight = Math.max(0, frameHeight - contentTop);
		const height = editorVisible ? DockedAuxiliaryBarController.getEffectiveHeight(this.host.getHeight(), availableHeight) : availableHeight;
		const top = position === 'top' ? contentTop : frameHeight - height;
		this._verticalLayoutState = { height, sashTop: position === 'top' ? top + height : top };
		container.style.display = '';
		container.style.position = 'absolute';
		container.style.left = '';
		container.style.right = '0';
		container.style.top = `${top}px`;
		container.style.width = `${width}px`;
		this.host.setEditorContentInsets(0, editorVisible && position === 'top' ? height : 0, editorVisible && position === 'bottom' ? height : 0, 0);
		this.auxiliaryBarPart.layout(width, Math.max(0, height - 1), top, 0);
		// Pane-composite layout clears the height; restore the allocated box including its separator.
		container.style.height = `${height}px`;
		if (this._sash) {
			this._sash.state = SashState.Disabled;
		}
		this._ensureHorizontalSash();
		this._horizontalSash!.state = editorVisible ? SashState.Enabled : SashState.Disabled;
		this._horizontalSash!.layout();
	}

	static getEffectiveHeight(requestedHeight: number, availableHeight: number): number {
		return Math.min(availableHeight, Math.max(DockedAuxiliaryBarController.MIN_HEIGHT,
			Math.min(requestedHeight, availableHeight - DockedAuxiliaryBarController.EDITOR_MIN_HEIGHT)));
	}

	private _disableSashes(): void {
		if (this._sash) {
			this._sash.state = SashState.Disabled;
		}
		if (this._horizontalSash) {
			this._horizontalSash.state = SashState.Disabled;
		}
	}

	private _ensureHorizontalSash(): void {
		if (this._horizontalSash) {
			return;
		}
		const provider: IHorizontalSashLayoutProvider = {
			getHorizontalSashTop: () => this._verticalLayoutState?.sashTop ?? 0,
			getHorizontalSashLeft: () => 0,
			getHorizontalSashWidth: () => this.editorPartContainer.clientWidth,
		};
		const sash = this._horizontalSash = this._register(new Sash(this.editorPartContainer, provider, { orientation: SashOrientation.HORIZONTAL }));
		this._register(sash.onDidStart(() => {
			this._sashStartHeight = this._verticalLayoutState?.height ?? this.host.getHeight();
			this._sashCollapsed = false;
		}));
		this._register(sash.onDidChange(event => {
			if (this._sashCollapsed) {
				return;
			}
			const delta = this.host.getPosition() === 'top' ? event.currentY - event.startY : event.startY - event.currentY;
			const requestedHeight = this._sashStartHeight + delta;
			if (requestedHeight < DockedAuxiliaryBarController.COLLAPSE_WIDTH) {
				this._sashCollapsed = true;
				this.host.hideAuxiliaryBar();
				return;
			}
			const availableHeight = Math.max(0, this.editorPartContainer.clientHeight - this.host.getEditorContentTop());
			this.host.setHeight(DockedAuxiliaryBarController.getEffectiveHeight(requestedHeight, availableHeight));
			this.layout();
		}));
		this._register(sash.onDidReset(() => {
			this.host.setHeight(DockedAuxiliaryBarController.DEFAULT_HEIGHT);
			this.layout();
		}));
	}

	/** Returns the detail width that fits beside the editor content. */
	static getEffectiveWidth(hostWidth: number, editorWidth: number): number {
		const maxWidth = editorWidth - DockedAuxiliaryBarController.EDITOR_MIN_WIDTH;
		return Math.min(editorWidth, Math.max(DockedAuxiliaryBarController.MIN_WIDTH, Math.min(hostWidth, maxWidth)));
	}

	private _getLayoutWidth(requestedWidth: number, editorWidth: number): number {
		const constrainedWidth = DockedAuxiliaryBarController.getEffectiveWidth(requestedWidth, editorWidth);
		const previous = this._layoutState;
		let auxiliaryBarWidth = constrainedWidth;

		if (previous?.requestedWidth === requestedWidth) {
			if (editorWidth > previous.editorWidth) {
				const editorGrowth = editorWidth - previous.editorWidth;
				const previousEditorContentWidth = previous.editorWidth - previous.auxiliaryBarWidth;
				const editorGrowthBeforeAuxiliaryBar = Math.max(0, DockedAuxiliaryBarController.EDITOR_PREFERRED_WIDTH - previousEditorContentWidth);
				auxiliaryBarWidth = Math.min(constrainedWidth, previous.auxiliaryBarWidth + Math.max(0, editorGrowth - editorGrowthBeforeAuxiliaryBar));
			} else {
				auxiliaryBarWidth = Math.min(previous.auxiliaryBarWidth, constrainedWidth);
			}

			auxiliaryBarWidth = Math.max(Math.min(editorWidth, DockedAuxiliaryBarController.MIN_WIDTH), auxiliaryBarWidth);
		}

		this._layoutState = { requestedWidth, editorWidth, auxiliaryBarWidth };
		return auxiliaryBarWidth;
	}

	private _ensureSash(): void {
		if (this._sash) {
			return;
		}

		const editorPartContainer = this.editorPartContainer;
		const layoutProvider: IVerticalSashLayoutProvider = {
			getVerticalSashLeft: () => {
				const width = editorPartContainer.clientWidth;
				const auxWidth = this.host.isEditorVisible()
					? this._layoutState?.auxiliaryBarWidth ?? DockedAuxiliaryBarController.getEffectiveWidth(this.host.getWidth(), width)
					: width;
				return this.host.getPosition() === 'left' ? auxWidth : Math.max(0, width - auxWidth);
			},
			getVerticalSashTop: () => this._getTop(),
			getVerticalSashHeight: () => Math.max(0, editorPartContainer.clientHeight - this._getTop()),
		};

		const sash = this._register(new Sash(editorPartContainer, layoutProvider, { orientation: SashOrientation.VERTICAL }));
		this._sash = sash;

		this._register(sash.onDidStart(() => {
			this._sashStartWidth = this._layoutState?.auxiliaryBarWidth ?? this.host.getWidth();
			this._sashCollapsed = false;
		}));
		this._register(sash.onDidChange((e: ISashEvent) => {
			if (this._sashCollapsed) {
				return;
			}
			const delta = this.host.getPosition() === 'left' ? e.currentX - e.startX : e.startX - e.currentX;
			const width = editorPartContainer.clientWidth;
			const requestedWidth = this._sashStartWidth + delta;
			if (requestedWidth < DockedAuxiliaryBarController.COLLAPSE_WIDTH) {
				this._sashCollapsed = true;
				this.host.hideAuxiliaryBar();
				return;
			}
			this.host.setWidth(DockedAuxiliaryBarController.getEffectiveWidth(requestedWidth, width));
			this.layout();
		}));
		this._register(sash.onDidReset(() => {
			this.host.setWidth(DockedAuxiliaryBarController.DEFAULT_WIDTH);
			this.layout();
		}));
	}

	private _getTop(): number {
		return this.host.getTabsHeight();
	}
}
