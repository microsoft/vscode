/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MultipleSizePersistingOptions, ResizableContentWidget, ResizableWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import * as dom from 'vs/base/browser/dom';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ContentHoverVisibleData, computeDistanceFromPointToRectangle } from 'vs/editor/contrib/hover/browser/contentHover';
import { PositionAffinity } from 'vs/editor/common/model';

const SCROLLBAR_WIDTH = 10;

// TODO: maybe don't need the resizable widget class
export class ResizableHoverWidget extends ResizableWidget {

	public ID = 'editor.contrib.resizableContentHoverWidget';
	private hoverDisposables = new DisposableStore();
	// The ContentWidget is a child of the resizable widget
	private resizableContentWidget: ResizableContentHoverWidget;

	public readonly allowEditorOverflow = true;
	public readonly _hover: HoverWidget = this.hoverDisposables.add(new HoverWidget());
	private readonly editor: ICodeEditor;
	private readonly _hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly _hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly _focusTracker = this.hoverDisposables.add(dom.trackFocus(this.getDomNode()));
	private readonly _horizontalScrollingBy: number = 30;
	private _visibleData: ContentHoverVisibleData | null = null;
	private _renderingAbove: ContentWidgetPositionPreference;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super(editor, new MultipleSizePersistingOptions());

		this.editor = editor;
		// create here the dom node and all other logic should go here that was in the super abstract class
		this.resizableContentWidget = new ResizableContentHoverWidget(this, editor);
		this._renderingAbove = this.editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

		this.hoverDisposables.add(this.element.onDidResize((e) => {
			// When the resizable hover overlay changes, resize the widget
			// this._widget.resize(e.dimension);
		}));

		this.hoverDisposables.add(this.editor.onDidLayoutChange(() => this._layout()));
		this.hoverDisposables.add(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		this._setVisibleData(null);
		this._layout();

		this.hoverDisposables.add(this._focusTracker.onDidFocus(() => {
			this._hoverFocusedKey.set(true);
		}));
		this.hoverDisposables.add(this._focusTracker.onDidBlur(() => {
			this._hoverFocusedKey.set(false);
		}));

		dom.append(this.element.domNode, this._hover.containerDomNode);
	}


	// -- decide what should be in the resizable content widget and what should be in the disposable hover widget


	public get position(): Position | null {
		return this._visibleData?.showAtPosition ?? null;
	}

	public get isColorPickerVisible(): boolean {
		return Boolean(this._visibleData?.colorPicker);
	}

	public get isVisibleFromKeyboard(): boolean {
		return (this._visibleData?.source === HoverStartSource.Keyboard);
	}

	public get isVisible(): boolean {
		return this._hoverVisibleKey.get() ?? false;
	}

	public get renderingAbove(): ContentWidgetPositionPreference {
		return this._renderingAbove;
	}

	public set renderingAbove(renderingAbove: ContentWidgetPositionPreference) {
		this._renderingAbove = renderingAbove;
	}

	// NEW
	public override resize(size: dom.Dimension) {
		// Removing the max height and max width here - the max size is controlled by the resizable overlay
		this._hover.contentsDomNode.style.maxHeight = 'none';
		this._hover.contentsDomNode.style.maxWidth = 'none';

		const width = size.width + 'px';
		// const width = size.width - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH + 'px';
		this._hover.containerDomNode.style.width = width;
		this._hover.contentsDomNode.style.width = width;
		// const height = size.height - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH + 'px';
		const height = size.height + 'px';
		this._hover.containerDomNode.style.height = height;
		this._hover.contentsDomNode.style.height = height;

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// When there is a horizontal scroll-bar use a different height to make the scroll-bar visible
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			this._hover.contentsDomNode.style.height = size.height - SCROLLBAR_WIDTH + 'px'; // - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH
		}

