/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { clamp } from 'vs/base/common/numbers';
import { ResourceMap } from 'vs/base/common/map';
import { IPosition, Position } from 'vs/editor/common/core/position';
import * as dom from 'vs/base/browser/dom';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { ContentHoverVisibleData } from 'vs/editor/contrib/hover/browser/contentHover';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { PositionAffinity } from 'vs/editor/common/model';

// TODO: add my code, then do the TODOs

export abstract class ExampleResizableContentWidget extends Disposable implements IContentWidget {

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;

	protected readonly _contentNode: HTMLDivElement;
	protected readonly _resizableNode = this._register(new ResizableHTMLElement());

	private _contentPosition: IContentWidgetPosition | null = null;
	protected readonly persistingMechanism: ExampleSingleSizePersistingMechanism | ExampleMultipleSizePersistingMechanism;
	private resizing: boolean = false;

	constructor(
		initalSize: dom.IDimension = new dom.Dimension(100, 100),
		private readonly persistingOptions: IPersistingOptions,
		protected readonly editor: ICodeEditor
	) {
		super();
		this._contentNode = document.createElement('div');
		this._contentNode.style.width = `${initalSize.width}px`;
		this._contentNode.style.height = `${initalSize.height}px`;
		this._resizableNode.domNode.appendChild(this._contentNode);
		this._resizableNode.minSize = new dom.Dimension(10, 10);
		this._resizableNode.enableSashes(true, true, true, true);
		this._resizableNode.layout(initalSize.height, initalSize.width);
		this._register(this._resizableNode.onDidResize(e => {
			this._contentNode.style.width = `${e.dimension.width}px`;
			this._contentNode.style.height = `${e.dimension.height}px`;
		}));

		if (this.persistingOptions instanceof ExampleSingleSizePersistingOptions) {
			this.persistingMechanism = new ExampleSingleSizePersistingMechanism(this, this.editor, this.persistingOptions);
		} else if (this.persistingOptions instanceof ExampleMultipleSizePersistingOptions) {
			this.persistingMechanism = new ExampleMultipleSizePersistingMechanism(this, this.editor);
		} else {
			throw new Error('Please specify a valid persisting mechanism');
		}

		this._register(this._resizableNode.onDidWillResize(() => {
			this.resizing = true;
		}));
		this._register(this._resizableNode.onDidResize((e) => {
			if (e.done) {
				this.resizing = false;
			}
		}));
	}

	abstract getId(): string;

	getDomNode(): HTMLElement {
		return this._resizableNode.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._contentPosition;
	}

	setPosition(value: IContentWidgetPosition | null): void {
		// TODO
		// - compute boxed above/below if applicable
		this._contentPosition = value;
	}

	// abstract beforeRender?(): IDimension | null;

	afterRender(position: ContentWidgetPositionPreference | null): void {
		// TODO
		// - set max sizes that were computed above
	}

	abstract resize(dimension: dom.Dimension): void;

	isResizing() {
		return this.resizing;
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this.persistingMechanism.findSize();
	}

	beforeOnDidWillResize() {
		return;
	}

	afterOnDidResize() {
		return;
	}

	get resizableNode(): ResizableHTMLElement {
		return this._resizableNode;
	}
}

export class DummyResizeWidget extends ExampleResizableContentWidget {

	constructor(
		editor: ICodeEditor,
		persistingOptions: IPersistingOptions,
		initalSize: dom.IDimension = new dom.Dimension(100, 100)
	) {
		super(initalSize, persistingOptions, editor);
		this._contentNode.style.backgroundColor = 'red';
		this._contentNode.classList.add('dummy');
	}

	override getId(): string {
		return 'dummy';
	}

	override getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.BELOW]
		};
	}

	public resize(size: dom.Dimension) {
		this._contentNode.style.width = `${size.width}px`;
		this._contentNode.style.height = `${size.height}px`;
		this.editor.layoutContentWidget(this);
	}

	// override beforeRender?(): IDimension | null {
	// 	throw new Error('Method not implemented.');
	// }

	// override afterRender?(position: ContentWidgetPositionPreference | null): void {
	// 	throw new Error('Method not implemented.');
	// }
}

const SCROLLBAR_WIDTH = 10;
const SASH_WIDTH_MINUS_BORDER = 3;
const BORDER_WIDTH = 1;
const DELTA_SASH_LENGTH = 4;

