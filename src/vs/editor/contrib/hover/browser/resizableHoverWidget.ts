/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MultipleSizePersistingMechanism, MultipleSizePersistingOptions, ResizableContentWidget, ResizableWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import * as dom from 'vs/base/browser/dom';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { PositionAffinity } from 'vs/editor/common/model';
import { IEditorHoverColorPickerWidget } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';

const SCROLLBAR_WIDTH = 10;

// TODO: How to increase the z-index so that appears above the tabs? Somehow does not work

export class ResizableHoverWidget extends ResizableWidget {

	private disposableStore = new DisposableStore();
	private resizableContentWidget: ResizableContentHoverWidget;
	private visibleData: ContentHoverVisibleData | null = null;
	private renderingAbove: ContentWidgetPositionPreference;
	private visible: boolean = false;

	public readonly hoverWidget: HoverWidget = this.disposableStore.add(new HoverWidget());
	public readonly allowEditorOverflow = true;

	private readonly hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly focusTracker: dom.IFocusTracker = this.disposableStore.add(dom.trackFocus(this.getDomNode()));
	private readonly horizontalScrollingBy: number = 30;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super(editor, new MultipleSizePersistingOptions());
		dom.append(this.element.domNode, this.hoverWidget.containerDomNode);

		this.resizableContentWidget = new ResizableContentHoverWidget(this, editor);
		this.renderingAbove = this.editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

		this.disposableStore.add(this.editor.onDidLayoutChange(() => this._layout()));
		this.disposableStore.add(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		this.disposableStore.add(this.focusTracker.onDidFocus(() => {
			this.hoverFocusedKey.set(true);
		}));
		this.disposableStore.add(this.focusTracker.onDidBlur(() => {
			this.hoverFocusedKey.set(false);
		}));
		this._setVisibleData(null);
		this._layout();
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
		console.log('size : ', size);

		this.hoverWidget.contentsDomNode.style.maxHeight = 'none';
		this.hoverWidget.contentsDomNode.style.maxWidth = 'none';

		// TODO: Change the pixel sizes
		const width = size.width - 6 + 'px';
		this.hoverWidget.containerDomNode.style.width = width;
		this.hoverWidget.contentsDomNode.style.width = width;

		// TODO: There are issues with this part
		// const height = size.height - 6 + 'px';
		// this.hoverWidget.containerDomNode.style.height = height;
		// this.hoverWidget.contentsDomNode.style.height = height;

		const horizontalSashLength = size.width - 4 + 'px';
		this.element.northSash.el.style.width = horizontalSashLength;
		this.element.southSash.el.style.width = horizontalSashLength;
		this.element.northSash.el.style.left = 2 + 'px';
		this.element.southSash.el.style.left = 2 + 'px';
		const verticalSashLength = size.height - 4 + 'px';
		this.element.eastSash.el.style.height = verticalSashLength;
		this.element.westSash.el.style.height = verticalSashLength;
		this.element.eastSash.el.style.top = 2 + 'px';
		this.element.westSash.el.style.top = 2 + 'px';

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);

		if (hasHorizontalScrollbar) {

			console.log('has horizontal scrollbar in the resize function');

			// When there is a horizontal scroll-bar use a different height to make the scroll-bar visible
			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			this.hoverWidget.containerDomNode.style.height = size.height - 6 + 'px';
			this.hoverWidget.contentsDomNode.style.height = size.height - SCROLLBAR_WIDTH - 6 + 'px';
		} else {

			console.log('Does not have horizontal scrollbar in the resize function');
			// TODO: There is still an error, why does the size change before event resize is called?
			this.hoverWidget.containerDomNode.style.height = size.height - 6 + 'px';
			this.hoverWidget.contentsDomNode.style.height = size.height - 6 + 'px';
			// this.hoverWidget.contentsDomNode.style.height = size.height + 'px';
			this.element.layout(size.height, size.width);
		}

		// const maximumRenderingWidth = this.findMaximumRenderingWidth();
		// const maximumRenderingHeight = this.findMaximumRenderingHeight();
		// console.log('maximumRenderingWidth : ', maximumRenderingWidth);
		// console.log('maximumRenderingHeight : ', maximumRenderingHeight);
		// if (!maximumRenderingWidth || !maximumRenderingHeight) {
		// 	return;
		// }
		// this.element.maxSize = new dom.Dimension(maximumRenderingWidth, maximumRenderingHeight);

		this.hoverWidget.scrollbar.scanDomNode();
		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.editor.render();

