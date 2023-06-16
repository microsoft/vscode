/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverAction, HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, PositionAffinity } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { HoverOperation, HoverStartMode, HoverStartSource, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, HoverRangeAnchor, IEditorHoverColorPickerWidget, IEditorHoverAction, IEditorHoverParticipant, IEditorHoverRenderContext, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AsyncIterableObject } from 'vs/base/common/async';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MultiplePersistedSizeResizableContentWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
const $ = dom.$;

export class ContentHoverController extends Disposable {

	private readonly _participants: IEditorHoverParticipant[];
	private readonly _widget = this._register(this._instantiationService.createInstance(ResizableHoverWidget, this._editor));
	private readonly _computer: ContentHoverComputer;
	private readonly _hoverOperation: HoverOperation<IHoverPart>;

	private _currentResult: HoverResult | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		// Instantiate participants and sort them by `hoverOrdinal` which is relevant for rendering order.
		this._participants = [];
		for (const participant of HoverParticipantRegistry.getAll()) {
			this._participants.push(this._instantiationService.createInstance(participant, this._editor));
		}
		this._participants.sort((p1, p2) => p1.hoverOrdinal - p2.hoverOrdinal);

		this._computer = new ContentHoverComputer(this._editor, this._participants);
		this._hoverOperation = this._register(new HoverOperation(this._editor, this._computer));