export class ExampleResizableHoverWidget extends ExampleResizableContentWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';

	private disposableStore = new DisposableStore();
	private readonly hoverWidget: HoverWidget = this.disposableStore.add(new HoverWidget());
	private visibleData: ContentHoverVisibleData | null = null;
	private renderingAbove: ContentWidgetPositionPreference | null = null;
	private visible: boolean = false;

	private readonly hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this.contextKeyService);
	private readonly hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this.contextKeyService);
	private readonly focusTracker: dom.IFocusTracker;
	private readonly horizontalScrollingBy: number = 30;

	private _position: IPosition | null = null;
	private _secondaryPosition: IPosition | null = null;
	private _preference: ContentWidgetPositionPreference[] = [];
	private _positionAffinity: PositionAffinity | undefined = undefined;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		const initalSize = new dom.Dimension(10, 10);
		const persistingOptions = new ExampleMultipleSizePersistingOptions();
		super(initalSize, persistingOptions, editor);
		this.resizableNode.domNode.style.position = 'absolute';
		this.resizableNode.domNode.style.zIndex = '50';
		dom.append(this.resizableNode.domNode, this.hoverWidget.containerDomNode);
		this.focusTracker = this.disposableStore.add(dom.trackFocus(this.hoverWidget.contentsDomNode));
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

	public getId(): string {
		return ExampleResizableHoverWidget.ID;
	}

	public resize(size: dom.Dimension) {

		this.hoverWidget.contentsDomNode.style.maxHeight = 'none';
		this.hoverWidget.contentsDomNode.style.maxWidth = 'none';

		const width = size.width - 2 * SASH_WIDTH_MINUS_BORDER + 'px';
		this.hoverWidget.containerDomNode.style.width = width;
		this.hoverWidget.contentsDomNode.style.width = width;

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);

		if (hasHorizontalScrollbar) {
			// When there is a horizontal scroll-bar use a different height to make the scroll-bar visible
			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			const height = size.height - 2 * SASH_WIDTH_MINUS_BORDER;
			this.hoverWidget.containerDomNode.style.height = height + 'px';
			this.hoverWidget.contentsDomNode.style.height = height - SCROLLBAR_WIDTH + 'px';
		} else {
			const height = size.height - 2 * SASH_WIDTH_MINUS_BORDER;
			this.hoverWidget.containerDomNode.style.height = height + 'px';
			this.hoverWidget.contentsDomNode.style.height = height + 'px';
		}

		const horizontalSashLength = size.width - DELTA_SASH_LENGTH + 'px';
		this.resizableNode.northSash.el.style.width = horizontalSashLength;
		this.resizableNode.southSash.el.style.width = horizontalSashLength;
		this.resizableNode.northSash.el.style.left = 2 * BORDER_WIDTH + 'px';
		this.resizableNode.southSash.el.style.left = 2 * BORDER_WIDTH + 'px';
		const verticalSashLength = size.height - DELTA_SASH_LENGTH + 'px';
		this.resizableNode.eastSash.el.style.height = verticalSashLength;
		this.resizableNode.westSash.el.style.height = verticalSashLength;
		this.resizableNode.eastSash.el.style.top = 2 * BORDER_WIDTH + 'px';
		this.resizableNode.westSash.el.style.top = 2 * BORDER_WIDTH + 'px';

		const maxRenderingWidth = this.findMaximumRenderingWidth();
		const maxRenderingHeight = this.findMaximumRenderingHeight();
		if (!maxRenderingWidth || !maxRenderingHeight) {
			return;
		}
		this.resizableNode.maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
		this.hoverWidget.scrollbar.scanDomNode();
		this.editor.layoutContentWidget(this);
	}

	public findAvailableSpaceVertically(): number | undefined {
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

	public findAvailableSpaceHorizontally(): number | undefined {
		return this.findMaximumRenderingWidth();
	}

	public findMaximumRenderingHeight(): number | undefined {

		const availableSpace = this.findAvailableSpaceVertically();
		if (!availableSpace) {
			return;
		}
		let divMaxHeight = 3 * SASH_WIDTH_MINUS_BORDER;
		for (const childHtmlElement of this.hoverWidget.contentsDomNode.children) {
			divMaxHeight += childHtmlElement.clientHeight;
		}
		if (this.hoverWidget.contentsDomNode.clientWidth < this.hoverWidget.contentsDomNode.scrollWidth) {
			divMaxHeight += SCROLLBAR_WIDTH;
		}
		return Math.min(availableSpace, divMaxHeight);
	}

	public findMaximumRenderingWidth(): number | undefined {
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
		this.editor.removeContentWidget(this);
		if (this.visibleData) {
			this.visibleData.disposables.dispose();
		}
		super.dispose();
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

		const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
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
		if (!this.editor || !this.editor.hasModel()) {
			return;
		}
		if (this.persistingMechanism instanceof ExampleMultipleSizePersistingMechanism) {
			this.persistingMechanism.position = visibleData.showAtPosition;
		}
		this._position = visibleData.showAtPosition;
		this._secondaryPosition = visibleData.showAtSecondaryPosition;
		this._positionAffinity = visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;
		this._setVisibleData(visibleData);

		if (!this.visible) {
			this.editor.addContentWidget(this);
		}

		this.hoverWidget.contentsDomNode.textContent = '';
		this.hoverWidget.contentsDomNode.appendChild(node);
		this.hoverWidget.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		let height;
		const persistedSize = this.findPersistedSize();
		// If there is no persisted size, then normally render
		if (!persistedSize) {
			this.hoverWidget.contentsDomNode.style.maxHeight = `${Math.max(this.editor.getLayoutInfo().height / 4, 250)}px`;
			this.hoverWidget.contentsDomNode.style.maxWidth = `${Math.max(this.editor.getLayoutInfo().width * 0.66, 500)}px`;
			this.onContentsChanged();
			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this.editor.render();
			height = this.hoverWidget.containerDomNode.clientHeight + 6;
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
			this.resizableNode.enableSashes(true, true, false, false);
		} else {
			this.resizableNode.enableSashes(false, true, true, false);
		}

		this._preference = [this.renderingAbove];

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		if (!persistedSize) {
			this.onContentsChanged();
		}

		if (visibleData.stoleFocus) {
			this.hoverWidget.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();
		this.visible = true;
	}

	public hide(): void {
		this.visible = false;
		this.resizableNode.maxSize = new dom.Dimension(Infinity, Infinity);
		this.resizableNode.clearSashHoverState();
		this.editor.removeContentWidget(this);
		if (this.visibleData) {
			const stoleFocus = this.visibleData.stoleFocus;
			this._setVisibleData(null);
			this.editor.layoutContentWidget(this);
			if (stoleFocus) {
				this.editor.focus();
			}
		}
	}

	private _layoutContentWidget(): void {
		this.editor.layoutContentWidget(this);
		this.hoverWidget.onContentsChanged();
	}

	public onContentsChanged(): void {
		const persistedSize = this.findPersistedSize();
		const containerDomNode = this.hoverWidget.containerDomNode;
		const contentsDomNode = this.hoverWidget.contentsDomNode;

		// Suppose a persisted size is defined
		if (persistedSize) {
			const width = Math.min(this.findAvailableSpaceHorizontally() ?? Infinity, persistedSize.width - 2 * SASH_WIDTH_MINUS_BORDER);
			const height = Math.min(this.findAvailableSpaceVertically() ?? Infinity, persistedSize.height - 2 * SASH_WIDTH_MINUS_BORDER);
			containerDomNode.style.width = width + 'px';
			containerDomNode.style.height = height + 'px';
			contentsDomNode.style.width = width + 'px';
			contentsDomNode.style.height = height + 'px';
			this._layoutContentWidget();
		} else {
			containerDomNode.style.width = 'auto';
			containerDomNode.style.height = 'auto';
			contentsDomNode.style.width = 'auto';
			contentsDomNode.style.height = 'auto';
			// Added because otherwise the initial size of the hover content is smaller than should be
			this.resizableNode.domNode.style.width = this.editor.getLayoutInfo().width + 'px';
			this.resizableNode.domNode.style.height = this.editor.getLayoutInfo().height + 'px';
			this._layoutContentWidget();
			// Added otherwise rendered too small horizontally
			containerDomNode.style.width = containerDomNode.clientWidth + 2 * BORDER_WIDTH + 'px';
		}

		const clientHeight = containerDomNode.clientHeight;
		const clientWidth = containerDomNode.clientWidth;

		this.resizableNode.layout(clientHeight + 2 * SASH_WIDTH_MINUS_BORDER, clientWidth + 2 * SASH_WIDTH_MINUS_BORDER);
		this.resizableNode.domNode.style.width = clientWidth + 2 * SASH_WIDTH_MINUS_BORDER + 'px';
		this.resizableNode.domNode.style.height = clientHeight + 2 * SASH_WIDTH_MINUS_BORDER + 'px';

		containerDomNode.style.top = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		containerDomNode.style.left = SASH_WIDTH_MINUS_BORDER - 1 + 'px';

		const scrollDimensions = this.hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			const extraBottomPadding = `${this.hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
			if (this.hoverWidget.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this.hoverWidget.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			const maxRenderingHeight = this.findMaximumRenderingHeight();
			if (!maxRenderingHeight) {
				return;
			}
			if (persistedSize) {
				const persistedHeight = persistedSize.height - 2 * SASH_WIDTH_MINUS_BORDER;
				containerDomNode.style.height = Math.min(maxRenderingHeight, persistedHeight) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, persistedHeight - SCROLLBAR_WIDTH) + 'px';
			} else {
				containerDomNode.style.height = Math.min(maxRenderingHeight, clientHeight) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, clientHeight - SCROLLBAR_WIDTH) + 'px';
			}
		}

		const verticalSashLength = containerDomNode.clientHeight + 2 * BORDER_WIDTH;
		const horizontalSashLength = containerDomNode.clientWidth + 2 * BORDER_WIDTH;

		this.resizableNode.northSash.el.style.width = horizontalSashLength + 'px';
		this.resizableNode.southSash.el.style.width = horizontalSashLength + 'px';
		this.resizableNode.northSash.el.style.left = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.resizableNode.southSash.el.style.left = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.resizableNode.eastSash.el.style.height = verticalSashLength + 'px';
		this.resizableNode.westSash.el.style.height = verticalSashLength + 'px';
		this.resizableNode.eastSash.el.style.top = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.resizableNode.westSash.el.style.top = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this._layoutContentWidget();
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

// --- OLD PERSISTING MECHANISM

interface IPersistingOptions { }

export class ExampleSingleSizePersistingOptions implements IPersistingOptions {
	constructor(
		public readonly key: string,
		public readonly defaultSize: dom.Dimension,
		@IStorageService public readonly storageService: IStorageService
	) { }
}

export class ExampleMultipleSizePersistingOptions implements IPersistingOptions {
	constructor() { }
}

interface IPersistingMechanism extends IDisposable {

	/**
	 * Method which returns the current appropriate persisted size of the widget.
	 */
	findSize(): dom.Dimension | undefined;

	/**
	 * Method which clears the persisted size(s) of the widget.
	 */
	clear(): void;

	/**
	 * Method which disposes the persisting mechanism.
	 */
	dispose(): void;
}

/**
 * Class which can be used to define a mechanism that persists the size of a resizable widget. The persisted size is stored using the storage service.
 */
export class ExampleSingleSizePersistingMechanism implements IPersistingMechanism {

	private readonly persistedWidgetSize: PersistedWidgetSize | null = null;
	private readonly disposables = new DisposableStore();

	constructor(
		private readonly resizableWidget: ExampleResizableContentWidget,
		private readonly editor: ICodeEditor,
		private readonly persistingOptions: ExampleSingleSizePersistingOptions
	) {

		this.persistedWidgetSize = new PersistedWidgetSize(this.persistingOptions.key, this.persistingOptions.storageService);

		let state: ResizeState | undefined;
		this.disposables.add(this.resizableWidget.resizableNode.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
			state = new ResizeState(this.persistedWidgetSize!.restore(), this.resizableWidget.resizableNode.size);
		}));
		this.disposables.add(this.resizableWidget.resizableNode.onDidResize(e => {
			this.resizableWidget.resize(new dom.Dimension(e.dimension.width, e.dimension.height));
			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
			}
			if (!e.done) {
				return;
			}
			if (state) {
				const fontInfo = this.editor.getOption(EditorOption.fontInfo);
				const itemHeight = clamp(this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1000);
				const threshold = Math.round(itemHeight / 2);
				let { width, height } = this.resizableWidget.resizableNode.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? this.persistingOptions.defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? this.persistingOptions.defaultSize.width;
				}
				this.persistedWidgetSize!.store(new dom.Dimension(width, height));
			}
			state = undefined;
			this.resizableWidget.afterOnDidResize();
		}));
	}

	findSize(): dom.Dimension | undefined {
		return this.persistedWidgetSize?.restore();
	}

	clear(): void {
		this.persistedWidgetSize?.reset();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

/**
 * Class which can be used to define a mechanism which persists the sizes of a resizable widget on a per token-basis.
 * The sizes are saved in a ResourceMap which maps the document URI to the token position and its dom.Dimension persisted size.
 */
export class ExampleMultipleSizePersistingMechanism implements IPersistingMechanism {

	private readonly persistedWidgetSizes: ResourceMap<Map<string, dom.Dimension>> = new ResourceMap<Map<string, dom.Dimension>>();
	private readonly disposables = new DisposableStore();
	private _position: IPosition | null = null;

	constructor(
		private readonly resizableWidget: ExampleResizableContentWidget,
		public readonly editor: ICodeEditor
	) {
		this.disposables.add(this.editor.onDidChangeModelContent((e) => {
			const uri = this.editor.getModel()?.uri;
			if (!uri || !this.persistedWidgetSizes.has(uri)) {
				return;
			}
			const persistedSizesForUri = this.persistedWidgetSizes.get(uri)!;
			const updatedPersistedSizesForUri = new Map<string, dom.Dimension>();
			for (const change of e.changes) {
				const changeOffset = change.rangeOffset;
				const rangeLength = change.rangeLength;
				const endOffset = changeOffset + rangeLength;
				const textLength = change.text.length;
				for (const key of persistedSizesForUri.keys()) {
					const parsedKey = JSON.parse(key);
					const tokenOffset = parsedKey[0];
					const tokenLength = parsedKey[1];
					if (endOffset < tokenOffset) {
						const oldSize = persistedSizesForUri.get(key)!;
						const newKey: [number, number] = [tokenOffset - rangeLength + textLength, tokenLength];
						updatedPersistedSizesForUri.set(JSON.stringify(newKey), oldSize);
					} else if (changeOffset >= tokenOffset + tokenLength) {
						updatedPersistedSizesForUri.set(key, persistedSizesForUri.get(key)!);
					}
				}
			}
			this.persistedWidgetSizes.set(uri, updatedPersistedSizesForUri);
		}));
		this.disposables.add(this.resizableWidget.resizableNode.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
		}));
		this.disposables.add(this.resizableWidget.resizableNode.onDidResize(e => {
			const height = e.dimension.height;
			const width = e.dimension.width;
			this.resizableWidget.resize(new dom.Dimension(width, height));
			if (e.done) {
				if (!this.editor.hasModel()) {
					return;
				}
				const uri = this.editor.getModel().uri;
				if (!uri || !this._position) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this.editor.getModel().getWordAtPosition(this._position);
				if (!wordPosition) {
					return;
				}
				const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				if (!this.persistedWidgetSizes.get(uri)) {
					const persistedWidgetSizesForUri = new Map<string, dom.Dimension>([]);
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
					this.persistedWidgetSizes.set(uri, persistedWidgetSizesForUri);
				} else {
					const persistedWidgetSizesForUri = this.persistedWidgetSizes.get(uri)!;
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
				}
			}
			this.resizableWidget.afterOnDidResize();
		}));
	}

	set position(position: IPosition) {
		this._position = position;
	}

	findSize(): dom.Dimension | undefined {
		if (!this._position || !this.editor.hasModel()) {
			return;
		}
		const wordPosition = this.editor.getModel().getWordAtPosition(this._position);
		if (!wordPosition) {
			return;
		}
		const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this.editor.getModel().uri;
		const persistedSizesForUri = this.persistedWidgetSizes.get(uri);
		if (!persistedSizesForUri) {
			return;
		}
		return persistedSizesForUri.get(JSON.stringify([offset, length]));
	}

	clear(): void {
		this.persistedWidgetSizes.clear();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

/**
 * Class which is used in the single size persisting mechanism for resizable widgets.
 */
class PersistedWidgetSize {

	constructor(
		private readonly _key: string,
		private readonly _service: IStorageService
	) { }

	restore(): dom.Dimension | undefined {
		const raw = this._service.get(this._key, StorageScope.PROFILE) ?? '';
		try {
			const obj = JSON.parse(raw);
			if (dom.Dimension.is(obj)) {
				return dom.Dimension.lift(obj);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	store(size: dom.Dimension) {
		this._service.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	reset(): void {
		this._service.remove(this._key, StorageScope.PROFILE);
	}
}

/**
 * Class which is used in the single size persisting mechanism for resizable widgets.
 */
class ResizeState {
	constructor(
		readonly persistedSize: dom.Dimension | undefined,
		readonly currentSize: dom.Dimension,
		public persistHeight = false,
		public persistWidth = false,
	) { }
}

function computeDistanceFromPointToRectangle(pointX: number, pointY: number, left: number, top: number, width: number, height: number): number {
	const x = (left + width / 2); // x center of rectangle
	const y = (top + height / 2); // y center of rectangle
	const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
	const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
	return Math.sqrt(dx * dx + dy * dy);
}