		console.log('this.resizableWidget.getDomNode() : ', this.resizableContentWidget.getDomNode());
	}

	public findAvailableSpace(): number | undefined {
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

		return availableSpace;
	}

	public override findMaximumRenderingHeight(): number | undefined {

		const availableSpace = this.findAvailableSpace();
		if (!availableSpace) {
			return;
		}

		let divMaxHeight = 7;
		for (const childHtmlElement of this.hoverWidget.contentsDomNode.children) {
			console.log('childHTMLElement : ', childHtmlElement);
			console.log('childHTMLElement.innerHTML : ', childHtmlElement.innerHTML);
			console.log('childHtmlElement.clientHeight : ', childHtmlElement.clientHeight);
			divMaxHeight += childHtmlElement.clientHeight;
		}

		if (this.hoverWidget.contentsDomNode.clientWidth < this.hoverWidget.contentsDomNode.scrollWidth) {

			console.log('Adding the scrollbar width when there is a horizontal scrollbar');

			divMaxHeight += SCROLLBAR_WIDTH;
		}

		return Math.min(availableSpace, divMaxHeight);
	}

	public override findMaximumRenderingWidth(): number | undefined {
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

		console.log('Inside of showAt');

		if (this.persistingMechanism instanceof MultipleSizePersistingMechanism) {
			this.persistingMechanism.position = visibleData.showAtPosition;
		}
		this.resizableContentWidget.position = visibleData.showAtPosition;
		this.resizableContentWidget.secondaryPosition = visibleData.showAtSecondaryPosition;
		this.resizableContentWidget.positionAffinity = visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		const domNode = this.resizableContentWidget.getDomNode();
		domNode.style.position = 'fixed';
		domNode.style.zIndex = '50';

		if (!this.visible) {
			this.editor.addContentWidget(this.resizableContentWidget);
		}

		const persistedSize = this.findPersistedSize();

		if (!this.editor || !this.editor.hasModel()) {
			return;
		}

		this._setVisibleData(visibleData);

		this.hoverWidget.contentsDomNode.textContent = '';
		this.hoverWidget.contentsDomNode.appendChild(node);
		this.hoverWidget.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		let height;
		// If the persisted size has already been found then set a maximum height and width
		if (!persistedSize) {
			this.hoverWidget.contentsDomNode.style.maxHeight = `${Math.max(this.editor.getLayoutInfo().height / 4, 250)}px`;
			this.hoverWidget.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
			this.onContentsChanged();

			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this.editor.render();
			height = domNode.clientHeight;
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

		if (this.renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			this.element.enableSashes(true, true, false, false);
		} else {
			this.element.enableSashes(false, true, true, false);
		}

		this.resizableContentWidget.preference = [this.renderingAbove];

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

		this.visible = true;
	}

	public override hide(): void {

		console.log('Inside of hide of ResizableHoverWidget');
		this.visible = false;
		this.element.maxSize = new dom.Dimension(Infinity, Infinity);
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

	public onContentsChanged(): void {

		console.log('Inside of onContentsChanged');

		const persistedSize = this.resizableContentWidget.findPersistedSize();
		const containerDomNode = this.getDomNode();
		const contentsDomNode = this.getContentsDomNode();

		// Suppose a persisted size is defined
		if (persistedSize) {

			console.log('Using persisted size');
			console.log('persistedSize.height: ' + persistedSize.height);
			console.log('persistedSize.width: ' + persistedSize.width);

			console.log('this.findMaximumRenderingWidth() : ', this.findMaximumRenderingWidth());
			console.log('this.findMaximumRenderingHeight() : ', this.findMaximumRenderingHeight());

			const width = Math.min(this.findMaximumRenderingWidth() ?? Infinity, persistedSize.width - 6);
			const height = Math.min(this.findAvailableSpace() ?? Infinity, persistedSize.height - 6);

			console.log('width : ', width);
			console.log('height : ', height);

			containerDomNode.style.width = width + 'px';
			containerDomNode.style.height = height + 'px';
			contentsDomNode.style.width = width + 'px';
			contentsDomNode.style.height = height + 'px';

			this.element.layout(persistedSize.height, persistedSize.width);

		} else {

			console.log('Not using persisted size');

			containerDomNode.style.width = 'auto';
			containerDomNode.style.height = 'auto';
			contentsDomNode.style.width = 'auto';
			contentsDomNode.style.height = 'auto';
		}

		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.hoverWidget.onContentsChanged();

		const clientHeight = containerDomNode.clientHeight;
		const clientWidth = containerDomNode.clientWidth;

		this.element.layout(clientHeight + 6, clientWidth + 6);
		containerDomNode.style.height = clientHeight + 'px';
		containerDomNode.style.width = clientWidth + 'px';
		containerDomNode.style.top = 2 + 'px';
		containerDomNode.style.left = 2 + 'px';

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);

		if (hasHorizontalScrollbar) {
			console.log('has horizontal scrollbar');

			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			const maxRenderingHeight = this.findMaximumRenderingHeight();

			if (!maxRenderingHeight) {
				return;
			}

			if (persistedSize) {
				containerDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - 6) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - 6 - SCROLLBAR_WIDTH) + 'px';
			} else {
				containerDomNode.style.height = Math.min(maxRenderingHeight, clientHeight) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, clientHeight - SCROLLBAR_WIDTH) + 'px';
			}
			this.element.layout(clientHeight + 6, clientWidth + 6);
			this.editor.layoutContentWidget(this.resizableContentWidget);
			this.hoverWidget.onContentsChanged();
		}

		console.log('Before changing the sash size');

		const finalClientHeight = containerDomNode.clientHeight + 2;
		const finalClientWidth = containerDomNode.clientWidth + 2;

		this.element.northSash.el.style.width = finalClientWidth + 'px';
		this.element.southSash.el.style.width = finalClientWidth + 'px';
		this.element.northSash.el.style.left = 2 + 'px';
		this.element.southSash.el.style.left = 2 + 'px';

		this.element.eastSash.el.style.height = finalClientHeight + 'px';
		this.element.westSash.el.style.height = finalClientHeight + 'px';
		this.element.eastSash.el.style.top = 2 + 'px';
		this.element.westSash.el.style.top = 2 + 'px';

		this.editor.layoutContentWidget(this.resizableContentWidget);
		this.editor.render();
	}

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

	public clearPersistedSizes(): void {
		this.persistingMechanism.clear();
	}
}

export class ResizableContentHoverWidget extends ResizableContentWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';

	constructor(resizableHoverWidget: ResizableHoverWidget, editor: ICodeEditor) {
		super(resizableHoverWidget, editor);
	}

	public getId(): string {
		return ResizableContentHoverWidget.ID;
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