		this._register(this._hoverOperation.onResult((result) => {
			if (!this._computer.anchor) {
				// invalid state, ignore result
				return;
			}
			const messages = (result.hasLoadingMessage ? this._addLoadingMessage(result.value) : result.value);
			this._withResult(new HoverResult(this._computer.anchor, messages, result.isComplete));
		}));
		this._register(dom.addStandardDisposableListener(this._widget.getDomNode(), 'keydown', (e) => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
			}
		}));
		this._register(TokenizationRegistry.onDidChange(() => {
			if (this._widget.position && this._currentResult) {
				this._setCurrentResult(this._currentResult); // render again
			}
		}));
	}

	get widget() {
		return this._widget;
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	public maybeShowAt(mouseEvent: IEditorMouseEvent): boolean {
		if (this._widget.resizing) {
			return true;
		}
		const anchorCandidates: HoverAnchor[] = [];

		for (const participant of this._participants) {
			if (participant.suggestHoverAnchor) {
				const anchor = participant.suggestHoverAnchor(mouseEvent);
				if (anchor) {
					anchorCandidates.push(anchor);
				}
			}
		}

		const target = mouseEvent.target;

		if (target.type === MouseTargetType.CONTENT_TEXT) {
			anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
		}

		if (target.type === MouseTargetType.CONTENT_EMPTY) {
			const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
			if (!target.detail.isAfterLines && typeof target.detail.horizontalDistanceToText === 'number' && target.detail.horizontalDistanceToText < epsilon) {
				// Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
				anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
			}
		}

		if (anchorCandidates.length === 0) {
			return this._startShowingOrUpdateHover(null, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
		}

		anchorCandidates.sort((a, b) => b.priority - a.priority);
		return this._startShowingOrUpdateHover(anchorCandidates[0], HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
	}

	public startShowingAtRange(range: Range, mode: HoverStartMode, source: HoverStartSource, focus: boolean): void {
		this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, undefined, undefined), mode, source, focus, null);
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	private _startShowingOrUpdateHover(anchor: HoverAnchor | null, mode: HoverStartMode, source: HoverStartSource, focus: boolean, mouseEvent: IEditorMouseEvent | null): boolean {
		if (!this._widget.position || !this._currentResult) {
			// The hover is not visible
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
				return true;
			}
			return false;
		}

		// The hover is currently visible
		const hoverIsSticky = this._editor.getOption(EditorOption.hover).sticky;
		const isGettingCloser = (hoverIsSticky && mouseEvent && this._widget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy));
		if (isGettingCloser) {
			// The mouse is getting closer to the hover, so we will keep the hover untouched
			// But we will kick off a hover update at the new anchor, insisting on keeping the hover visible.
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
			}
			return true;
		}

		if (!anchor) {
			this._setCurrentResult(null);
			return false;
		}

		if (anchor && this._currentResult.anchor.equals(anchor)) {
			// The widget is currently showing results for the exact same anchor, so no update is needed
			return true;
		}

		if (!anchor.canAdoptVisibleHover(this._currentResult.anchor, this._widget.position)) {
			// The new anchor is not compatible with the previous anchor
			this._setCurrentResult(null);
			this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
			return true;
		}

		// We aren't getting any closer to the hover, so we will filter existing results
		// and keep those which also apply to the new anchor.
		this._setCurrentResult(this._currentResult.filter(anchor));
		this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
		return true;
	}

	private _startHoverOperationIfNecessary(anchor: HoverAnchor, mode: HoverStartMode, source: HoverStartSource, focus: boolean, insistOnKeepingHoverVisible: boolean): void {
		if (this._computer.anchor && this._computer.anchor.equals(anchor)) {
			// We have to start a hover operation at the exact same anchor as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();
		this._computer.anchor = anchor;
		this._computer.shouldFocus = focus;
		this._computer.source = source;
		this._computer.insistOnKeepingHoverVisible = insistOnKeepingHoverVisible;
		this._hoverOperation.start(mode);
	}

	private _setCurrentResult(hoverResult: HoverResult | null): void {
		if (this._currentResult === hoverResult) {
			// avoid updating the DOM to avoid resetting the user selection
			return;
		}
		if (hoverResult && hoverResult.messages.length === 0) {
			hoverResult = null;
		}
		this._currentResult = hoverResult;
		if (this._currentResult) {
			this._renderMessages(this._currentResult.anchor, this._currentResult.messages);
		} else {
			this._widget.hide();
		}
	}

	public hide(): void {
		this._computer.anchor = null;
		this._hoverOperation.cancel();
		this._setCurrentResult(null);
	}

	public isColorPickerVisible(): boolean {
		return this._widget.isColorPickerVisible;
	}

	public isVisibleFromKeyboard(): boolean {
		return this._widget.isVisibleFromKeyboard;
	}

	public isVisible(): boolean {
		return this._widget.isVisible;
	}

	public containsNode(node: Node | null | undefined): boolean {
		return (node ? this._widget.getDomNode().contains(node) : false);
	}

	private _addLoadingMessage(result: IHoverPart[]): IHoverPart[] {
		if (this._computer.anchor) {
			for (const participant of this._participants) {
				if (participant.createLoadingMessage) {
					const loadingMessage = participant.createLoadingMessage(this._computer.anchor);
					if (loadingMessage) {
						return result.slice(0).concat([loadingMessage]);
					}
				}
			}
		}
		return result;
	}

	private _withResult(hoverResult: HoverResult): void {
		if (this._widget.position && this._currentResult && this._currentResult.isComplete) {
			// The hover is visible with a previous complete result.

			if (!hoverResult.isComplete) {
				// Instead of rendering the new partial result, we wait for the result to be complete.
				return;
			}

			if (this._computer.insistOnKeepingHoverVisible && hoverResult.messages.length === 0) {
				// The hover would now hide normally, so we'll keep the previous messages
				return;
			}
		}

		this._setCurrentResult(hoverResult);
	}

	private _renderMessages(anchor: HoverAnchor, messages: IHoverPart[]): void {
		const { showAtPosition, showAtSecondaryPosition, highlightRange } = ContentHoverController.computeHoverRanges(this._editor, anchor.range, messages);

		const disposables = new DisposableStore();
		const statusBar = disposables.add(new EditorHoverStatusBar(this._keybindingService));
		const fragment = document.createDocumentFragment();

		let colorPicker: IEditorHoverColorPickerWidget | null = null;
		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget) => colorPicker = widget,
			onContentsChanged: () => this._widget.onContentsChanged(),
			hide: () => this.hide()
		};

		for (const participant of this._participants) {
			const hoverParts = messages.filter(msg => msg.owner === participant);
			if (hoverParts.length > 0) {
				disposables.add(participant.renderHoverParts(context, hoverParts));
			}
		}

		const isBeforeContent = messages.some(m => m.isBeforeContent);

		if (statusBar.hasContent) {
			fragment.appendChild(statusBar.hoverElement);
		}

		if (fragment.hasChildNodes()) {
			if (highlightRange) {
				const highlightDecoration = this._editor.createDecorationsCollection();
				highlightDecoration.set([{
					range: highlightRange,
					options: ContentHoverController._DECORATION_OPTIONS
				}]);
				disposables.add(toDisposable(() => {
					highlightDecoration.clear();
				}));
			}

			this._widget.showAt(fragment, new ContentHoverData(
				colorPicker,
				showAtPosition,
				showAtSecondaryPosition,
				this._editor.getOption(EditorOption.hover).above,
				this._computer.shouldFocus,
				this._computer.source,
				isBeforeContent,
				anchor.initialMousePosX,
				anchor.initialMousePosY,
				disposables
			));
		} else {
			disposables.dispose();
		}
	}

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'content-hover-highlight',
		className: 'hoverHighlight'
	});

	public static computeHoverRanges(editor: ICodeEditor, anchorRange: Range, messages: IHoverPart[]) {
		let startColumnBoundary = 1;
		if (editor.hasModel()) {
			// Ensure the range is on the current view line
			const viewModel = editor._getViewModel();
			const coordinatesConverter = viewModel.coordinatesConverter;
			const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
			const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, viewModel.getLineMinColumn(anchorViewRange.startLineNumber));
			startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
		}
		// The anchor range is always on a single line
		const anchorLineNumber = anchorRange.startLineNumber;
		let renderStartColumn = anchorRange.startColumn;
		let highlightRange: Range = messages[0].range;
		let forceShowAtRange: Range | null = null;

		for (const msg of messages) {
			highlightRange = Range.plusRange(highlightRange, msg.range);
			if (msg.range.startLineNumber === anchorLineNumber && msg.range.endLineNumber === anchorLineNumber) {
				// this message has a range that is completely sitting on the line of the anchor
				renderStartColumn = Math.max(Math.min(renderStartColumn, msg.range.startColumn), startColumnBoundary);
			}
			if (msg.forceShowAtRange) {
				forceShowAtRange = msg.range;
			}
		}

		return {
			showAtPosition: forceShowAtRange ? forceShowAtRange.getStartPosition() : new Position(anchorLineNumber, anchorRange.startColumn),
			showAtSecondaryPosition: forceShowAtRange ? forceShowAtRange.getStartPosition() : new Position(anchorLineNumber, renderStartColumn),
			highlightRange
		};
	}

	public focus(): void {
		this._widget.focus();
	}

	public scrollUp(): void {
		this._widget.scrollUp();
	}

	public scrollDown(): void {
		this._widget.scrollDown();
	}

	public scrollLeft(): void {
		this._widget.scrollLeft();
	}

	public scrollRight(): void {
		this._widget.scrollRight();
	}

	public pageUp(): void {
		this._widget.pageUp();
	}

	public pageDown(): void {
		this._widget.pageDown();
	}

	public goToTop(): void {
		this._widget.goToTop();
	}

	public goToBottom(): void {
		this._widget.goToBottom();
	}

	public escape(): void {
		this._widget.escape();
	}

	public clearPersistedSizes(): void {
		this._widget?.clearPersistedSizes();
	}
}

