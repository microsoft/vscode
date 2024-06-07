/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResizableContentWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getHoverAccessibleViewHint, HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { PositionAffinity } from 'vs/editor/common/model';
import { Emitter } from 'vs/base/common/event';
import { RenderedContentHover } from 'vs/editor/contrib/hover/browser/contentHoverRendered';

const HORIZONTAL_SCROLLING_BY = 30;
const CONTAINER_HEIGHT_PADDING = 6;

export class ContentHoverWidget extends ResizableContentWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';
	private static _lastDimensions: dom.Dimension = new dom.Dimension(0, 0);

	private _renderedHover: RenderedContentHover | undefined;
	private _positionPreference: ContentWidgetPositionPreference | undefined;
	private _minimumSize: dom.Dimension;
	private _contentWidth: number | undefined;

	private readonly _hover: HoverWidget = this._register(new HoverWidget());
	private readonly _hoverVisibleKey: IContextKey<boolean>;
	private readonly _hoverFocusedKey: IContextKey<boolean>;

	private readonly _onDidResize = this._register(new Emitter<void>());
	public readonly onDidResize = this._onDidResize.event;

	public get isVisibleFromKeyboard(): boolean {
		return (this._renderedHover?.source === HoverStartSource.Keyboard);
	}

	public get isVisible(): boolean {
		return this._hoverVisibleKey.get() ?? false;
	}

	public get isFocused(): boolean {
		return this._hoverFocusedKey.get() ?? false;
	}

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
		const minimumWidth = 150;
		const minimumSize = new dom.Dimension(minimumWidth, minimumHeight);
		super(editor, minimumSize);

		this._minimumSize = minimumSize;
		this._hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(contextKeyService);
		this._hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(contextKeyService);

		dom.append(this._resizableNode.domNode, this._hover.containerDomNode);
		this._resizableNode.domNode.style.zIndex = '50';

		this._register(this._editor.onDidLayoutChange(() => {
			if (this.isVisible) {
				this._updateMaxDimensions();
			}
		}));
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		const focusTracker = this._register(dom.trackFocus(this._resizableNode.domNode));
		this._register(focusTracker.onDidFocus(() => {
			this._hoverFocusedKey.set(true);
		}));
		this._register(focusTracker.onDidBlur(() => {
			this._hoverFocusedKey.set(false);
		}));
		this._setRenderedHover(undefined);
		this._editor.addContentWidget(this);
	}

	public override dispose(): void {
		super.dispose();
		this._renderedHover?.dispose();
		this._editor.removeContentWidget(this);
	}

	public getId(): string {
		return ContentHoverWidget.ID;
	}

	private static _applyDimensions(container: HTMLElement, width: number | string, height: number | string): void {
		const transformedWidth = typeof width === 'number' ? `${width}px` : width;
		const transformedHeight = typeof height === 'number' ? `${height}px` : height;
		container.style.width = transformedWidth;
		container.style.height = transformedHeight;
	}

	private _setContentsDomNodeDimensions(width: number | string, height: number | string): void {
		const contentsDomNode = this._hover.contentsDomNode;
		return ContentHoverWidget._applyDimensions(contentsDomNode, width, height);
	}

	private _setContainerDomNodeDimensions(width: number | string, height: number | string): void {
		const containerDomNode = this._hover.containerDomNode;
		return ContentHoverWidget._applyDimensions(containerDomNode, width, height);
	}

	private _setHoverWidgetDimensions(width: number | string, height: number | string): void {
		this._setContentsDomNodeDimensions(width, height);
		this._setContainerDomNodeDimensions(width, height);
		this._layoutContentWidget();
	}

	private static _applyMaxDimensions(container: HTMLElement, width: number | string, height: number | string) {
		const transformedWidth = typeof width === 'number' ? `${width}px` : width;
		const transformedHeight = typeof height === 'number' ? `${height}px` : height;
		container.style.maxWidth = transformedWidth;
		container.style.maxHeight = transformedHeight;
	}

	private _setHoverWidgetMaxDimensions(width: number | string, height: number | string): void {
		ContentHoverWidget._applyMaxDimensions(this._hover.contentsDomNode, width, height);
		ContentHoverWidget._applyMaxDimensions(this._hover.containerDomNode, width, height);
		this._hover.containerDomNode.style.setProperty('--vscode-hover-maxWidth', typeof width === 'number' ? `${width}px` : width);
		this._layoutContentWidget();
	}

	private _setAdjustedHoverWidgetDimensions(size: dom.Dimension): void {
		this._setHoverWidgetMaxDimensions('none', 'none');
		const width = size.width;
		const height = size.height;
		this._setHoverWidgetDimensions(width, height);
	}

	private _updateResizableNodeMaxDimensions(): void {
		const maxRenderingWidth = this._findMaximumRenderingWidth() ?? Infinity;
		const maxRenderingHeight = this._findMaximumRenderingHeight() ?? Infinity;
		this._resizableNode.maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
		this._setHoverWidgetMaxDimensions(maxRenderingWidth, maxRenderingHeight);
	}

	protected override _resize(size: dom.Dimension): void {
		ContentHoverWidget._lastDimensions = new dom.Dimension(size.width, size.height);
		this._setAdjustedHoverWidgetDimensions(size);
		this._resizableNode.layout(size.height, size.width);
		this._updateResizableNodeMaxDimensions();
		this._hover.scrollbar.scanDomNode();
		this._editor.layoutContentWidget(this);
		this._onDidResize.fire();
	}

	private _findAvailableSpaceVertically(): number | undefined {
		const position = this._renderedHover?.showAtPosition;
		if (!position) {
			return;
		}
		return this._positionPreference === ContentWidgetPositionPreference.ABOVE ?
			this._availableVerticalSpaceAbove(position)
			: this._availableVerticalSpaceBelow(position);
	}

	private _findMaximumRenderingHeight(): number | undefined {
		const availableSpace = this._findAvailableSpaceVertically();
		if (!availableSpace) {
			return;
		}
		// Padding needed in order to stop the resizing down to a smaller height
		let maximumHeight = CONTAINER_HEIGHT_PADDING;
		Array.from(this._hover.contentsDomNode.children).forEach((hoverPart) => {
			maximumHeight += hoverPart.clientHeight;
		});

		return Math.min(availableSpace, maximumHeight);
	}

	private _isHoverTextOverflowing(): boolean {
		// To find out if the text is overflowing, we will disable wrapping, check the widths, and then re-enable wrapping
		this._hover.containerDomNode.style.setProperty('--vscode-hover-whiteSpace', 'nowrap');
		this._hover.containerDomNode.style.setProperty('--vscode-hover-sourceWhiteSpace', 'nowrap');

		const overflowing = Array.from(this._hover.contentsDomNode.children).some((hoverElement) => {
			return hoverElement.scrollWidth > hoverElement.clientWidth;
		});

		this._hover.containerDomNode.style.removeProperty('--vscode-hover-whiteSpace');
		this._hover.containerDomNode.style.removeProperty('--vscode-hover-sourceWhiteSpace');

		return overflowing;
	}

	private _findMaximumRenderingWidth(): number | undefined {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}

		const overflowing = this._isHoverTextOverflowing();
		const initialWidth = (
			typeof this._contentWidth === 'undefined'
				? 0
				: this._contentWidth - 2 // - 2 for the borders
		);

		if (overflowing || this._hover.containerDomNode.clientWidth < initialWidth) {
			const bodyBoxWidth = dom.getClientArea(this._hover.containerDomNode.ownerDocument.body).width;
			const horizontalPadding = 14;
			return bodyBoxWidth - horizontalPadding;
		} else {
			return this._hover.containerDomNode.clientWidth + 2;
		}
	}

	public isMouseGettingCloser(posx: number, posy: number): boolean {

		if (!this._renderedHover) {
			return false;
		}
		if (this._renderedHover.initialMousePosX === undefined || this._renderedHover.initialMousePosY === undefined) {
			this._renderedHover.initialMousePosX = posx;
			this._renderedHover.initialMousePosY = posy;
			return false;
		}

		const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
		if (this._renderedHover.closestMouseDistance === undefined) {
			this._renderedHover.closestMouseDistance = computeDistanceFromPointToRectangle(
				this._renderedHover.initialMousePosX,
				this._renderedHover.initialMousePosY,
				widgetRect.left,
				widgetRect.top,
				widgetRect.width,
				widgetRect.height
			);
		}

		const distance = computeDistanceFromPointToRectangle(
			posx,
			posy,
			widgetRect.left,
			widgetRect.top,
			widgetRect.width,
			widgetRect.height
		);
		if (distance > this._renderedHover.closestMouseDistance + 4 /* tolerance of 4 pixels */) {
			// The mouse is getting farther away
			return false;
		}

		this._renderedHover.closestMouseDistance = Math.min(this._renderedHover.closestMouseDistance, distance);
		return true;
	}

	private _setRenderedHover(renderedHover: RenderedContentHover | undefined): void {
		this._renderedHover?.dispose();
		this._renderedHover = renderedHover;
		this._hoverVisibleKey.set(!!renderedHover);
		this._hover.containerDomNode.classList.toggle('hidden', !renderedHover);
	}

	private _updateFont(): void {
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);
		const contentsDomNode = this._hover.contentsDomNode;
		contentsDomNode.style.fontSize = `${fontSize}px`;
		contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	private _updateContent(node: DocumentFragment): void {
		const contentsDomNode = this._hover.contentsDomNode;
		contentsDomNode.style.paddingBottom = '';
		contentsDomNode.textContent = '';
		contentsDomNode.appendChild(node);
	}

	private _layoutContentWidget(): void {
		this._editor.layoutContentWidget(this);
		this._hover.onContentsChanged();
	}

	private _updateMaxDimensions() {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250, ContentHoverWidget._lastDimensions.height);
		const width = Math.max(this._editor.getLayoutInfo().width * 0.66, 500, ContentHoverWidget._lastDimensions.width);
		this._setHoverWidgetMaxDimensions(width, height);
	}

	private _render(renderedHover: RenderedContentHover) {
		this._setRenderedHover(renderedHover);
		this._updateFont();
		this._updateContent(renderedHover.domNode);
		this._updateMaxDimensions();
		this.onContentsChanged();
		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();
	}

	override getPosition(): IContentWidgetPosition | null {
		if (!this._renderedHover) {
			return null;
		}
		return {
			position: this._renderedHover.showAtPosition,
			secondaryPosition: this._renderedHover.showAtSecondaryPosition,
			positionAffinity: this._renderedHover.shouldAppearBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined,
			preference: [this._positionPreference ?? ContentWidgetPositionPreference.ABOVE]
		};
	}

	public show(renderedHover: RenderedContentHover): void {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		this._render(renderedHover);
		const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
		const widgetPosition = renderedHover.showAtPosition;
		this._positionPreference = this._findPositionPreference(widgetHeight, widgetPosition) ?? ContentWidgetPositionPreference.ABOVE;

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		this.onContentsChanged();
		if (renderedHover.shouldFocus) {
			this._hover.containerDomNode.focus();
		}
		this._onDidResize.fire();
		// The aria label overrides the label, so if we add to it, add the contents of the hover
		const hoverFocused = this._hover.containerDomNode.ownerDocument.activeElement === this._hover.containerDomNode;
		const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(
			this._configurationService.getValue('accessibility.verbosity.hover') === true && this._accessibilityService.isScreenReaderOptimized(),
			this._keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel() ?? ''
		);

		if (accessibleViewHint) {
			this._hover.contentsDomNode.ariaLabel = this._hover.contentsDomNode.textContent + ', ' + accessibleViewHint;
		}
	}

	public hide(): void {
		if (!this._renderedHover) {
			return;
		}
		const hoverStoleFocus = this._renderedHover.shouldFocus || this._hoverFocusedKey.get();
		this._setRenderedHover(undefined);
		this._resizableNode.maxSize = new dom.Dimension(Infinity, Infinity);
		this._resizableNode.clearSashHoverState();
		this._hoverFocusedKey.set(false);
		this._editor.layoutContentWidget(this);
		if (hoverStoleFocus) {
			this._editor.focus();
		}
	}

	private _removeConstraintsRenderNormally(): void {
		// Added because otherwise the initial size of the hover content is smaller than should be
		const layoutInfo = this._editor.getLayoutInfo();
		this._resizableNode.layout(layoutInfo.height, layoutInfo.width);
		this._setHoverWidgetDimensions('auto', 'auto');
	}

	public setMinimumDimensions(dimensions: dom.Dimension): void {
		// We combine the new minimum dimensions with the previous ones
		this._minimumSize = new dom.Dimension(
			Math.max(this._minimumSize.width, dimensions.width),
			Math.max(this._minimumSize.height, dimensions.height)
		);
		this._updateMinimumWidth();
	}

	private _updateMinimumWidth(): void {
		const width = (
			typeof this._contentWidth === 'undefined'
				? this._minimumSize.width
				: Math.min(this._contentWidth, this._minimumSize.width)
		);
		// We want to avoid that the hover is artificially large, so we use the content width as minimum width
		this._resizableNode.minSize = new dom.Dimension(width, this._minimumSize.height);
	}

	public onContentsChanged(): void {
		this._removeConstraintsRenderNormally();
		const containerDomNode = this._hover.containerDomNode;

		let height = dom.getTotalHeight(containerDomNode);
		let width = dom.getTotalWidth(containerDomNode);
		this._resizableNode.layout(height, width);

		this._setHoverWidgetDimensions(width, height);

		height = dom.getTotalHeight(containerDomNode);
		width = dom.getTotalWidth(containerDomNode);
		this._contentWidth = width;
		this._updateMinimumWidth();
		this._resizableNode.layout(height, width);

		if (this._renderedHover?.showAtPosition) {
			const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
			this._positionPreference = this._findPositionPreference(widgetHeight, this._renderedHover.showAtPosition);
		}
		this._layoutContentWidget();
	}

	public focus(): void {
		this._hover.containerDomNode.focus();
	}

	public scrollUp(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
	}

	public scrollDown(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
	}

	public scrollLeft(): void {
		const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
		this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - HORIZONTAL_SCROLLING_BY });
	}

	public scrollRight(): void {
		const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
		this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + HORIZONTAL_SCROLLING_BY });
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
}

function computeDistanceFromPointToRectangle(pointX: number, pointY: number, left: number, top: number, width: number, height: number): number {
	const x = (left + width / 2); // x center of rectangle
	const y = (top + height / 2); // y center of rectangle
	const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
	const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
	return Math.sqrt(dx * dx + dy * dy);
}