		this._hover.scrollbar.scanDomNode();
		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.editor.render();
	}

	// NEW
	public override findMaximumRenderingHeight(): number | undefined { // rendering: ContentWidgetPositionPreference

		if (!this.editor || !this.editor.hasModel() || !this._visibleData?.showAtPosition) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		const mouseBox = this.editor.getScrolledVisiblePosition(this._visibleData.showAtPosition);
		const bodyBox = dom.getClientArea(document.body);
		let availableSpace: number;

		if (this._renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			availableSpace = editorBox.top + mouseBox.top - 30;
		} else {
			const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
			availableSpace = bodyBox.height - mouseBottom;
		}

		let divMaxHeight = 0;
		for (const childHtmlElement of this._hover.contentsDomNode.children) {
			divMaxHeight += childHtmlElement.clientHeight;
		}

		if (this._hover.contentsDomNode.clientWidth < this._hover.contentsDomNode.scrollWidth) {
			divMaxHeight += SCROLLBAR_WIDTH;
		}

		return Math.min(availableSpace, divMaxHeight);
	}

	// NEW
	public findMaxRenderingWidth(): number | undefined {
		if (!this.editor || !this.editor.hasModel()) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		const widthOfEditor = editorBox.width;
		const leftOfEditor = editorBox.left;
		const glyphMarginWidth = this.editor.getLayoutInfo().glyphMarginWidth;
		const leftOfContainer = this._hover.containerDomNode.offsetLeft;
		return widthOfEditor + leftOfEditor - leftOfContainer - glyphMarginWidth;
	}

	public override dispose(): void {
		this.editor.removeContentWidget(this.resizableContentWidget);
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		super.dispose();
	}

	public getDomNode() {
		return this._hover.containerDomNode;
	}

	public getContentDomNode() {
		return this._hover.contentsDomNode;
	}

	public isMouseGettingCloser(posx: number, posy: number): boolean {
		if (!this._visibleData) {
			return false;
		}
		if (typeof this._visibleData.initialMousePosX === 'undefined' || typeof this._visibleData.initialMousePosY === 'undefined') {
			this._visibleData.initialMousePosX = posx;
			this._visibleData.initialMousePosY = posy;
			return false;
		}

		const widgetRect = dom.getDomNodePagePosition(this.resizableContentWidget.getDomNode());
		if (typeof this._visibleData.closestMouseDistance === 'undefined') {
			this._visibleData.closestMouseDistance = computeDistanceFromPointToRectangle(this._visibleData.initialMousePosX, this._visibleData.initialMousePosY, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		}
		const distance = computeDistanceFromPointToRectangle(posx, posy, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		if (!distance || !this._visibleData.closestMouseDistance || distance > this._visibleData.closestMouseDistance + 4 /* tolerance of 4 pixels */) {
			// The mouse is getting farther away
			return false;
		}
		this._visibleData.closestMouseDistance = Math.min(this._visibleData.closestMouseDistance, distance);
		return true;
	}

	private _setVisibleData(visibleData: ContentHoverVisibleData | null): void {
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		this._visibleData = visibleData;
		this._hoverVisibleKey.set(!!this._visibleData);
		this._hover.containerDomNode.classList.toggle('hidden', !this._visibleData);
	}

	private _layout(): void {
		const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this.editor.getOption(EditorOption.fontInfo);

		this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		this._hover.contentsDomNode.style.maxHeight = `${height}px`;
		this._hover.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this.editor.applyFontInfo(node));
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverVisibleData): void {

		const persistedSize = this.findPersistedSize();

		if (!this.editor || !this.editor.hasModel()) {
			return;
		}

		this._setVisibleData(visibleData);

		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._hover.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		const containerDomNode = this.resizableContentWidget.getDomNode();
		let height;

		// If the persisted size has already been found then set a maximum height and width
		if (!persistedSize) {
			this._hover.contentsDomNode.style.maxHeight = `${Math.max(this.editor.getLayoutInfo().height / 4, 250)}px`;
			this._hover.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
			this.onContentsChanged();

			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this.editor.render();
			height = containerDomNode.clientHeight;
		}
		// When there is a persisted size then do not use a maximum height or width
		else {
			this._hover.contentsDomNode.style.maxHeight = 'none';
			this._hover.contentsDomNode.style.maxWidth = 'none';
			height = persistedSize.height;
		}

		// The dimensions of the document in which we are displaying the hover
		const bodyBox = dom.getClientArea(document.body);
		// Hard-coded in the hover.css file as 1.5em or 24px
		const minHeight = 24;
		// The full height is already passed in as a parameter
		const fullHeight = height;
		const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		const mouseBox = this.editor.getScrolledVisiblePosition(visibleData.showAtPosition);
		// Position where the editor box starts + the top of the mouse box relatve to the editor + mouse box height
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		// Total height of the box minus the position of the bottom of the mouse, this is the maximum height below the mouse position
		const availableSpaceBelow = bodyBox.height - mouseBottom;
		// Max height below is the minimum of the available space below and the full height of the widget
		const maxHeightBelow = Math.min(availableSpaceBelow, fullHeight);
		// The available space above the mouse position is the height of the top of the editor plus the top of the mouse box relative to the editor
		const availableSpaceAbove = editorBox.top + mouseBox.top - 30;
		const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
		// We find the maximum height of the widget possible on the top or on the bottom
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), fullHeight);

		if (height < minHeight) {
			height = minHeight;
		}
		if (height > maxHeight) {
			height = maxHeight;
		}

		// Determining whether we should render above or not ideally
		if (this.editor.getOption(EditorOption.hover).above) {
			this._renderingAbove = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			this._renderingAbove = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		if (!persistedSize) {
			this.onContentsChanged();
		}

		if (visibleData.stoleFocus) {
			this._hover.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();


		if (!this._visibleData) {
			return;
		}


		this.resizableContentWidget.position = this._visibleData.showAtPosition;
		this.resizableContentWidget.secondaryPosition = this._visibleData.showAtSecondaryPosition;
		this.resizableContentWidget.preference = [this._renderingAbove];
		this.resizableContentWidget.positionAffinity = this._visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;
	}

	public override hide(): void {
		this.element.clearSashHoverState();
		if (this._visibleData) {
			const stoleFocus = this._visibleData.stoleFocus;
			this._setVisibleData(null);
			this.editor.layoutContentWidget(this.resizableContentWidget);
			if (stoleFocus) {
				this.editor.focus();
			}
		}
	}

	// NEW
	/*
	public onContentsChanged(persistedSize?: dom.Dimension | undefined): void {

		const containerDomNode = this.resizableContentWidget.getDomNode();
		const contentsDomNode = this.resizableContentWidget.getContentsDomNode();

		// Suppose a persisted size is defined
		if (persistedSize) {

			const widthMinusSash = Math.min(this.findMaxRenderingWidth() ?? Infinity, persistedSize.width - SASH_WIDTH);
			const heightMinusSash = Math.min(this.findMaxRenderingHeight(this._renderingAbove) ?? Infinity, persistedSize.height - SASH_WIDTH);

			// Already setting directly the height and width parameters
			containerDomNode.style.width = widthMinusSash + 'px';
			containerDomNode.style.height = heightMinusSash + 'px';
			contentsDomNode.style.width = widthMinusSash + 'px';
			contentsDomNode.style.height = heightMinusSash + 'px';

		} else {

			// Otherwise the height and width are set to auto
			containerDomNode.style.width = 'auto';
			containerDomNode.style.height = 'auto';
			contentsDomNode.style.width = 'auto';
			contentsDomNode.style.height = 'auto';
		}

		this.editor.layoutContentWidget(this);
		this._hover.onContentsChanged();

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			let reposition = false;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				reposition = true;
			}
			const maxRenderingHeight = this.findMaxRenderingHeight(this._renderingAbove);
			// Need the following code since we are using an exact height when using the persisted size. If not used the horizontal scrollbar would just not be visible.
			if (persistedSize && maxRenderingHeight) {
				containerDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - SASH_WIDTH) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - SASH_WIDTH - SCROLLBAR_WIDTH) + 'px';
				reposition = true;
			}
			if (reposition) {
				this.editor.layoutContentWidget(this);
				this._hover.onContentsChanged();
			}
		}
	}*/

	// OLD FUNCTION
	public onContentsChanged(): void {
		this.editor.layoutContentWidget(this.resizableContentWidget);
		this._hover.onContentsChanged();

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				this.editor.layoutContentWidget(this.resizableContentWidget);
				this._hover.onContentsChanged();
			}
		}
	}

	public clear(): void {
		this._hover.contentsDomNode.textContent = '';
	}

	public focus(): void {
		this._hover.containerDomNode.focus();
	}

	public scrollUp(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
	}

	public scrollDown(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
	}

	public scrollLeft(): void {
		const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
		this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - this._horizontalScrollingBy });
	}

	public scrollRight(): void {
		const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
		this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + this._horizontalScrollingBy });
	}

	public pageUp(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
	}

	public pageDown(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
	}

	public goToTop(): void {
		this._hover.scrollbar.setScrollPosition({ scrollTop: 0 });
	}

	public goToBottom(): void {
		this._hover.scrollbar.setScrollPosition({ scrollTop: this._hover.scrollbar.getScrollDimensions().scrollHeight });
	}

	public escape(): void {
		this.editor.focus();
	}

	// -- decide what should be in the resizable content widget and what should be in the disposable hover widget
}

export class ResizableContentHoverWidget extends ResizableContentWidget {

	public ID = 'editor.contrib.resizableContentHoverWidget';
	private hoverDisposables = new DisposableStore();

	constructor(resizableHoverWidget: ResizableHoverWidget, editor: ICodeEditor) {
		super(resizableHoverWidget, editor);
	}
}