class HoverResult {

	constructor(
		public readonly anchor: HoverAnchor,
		public readonly messages: IHoverPart[],
		public readonly isComplete: boolean
	) { }

	public filter(anchor: HoverAnchor): HoverResult {
		const filteredMessages = this.messages.filter((m) => m.isValidForHoverAnchor(anchor));
		if (filteredMessages.length === this.messages.length) {
			return this;
		}
		return new FilteredHoverResult(this, this.anchor, filteredMessages, this.isComplete);
	}
}

class FilteredHoverResult extends HoverResult {

	constructor(
		private readonly original: HoverResult,
		anchor: HoverAnchor,
		messages: IHoverPart[],
		isComplete: boolean
	) {
		super(anchor, messages, isComplete);
	}

	public override filter(anchor: HoverAnchor): HoverResult {
		return this.original.filter(anchor);
	}
}

class ContentHoverData {

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

const HORIZONTAL_SCROLLING_BY = 30;
const SCROLLBAR_WIDTH = 10;
const SASH_WIDTH_MINUS_BORDER = 3;

export class ResizableHoverWidget extends MultiplePersistedSizeResizableContentWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';

	private _disposableStore = new DisposableStore();
	private _visibleData: ContentHoverData | undefined;
	private _renderingAbove: ContentWidgetPositionPreference | undefined;

