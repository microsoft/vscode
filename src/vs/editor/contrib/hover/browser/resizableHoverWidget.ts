/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MultipleSizePersistingOptions, ResizableContentWidget, ResizableWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import * as dom from 'vs/base/browser/dom';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { PositionAffinity } from 'vs/editor/common/model';
import { IEditorHoverColorPickerWidget } from 'vs/editor/contrib/hover/browser/hoverTypes';

const SCROLLBAR_WIDTH = 10;

// TODO: maybe don't need the resizable widget class
export class ResizableHoverWidget extends ResizableWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';
	private hoverDisposables = new DisposableStore();
	private resizableContentWidget: ResizableContentHoverWidget;
	public readonly hoverWidget: HoverWidget = this.hoverDisposables.add(new HoverWidget());

	public readonly allowEditorOverflow = true;
	private readonly editor: ICodeEditor;
	private readonly hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly focusTracker = this.hoverDisposables.add(dom.trackFocus(this.getDomNode()));
	private readonly horizontalScrollingBy: number = 30;
	private visibleData: ContentHoverVisibleData | null = null;
	private renderingAbove: ContentWidgetPositionPreference;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super(editor, new MultipleSizePersistingOptions());

		this.editor = editor;
		this.resizableContentWidget = new ResizableContentHoverWidget(this, editor);
		this.renderingAbove = this.editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

		this.hoverDisposables.add(this.element.onDidResize((e) => {
			// When the resizable hover overlay changes, resize the widget
			this.resize(e.dimension);
		}));

		this.hoverDisposables.add(this.editor.onDidLayoutChange(() => this._layout()));
		this.hoverDisposables.add(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		this._setVisibleData(null);
		this._layout();

		this.hoverDisposables.add(this.focusTracker.onDidFocus(() => {
			this.hoverFocusedKey.set(true);
		}));
		this.hoverDisposables.add(this.focusTracker.onDidBlur(() => {
			this.hoverFocusedKey.set(false);
		}));

		// containerDomNode added to the element dom node
		// the element.domNode is returned by the getDomNode() of the ContentWidget
		dom.append(this.element.domNode, this.hoverWidget.containerDomNode);
	}

	public get position(): Position | null {
		return this.visibleData?.showAtPosition ?? null;
	}

	public get isColorPickerVisible(): boolean {
		return Boolean(this.visibleData?.colorPicker);
	}

	public get isVisibleFromKeyboard(): boolean {
		return (this.visibleData?.source === HoverStartSource.Keyboard);
	}

	public get isVisible(): boolean {
		return this.hoverVisibleKey.get() ?? false;
	}

	public override resize(size: dom.Dimension) {

		console.log('Inside of resize');

		// Removing the max height and max width here - the max size is controlled by the resizable overlay
		this.hoverWidget.contentsDomNode.style.maxHeight = 'none';
		this.hoverWidget.contentsDomNode.style.maxWidth = 'none';

		const width = size.width - 7 + 'px';
		this.hoverWidget.containerDomNode.style.width = width;
		this.hoverWidget.contentsDomNode.style.width = width;
		const height = size.height - 7 + 'px';
		this.hoverWidget.containerDomNode.style.height = height;
		this.hoverWidget.contentsDomNode.style.height = height;

		// const width = size.width - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH + 'px';
		// const height = size.height - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH + 'px';

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);

		if (hasHorizontalScrollbar) {
			console.log('Inside of hasHorizontalScrollbar');
			// When there is a horizontal scroll-bar use a different height to make the scroll-bar visible
			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			this.hoverWidget.contentsDomNode.style.height = size.height - SCROLLBAR_WIDTH + 'px'; // - 2 * SASH_WIDTH + TOTAL_BORDER_WIDTH
		}

		this.hoverWidget.scrollbar.scanDomNode();
		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.editor.render();
	}

	public override findMaximumRenderingHeight(): number | undefined {

		if (!this.editor || !this.editor.hasModel() || !this.visibleData?.showAtPosition) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		const mouseBox = this.editor.getScrolledVisiblePosition(this.visibleData.showAtPosition);
		const bodyBox = dom.getClientArea(document.body);
		let availableSpace: number;

		if (this.renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			availableSpace = editorBox.top + mouseBox.top - 30;
		} else {
			const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
			availableSpace = bodyBox.height - mouseBottom;
		}

		let divMaxHeight = 0;
		for (const childHtmlElement of this.hoverWidget.contentsDomNode.children) {
			divMaxHeight += childHtmlElement.clientHeight;
		}

		if (this.hoverWidget.contentsDomNode.clientWidth < this.hoverWidget.contentsDomNode.scrollWidth) {
			divMaxHeight += SCROLLBAR_WIDTH;
		}

		return Math.min(availableSpace, divMaxHeight);
	}

	public findMaxRenderingWidth(): number | undefined {
		if (!this.editor || !this.editor.hasModel()) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		const widthOfEditor = editorBox.width;
		const leftOfEditor = editorBox.left;
		const glyphMarginWidth = this.editor.getLayoutInfo().glyphMarginWidth;
		const leftOfContainer = this.hoverWidget.containerDomNode.offsetLeft;
		return widthOfEditor + leftOfEditor - leftOfContainer - glyphMarginWidth;
	}

	public override dispose(): void {
		this.editor.removeContentWidget(this.resizableContentWidget);
		if (this.visibleData) {
			this.visibleData.disposables.dispose();
		}
		super.dispose();
	}

	public getDomNode() {
		return this.hoverWidget.containerDomNode;
	}

	public getContentsDomNode() {
		return this.hoverWidget.contentsDomNode;
	}

	public isMouseGettingCloser(posx: number, posy: number): boolean {
		if (!this.visibleData) {
			return false;
		}
		if (typeof this.visibleData.initialMousePosX === 'undefined' || typeof this.visibleData.initialMousePosY === 'undefined') {
			this.visibleData.initialMousePosX = posx;
			this.visibleData.initialMousePosY = posy;
			return false;
		}

		const widgetRect = dom.getDomNodePagePosition(this.resizableContentWidget.getDomNode());
		if (typeof this.visibleData.closestMouseDistance === 'undefined') {
			this.visibleData.closestMouseDistance = computeDistanceFromPointToRectangle(this.visibleData.initialMousePosX, this.visibleData.initialMousePosY, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		}
		const distance = computeDistanceFromPointToRectangle(posx, posy, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		if (!distance || !this.visibleData.closestMouseDistance || distance > this.visibleData.closestMouseDistance + 4 /* tolerance of 4 pixels */) {
			// The mouse is getting farther away
			return false;
		}
		this.visibleData.closestMouseDistance = Math.min(this.visibleData.closestMouseDistance, distance);
		return true;
	}

	private _setVisibleData(visibleData: ContentHoverVisibleData | null): void {
		if (this.visibleData) {
			this.visibleData.disposables.dispose();
		}
		this.visibleData = visibleData;
		this.hoverVisibleKey.set(!!this.visibleData);
		this.hoverWidget.containerDomNode.classList.toggle('hidden', !this.visibleData);
	}

	private _layout(): void {
		const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this.editor.getOption(EditorOption.fontInfo);

		this.hoverWidget.contentsDomNode.style.fontSize = `${fontSize}px`;
		this.hoverWidget.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		this.hoverWidget.contentsDomNode.style.maxHeight = `${height}px`;
		this.hoverWidget.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this.hoverWidget.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this.editor.applyFontInfo(node));
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverVisibleData): void {

		this.resizableContentWidget.position = visibleData.showAtPosition;
		this.resizableContentWidget.secondaryPosition = visibleData.showAtSecondaryPosition;
		this.resizableContentWidget.preference = [this.renderingAbove];
		this.resizableContentWidget.positionAffinity = visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		this.editor.addContentWidget(this.resizableContentWidget);

		const persistedSize = this.findPersistedSize();

		if (!this.editor || !this.editor.hasModel()) {
			return;
		}

		this._setVisibleData(visibleData);

		this.hoverWidget.contentsDomNode.textContent = '';
		this.hoverWidget.contentsDomNode.appendChild(node);
		this.hoverWidget.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		const containerDomNode = this.resizableContentWidget.getDomNode();
		let height;

		// If the persisted size has already been found then set a maximum height and width
		if (!persistedSize) {
			this.hoverWidget.contentsDomNode.style.maxHeight = `${Math.max(this.editor.getLayoutInfo().height / 4, 250)}px`;
			this.hoverWidget.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
			this.onContentsChanged();

			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this.editor.render();
			height = containerDomNode.clientHeight;
		}
		// When there is a persisted size then do not use a maximum height or width
		else {
			this.hoverWidget.contentsDomNode.style.maxHeight = 'none';
			this.hoverWidget.contentsDomNode.style.maxWidth = 'none';
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
			this.renderingAbove = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			this.renderingAbove = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		if (!persistedSize) {
			this.onContentsChanged();
		}

		if (visibleData.stoleFocus) {
			this.hoverWidget.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();

		if (!this.visibleData) {
			return;
		}

		const clientHeight = this.hoverWidget.containerDomNode.clientHeight;
		const clientWidth = this.hoverWidget.containerDomNode.clientWidth;
		this.element.layout(clientHeight, clientWidth);
		this.resizableContentWidget.position = this.visibleData.showAtPosition;
		this.resizableContentWidget.secondaryPosition = this.visibleData.showAtSecondaryPosition;
		this.resizableContentWidget.preference = [this.renderingAbove];
		this.resizableContentWidget.positionAffinity = this.visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.editor.render();
		console.log('At the end of showAt');
	}

	public override hide(): void {

		console.log('Inside of hide of ResizableHoverWidget');

		this.element.clearSashHoverState();
		this.editor.removeContentWidget(this.resizableContentWidget);
		if (this.visibleData) {
			const stoleFocus = this.visibleData.stoleFocus;
			this._setVisibleData(null);
			this.editor.layoutContentWidget(this.resizableContentWidget);
			if (stoleFocus) {
				this.editor.focus();
			}
		}
	}

	public onContentsChanged(persistedSize?: dom.Dimension | undefined): void {

		console.log('Inside of onContentsChanged');

		const containerDomNode = this.getDomNode();
		const contentsDomNode = this.getContentsDomNode();

		// Suppose a persisted size is defined
		if (persistedSize) {

			const widthMinusSash = Math.min(this.findMaximumRenderingWidth() ?? Infinity, persistedSize.width); //  - SASH_WIDTH
			// const heightMinusSash = Math.min(this.findMaxRenderingHeight(this._renderingAbove) ?? Infinity, persistedSize.height - SASH_WIDTH);
			const heightMinusSash = Math.min(this.findMaximumRenderingHeight() ?? Infinity, persistedSize.height); // SASH_WIDTH

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

		containerDomNode.style.top = 2 + 'px';
		containerDomNode.style.left = 2 + 'px';

		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.hoverWidget.onContentsChanged();

		const clientHeight = this.hoverWidget.containerDomNode.clientHeight;
		const clientWidth = this.hoverWidget.containerDomNode.clientWidth;
		this.element.layout(clientHeight + 7, clientWidth + 7);
		// this.element.layout(clientHeight, clientWidth);

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		console.log('hasHorizontalScrollbar: ', hasHorizontalScrollbar);

		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			let reposition = false;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
				reposition = true;
			}
			const maxRenderingHeight = this.findMaximumRenderingHeight();
			// Need the following code since we are using an exact height when using the persisted size. If not used the horizontal scrollbar would just not be visible.
			if (persistedSize && maxRenderingHeight) {
				containerDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height) + 'px'; //  - SASH_WIDTH
				contentsDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - SCROLLBAR_WIDTH) + 'px'; //  - SASH_WIDTH
				reposition = true;
			}
			if (reposition) {
				this.element.layout(clientHeight + 17, clientWidth + 7);
				this.editor.layoutContentWidget(this.resizableContentWidget);
				this.editor.render();
				this.hoverWidget.onContentsChanged();
			}
		}
	}

	// OLD FUNCTION
	/*
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
	*/

	public clear(): void {
		this.hoverWidget.contentsDomNode.textContent = '';
	}

	public focus(): void {
		this.hoverWidget.containerDomNode.focus();
	}

	public scrollUp(): void {
		const scrollTop = this.hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
	}

	public scrollDown(): void {
		const scrollTop = this.hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
	}

	public scrollLeft(): void {
		const scrollLeft = this.hoverWidget.scrollbar.getScrollPosition().scrollLeft;
		this.hoverWidget.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - this.horizontalScrollingBy });
	}

	public scrollRight(): void {
		const scrollLeft = this.hoverWidget.scrollbar.getScrollPosition().scrollLeft;
		this.hoverWidget.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + this.horizontalScrollingBy });
	}

	public pageUp(): void {
		const scrollTop = this.hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this.hoverWidget.scrollbar.getScrollDimensions().height;
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
	}

	public pageDown(): void {
		const scrollTop = this.hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this.hoverWidget.scrollbar.getScrollDimensions().height;
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
	}

	public goToTop(): void {
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: 0 });
	}

	public goToBottom(): void {
		this.hoverWidget.scrollbar.setScrollPosition({ scrollTop: this.hoverWidget.scrollbar.getScrollDimensions().scrollHeight });
	}

	public escape(): void {
		this.editor.focus();
	}
}

export class ResizableContentHoverWidget extends ResizableContentWidget {

	public ID = 'editor.contrib.resizableContentHoverWidget';
	private hoverDisposables = new DisposableStore();

	constructor(resizableHoverWidget: ResizableHoverWidget, editor: ICodeEditor) {
		super(resizableHoverWidget, editor);
		console.log('Inside of resizable content hover widget');
	}
}

class ContentHoverVisibleData {

	public closestMouseDistance: number | undefined = undefined;

	constructor(
		public readonly colorPicker: IEditorHoverColorPickerWidget | null,
		public readonly showAtPosition: Position,
		public readonly showAtSecondaryPosition: Position,
		public readonly preferAbove: boolean,
		public readonly stoleFocus: boolean,
		public readonly source: HoverStartSource,
		public readonly isBeforeContent: boolean,
		public initialMousePosX: number | undefined,
		public initialMousePosY: number | undefined,
		public readonly disposables: DisposableStore
	) { }
}

function computeDistanceFromPointToRectangle(pointX: number, pointY: number, left: number, top: number, width: number, height: number): number {
	const x = (left + width / 2); // x center of rectangle
	const y = (top + height / 2); // y center of rectangle
	const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
	const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
	return Math.sqrt(dx * dx + dy * dy);
}