	private readonly _hoverWidget: HoverWidget = this._disposableStore.add(new HoverWidget());
	private readonly _hoverVisibleKey: IContextKey<boolean>;
	private readonly _hoverFocusedKey: IContextKey<boolean>;

	public get isColorPickerVisible(): boolean {
		return Boolean(this._visibleData?.colorPicker);
	}

	public get isVisibleFromKeyboard(): boolean {
		return (this._visibleData?.source === HoverStartSource.Keyboard);
	}

	public get isVisible(): boolean {
		return this._hoverVisibleKey.get() ?? false;
	}

	constructor(
		_editor: ICodeEditor,
		@IContextKeyService _contextKeyService: IContextKeyService
	) {
		super(_editor);
		this._hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(_contextKeyService);
		this._hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(_contextKeyService);

		dom.append(this._resizableNode.domNode, this._hoverWidget.containerDomNode);
		this._resizableNode.domNode.classList.add('resizable-hover');

		this._disposableStore.add(this._editor.onDidLayoutChange(() => this._layout()));
		this._disposableStore.add(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		const focusTracker = this._disposableStore.add(dom.trackFocus(this._resizableNode.domNode));
		this._disposableStore.add(focusTracker.onDidFocus(() => {
			this._hoverFocusedKey.set(true);
		}));
		this._disposableStore.add(focusTracker.onDidBlur(() => {
			this._hoverFocusedKey.set(false);
		}));
		this._setVisibleData(undefined);
		this._layout();
	}

	public override dispose(): void {
		super.dispose();
		this._visibleData?.disposables.dispose();
		this._disposableStore.dispose();
		this._editor.removeContentWidget(this);
	}

	public getId(): string {
		return ResizableHoverWidget.ID;
	}

	private _setDimensions(container: HTMLElement, width: number | string, height: number | string) {
		const transformedWidth = typeof width === 'number' ? `${width}px` : width;
		const transformedHeight = typeof height === 'number' ? `${height}px` : height;
		container.style.width = transformedWidth;
		container.style.height = transformedHeight;
	}

	private _setContentsDomNodeDimensions(width: number | string, height: number | string) {
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		return this._setDimensions(contentsDomNode, width, height);
	}

	private _setContainerDomNodeDimensions(width: number | string, height: number | string) {
		const containerDomNode = this._hoverWidget.containerDomNode;
		return this._setDimensions(containerDomNode, width, height);
	}

	private _setHoverWidgetDimensions(width: number | string, height: number | string) {
		this._setContentsDomNodeDimensions(width, height);
		this._setContainerDomNodeDimensions(width, height);
		this._layoutContentWidget();
	}

	private _setContentsDomNodeMaxDimensions(width: number | string, height: number | string) {
		const transformedWidth = typeof width === 'number' ? `${width}px` : width;
		const transformedHeight = typeof height === 'number' ? `${height}px` : height;
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		contentsDomNode.style.maxWidth = transformedWidth;
		contentsDomNode.style.maxHeight = transformedHeight;
	}

	private _hasHorizontalScrollbar(): boolean {
		const scrollDimensions = this._hoverWidget.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = scrollDimensions.scrollWidth > scrollDimensions.width;
		return hasHorizontalScrollbar;
	}

	private _adjustContentsBottomPadding() {
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		const extraBottomPadding = `${this._hoverWidget.scrollbar.options.horizontalScrollbarSize}px`;
		if (contentsDomNode.style.paddingBottom !== extraBottomPadding) {
			contentsDomNode.style.paddingBottom = extraBottomPadding;
		}
	}

	private _setAdjustedHoverWidgetDimensions(size: dom.Dimension): void {
		this._setContentsDomNodeMaxDimensions('none', 'none');
		const width = size.width - 2 * SASH_WIDTH_MINUS_BORDER;
		const height = size.height - 2 * SASH_WIDTH_MINUS_BORDER;
		this._setHoverWidgetDimensions(width, height);
		// measure if has horizontal scorllbar after setting the dimensions
		if (this._hasHorizontalScrollbar()) {
			this._adjustContentsBottomPadding();
			this._setContentsDomNodeDimensions(width, height - SCROLLBAR_WIDTH);
		}
	}

	private _setResizableNodeMaxDimensions() {
		const maxRenderingWidth = this._findMaximumRenderingWidth();
		const maxRenderingHeight = this._findMaximumRenderingHeight();
		this._resizableNode.maxSize = new dom.Dimension(maxRenderingWidth ?? Infinity, maxRenderingHeight ?? Infinity);
	}

	override _resize(size: dom.Dimension) {
		this._setAdjustedHoverWidgetDimensions(size);
		this._setResizableNodeMaxDimensions();
		this._hoverWidget.scrollbar.scanDomNode();
		this._editor.layoutContentWidget(this);
	}

	private _findAvailableSpaceVertically(): number | undefined {
		if (!this._visibleData?.showAtPosition) {
			return;
		}
		const position = this._visibleData.showAtPosition;
		return this._renderingAbove === ContentWidgetPositionPreference.ABOVE ? this._availableVerticalSpaceAbove(position) : this._availableVerticalSpaceBelow(position);
	}

	private _findAvailableSpaceHorizontally(): number | undefined {
		return this._findMaximumRenderingWidth();
	}

	private _findMaximumRenderingHeight(): number | undefined {
		const availableSpace = this._findAvailableSpaceVertically();
		if (!availableSpace) {
			return;
		}
		let maximumHeight = 3 * SASH_WIDTH_MINUS_BORDER;
		Array.from(this._hoverWidget.contentsDomNode.children).forEach((hoverPart) => {
			maximumHeight += hoverPart.clientHeight;
		});
		if (this._hasHorizontalScrollbar()) {
			maximumHeight += SCROLLBAR_WIDTH;
		}
		return Math.min(availableSpace, maximumHeight);
	}

	private _findMaximumRenderingWidth(): number | undefined {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		const glyphMarginWidth = this._editor.getLayoutInfo().glyphMarginWidth;
		const leftOfContainer = this._hoverWidget.containerDomNode.offsetLeft;
		return editorBox.width + editorBox.left - leftOfContainer - glyphMarginWidth;
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

		const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
		if (typeof this._visibleData.closestMouseDistance === 'undefined') {
			this._visibleData.closestMouseDistance = computeDistanceFromPointToRectangle(this._visibleData.initialMousePosX, this._visibleData.initialMousePosY, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		}
		const distance = computeDistanceFromPointToRectangle(posx, posy, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		if (distance > this._visibleData.closestMouseDistance + 4 /* tolerance of 4 pixels */) {
			// The mouse is getting farther away
			return false;
		}
		this._visibleData.closestMouseDistance = Math.min(this._visibleData.closestMouseDistance, distance);
		return true;
	}

	private _setWidgetPosition(position: Position | undefined) {
		this._position = position;
	}

	private _setVisibleData(visibleData: ContentHoverData | undefined): void {
		this._setWidgetPosition(visibleData?.showAtPosition);
		this._visibleData?.disposables.dispose();
		this._visibleData = visibleData;
		this._hoverVisibleKey.set(!!visibleData);
		this._hoverWidget.containerDomNode.classList.toggle('hidden', !visibleData);
	}

	private _layout(): void {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		contentsDomNode.style.fontSize = `${fontSize}px`;
		contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		this._setContentsDomNodeMaxDimensions(Math.max(this._editor.getLayoutInfo().width * 0.66, 500), height);
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hoverWidget.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	private _updateContent(node: DocumentFragment): void {
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		contentsDomNode.style.paddingBottom = '';
		contentsDomNode.textContent = '';
		contentsDomNode.appendChild(node);
	}

	private _getWidgetHeight(): number {
		const containerDomNode = this._hoverWidget.containerDomNode;
		const persistedSize = this.findPersistedSize();
		return persistedSize ? persistedSize.height : containerDomNode.clientHeight + 2 * SASH_WIDTH_MINUS_BORDER;
	}

	private _layoutContentWidget(): void {
		this._editor.layoutContentWidget(this);
		this._hoverWidget.onContentsChanged();
	}

	private _updateContentsDomNodeMaxDimensions() {
		const persistedSize = this.findPersistedSize();
		const width = persistedSize ? 'none' : Math.max(this._editor.getLayoutInfo().width * 0.66, 500);
		const height = persistedSize ? 'none' : Math.max(this._editor.getLayoutInfo().height / 4, 250);
		this._setContentsDomNodeMaxDimensions(width, height);
	}

	private _render(node: DocumentFragment, visibleData: ContentHoverData) {
		if (!this._hoverVisibleKey.get()) {
			this._editor.addContentWidget(this);
		}
		this._setVisibleData(visibleData);
		this._updateFont();
		this._updateContent(node);
		this._updateContentsDomNodeMaxDimensions();
		if (!this.findPersistedSize()) {
			this.onContentsChanged();
			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this._editor.render();
		}
	}

	private _setContentPosition(visibleData: ContentHoverData, preference?: ContentWidgetPositionPreference) {
		this._contentPosition = {
			position: visibleData.showAtPosition,
			secondaryPosition: visibleData.showAtSecondaryPosition,
			positionAffinity: visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined,
			preference: [preference ?? ContentWidgetPositionPreference.ABOVE]
		};
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverData): void {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		this._setContentPosition(visibleData);
		this._render(node, visibleData);
		const widgetHeight = this._getWidgetHeight();
		const widgetPosition = visibleData.showAtPosition;
		this._renderingAbove = this._findRenderingPreference(widgetHeight, widgetPosition) ?? ContentWidgetPositionPreference.ABOVE;
		this._setContentPosition(visibleData, this._renderingAbove);

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		this.onContentsChanged();
		if (visibleData.stoleFocus) {
			this._hoverWidget.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();
	}

	public hide(): void {
		this._resizableNode.maxSize = new dom.Dimension(Infinity, Infinity);
		this._resizableNode.clearSashHoverState();
		this._editor.removeContentWidget(this);
		if (this._visibleData) {
			const stoleFocus = this._visibleData.stoleFocus;
			this._setVisibleData(undefined);
			this._hoverFocusedKey.set(false);
			this._editor.layoutContentWidget(this);
			if (stoleFocus) {
				this._editor.focus();
			}
		}
	}

	private _setPersistedHoverDimensionsOrRenderNormally(): void {
		let width: number | string;
		let height: number | string;
		const persistedSize = this.findPersistedSize();
		// Suppose a persisted size is defined
		if (persistedSize) {
			width = Math.min(this._findAvailableSpaceHorizontally() ?? Infinity, persistedSize.width - 2 * SASH_WIDTH_MINUS_BORDER);
			height = Math.min(this._findAvailableSpaceVertically() ?? Infinity, persistedSize.height - 2 * SASH_WIDTH_MINUS_BORDER);
		} else {
			// Added because otherwise the initial size of the hover content is smaller than should be
			const layoutInfo = this._editor.getLayoutInfo();
			this._resizableNode.layout(layoutInfo.height, layoutInfo.width);
			width = 'auto';
			height = 'auto';
		}
		this._setHoverWidgetDimensions(width, height);
	}

	private _setContainerAbsolutePosition(top: number, left: number): void {
		const containerDomNode = this._hoverWidget.containerDomNode;
		containerDomNode.style.top = top + 'px';
		containerDomNode.style.left = left + 'px';
	}

	private _adjustHoverHeightForScrollbar(height: number) {
		const containerDomNode = this._hoverWidget.containerDomNode;
		const contentsDomNode = this._hoverWidget.contentsDomNode;
		const maxRenderingHeight = this._findMaximumRenderingHeight() ?? Infinity;
		this._setContainerDomNodeDimensions(containerDomNode.clientWidth, Math.min(maxRenderingHeight, height));
		this._setContentsDomNodeDimensions(contentsDomNode.clientWidth, Math.min(maxRenderingHeight, height - SCROLLBAR_WIDTH));
	}

	public onContentsChanged(): void {
		this._setPersistedHoverDimensionsOrRenderNormally();
		const containerDomNode = this._hoverWidget.containerDomNode;
		const clientHeight = containerDomNode.clientHeight;
		const clientWidth = containerDomNode.clientWidth;
		this._resizableNode.layout(clientHeight + 2 * SASH_WIDTH_MINUS_BORDER, clientWidth + 2 * SASH_WIDTH_MINUS_BORDER);
		this._setContainerAbsolutePosition(SASH_WIDTH_MINUS_BORDER - 1, SASH_WIDTH_MINUS_BORDER - 1);
		if (this._hasHorizontalScrollbar()) {
			this._adjustContentsBottomPadding();
			this._adjustHoverHeightForScrollbar(clientHeight);
		}
		this._layoutContentWidget();
	}

	public focus(): void {
		this._hoverWidget.containerDomNode.focus();
	}

	public scrollUp(): void {
		const scrollTop = this._hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
	}

	public scrollDown(): void {
		const scrollTop = this._hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
	}

	public scrollLeft(): void {
		const scrollLeft = this._hoverWidget.scrollbar.getScrollPosition().scrollLeft;
		this._hoverWidget.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - HORIZONTAL_SCROLLING_BY });
	}

	public scrollRight(): void {
		const scrollLeft = this._hoverWidget.scrollbar.getScrollPosition().scrollLeft;
		this._hoverWidget.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + HORIZONTAL_SCROLLING_BY });
	}

	public pageUp(): void {
		const scrollTop = this._hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hoverWidget.scrollbar.getScrollDimensions().height;
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
	}

	public pageDown(): void {
		const scrollTop = this._hoverWidget.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hoverWidget.scrollbar.getScrollDimensions().height;
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
	}

	public goToTop(): void {
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: 0 });
	}

	public goToBottom(): void {
		this._hoverWidget.scrollbar.setScrollPosition({ scrollTop: this._hoverWidget.scrollbar.getScrollDimensions().scrollHeight });
	}

	public escape(): void {
		this._editor.focus();
	}
}

export class EditorHoverStatusBar extends Disposable implements IEditorHoverStatusBar {

	public readonly hoverElement: HTMLElement;
	private readonly actionsElement: HTMLElement;
	private _hasContent: boolean = false;

	public get hasContent() {
		return this._hasContent;
	}

	constructor(
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this.hoverElement = $('div.hover-row.status-bar');
		this.actionsElement = dom.append(this.hoverElement, $('div.actions'));
	}

	public addAction(actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }): IEditorHoverAction {
		const keybinding = this._keybindingService.lookupKeybinding(actionOptions.commandId);
		const keybindingLabel = keybinding ? keybinding.getLabel() : null;
		this._hasContent = true;
		return this._register(HoverAction.render(this.actionsElement, actionOptions, keybindingLabel));
	}

	public append(element: HTMLElement): HTMLElement {
		const result = dom.append(this.actionsElement, element);
		this._hasContent = true;
		return result;
	}
}

class ContentHoverComputer implements IHoverComputer<IHoverPart> {

	private _anchor: HoverAnchor | null = null;
	public get anchor(): HoverAnchor | null { return this._anchor; }
	public set anchor(value: HoverAnchor | null) { this._anchor = value; }

	private _shouldFocus: boolean = false;
	public get shouldFocus(): boolean { return this._shouldFocus; }
	public set shouldFocus(value: boolean) { this._shouldFocus = value; }

	private _source: HoverStartSource = HoverStartSource.Mouse;
	public get source(): HoverStartSource { return this._source; }
	public set source(value: HoverStartSource) { this._source = value; }

	private _insistOnKeepingHoverVisible: boolean = false;
	public get insistOnKeepingHoverVisible(): boolean { return this._insistOnKeepingHoverVisible; }
	public set insistOnKeepingHoverVisible(value: boolean) { this._insistOnKeepingHoverVisible = value; }

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly IEditorHoverParticipant[]
	) {
	}

	private static _getLineDecorations(editor: IActiveCodeEditor, anchor: HoverAnchor): IModelDecoration[] {
		if (anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
			return [];
		}

		const model = editor.getModel();
		const lineNumber = anchor.range.startLineNumber;

		if (lineNumber > model.getLineCount()) {
			// invalid line
			return [];
		}

		const maxColumn = model.getLineMaxColumn(lineNumber);
		return editor.getLineDecorations(lineNumber).filter((d) => {
			if (d.options.isWholeLine) {
				return true;
			}

			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
			if (d.options.showIfCollapsed) {
				// Relax check around `showIfCollapsed` decorations to also include +/- 1 character
				if (startColumn > anchor.range.startColumn + 1 || anchor.range.endColumn - 1 > endColumn) {
					return false;
				}
			} else {
				if (startColumn > anchor.range.startColumn || anchor.range.endColumn > endColumn) {
					return false;
				}
			}

			return true;
		});
	}

	public computeAsync(token: CancellationToken): AsyncIterableObject<IHoverPart> {
		const anchor = this._anchor;

		if (!this._editor.hasModel() || !anchor) {
			return AsyncIterableObject.EMPTY;
		}

		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, anchor);
		return AsyncIterableObject.merge(
			this._participants.map((participant) => {
				if (!participant.computeAsync) {
					return AsyncIterableObject.EMPTY;
				}
				return participant.computeAsync(anchor, lineDecorations, token);
			})
		);
	}

	public computeSync(): IHoverPart[] {
		if (!this._editor.hasModel() || !this._anchor) {
			return [];
		}

		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, this._anchor);

		let result: IHoverPart[] = [];
		for (const participant of this._participants) {
			result = result.concat(participant.computeSync(this._anchor, lineDecorations));
		}

		return coalesce(result);
	}
}

function computeDistanceFromPointToRectangle(pointX: number, pointY: number, left: number, top: number, width: number, height: number): number {
	const x = (left + width / 2); // x center of rectangle
	const y = (top + height / 2); // y center of rectangle
	const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
	const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
	return Math.sqrt(dx * dx + dy * dy);
}
