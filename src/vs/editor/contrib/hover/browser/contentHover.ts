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
import { EditorOption, ConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
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
import { MultipleSizePersistingMechanism, MultipleSizePersistingOptions, ResizableContentWidget, ResizableWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
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
				this._widget.clear();
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
		if (this._widget.isResizing()) {
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

	public containsNode(node: Node): boolean {
		return this._widget.getDomNode().contains(node);
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

			this._widget.showAt(fragment, new ContentHoverVisibleData(
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

const SCROLLBAR_WIDTH = 10;
const SASH_WIDTH_MINUS_BORDER = 3;
const BORDER_WIDTH = 1;
const DELTA_SASH_LENGTH = 4;

export class ResizableHoverWidget extends ResizableWidget {

	private disposableStore = new DisposableStore();
	private resizableContentWidget: ResizableContentHoverWidget;
	private visibleData: ContentHoverVisibleData | null = null;
	private renderingAbove: ContentWidgetPositionPreference | null = null;
	private visible: boolean = false;

	public readonly allowEditorOverflow = true;
	public readonly hoverWidget: HoverWidget = this.disposableStore.add(new HoverWidget());
	private readonly hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this.contextKeyService);
	private readonly hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this.contextKeyService);
	private readonly focusTracker: dom.IFocusTracker = this.disposableStore.add(dom.trackFocus(this.hoverWidget.contentsDomNode));
	private readonly horizontalScrollingBy: number = 30;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(editor, new MultipleSizePersistingOptions());
		this.element.domNode.style.position = 'absolute';
		this.element.domNode.style.zIndex = '50';
		dom.append(this.element.domNode, this.hoverWidget.containerDomNode);

		this.resizableContentWidget = new ResizableContentHoverWidget(this, editor);
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
		this.element.northSash.el.style.width = horizontalSashLength;
		this.element.southSash.el.style.width = horizontalSashLength;
		this.element.northSash.el.style.left = 2 * BORDER_WIDTH + 'px';
		this.element.southSash.el.style.left = 2 * BORDER_WIDTH + 'px';
		const verticalSashLength = size.height - DELTA_SASH_LENGTH + 'px';
		this.element.eastSash.el.style.height = verticalSashLength;
		this.element.westSash.el.style.height = verticalSashLength;
		this.element.eastSash.el.style.top = 2 * BORDER_WIDTH + 'px';
		this.element.westSash.el.style.top = 2 * BORDER_WIDTH + 'px';

		const maxRenderingWidth = this.findMaximumRenderingWidth();
		const maxRenderingHeight = this.findMaximumRenderingHeight();
		if (!maxRenderingWidth || !maxRenderingHeight) {
			return;
		}
		this.element.maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
		this.hoverWidget.scrollbar.scanDomNode();
		this.editor.layoutContentWidget(this.resizableContentWidget);
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
		this.editor.removeContentWidget(this.resizableContentWidget);
		if (this.visibleData) {
			this.visibleData.disposables.dispose();
		}
		super.dispose();
	}

	public getDomNode() {
		return this.hoverWidget.containerDomNode;
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
		if (!this.editor || !this.editor.hasModel()) {
			return;
		}
		if (this.persistingMechanism instanceof MultipleSizePersistingMechanism) {
			this.persistingMechanism.position = visibleData.showAtPosition;
		}
		this.resizableContentWidget.position = visibleData.showAtPosition;
		this.resizableContentWidget.secondaryPosition = visibleData.showAtSecondaryPosition;
		this.resizableContentWidget.positionAffinity = visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;
		this._setVisibleData(visibleData);

		if (!this.visible) {
			this.editor.addContentWidget(this.resizableContentWidget);
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
			height = this.resizableContentWidget.getDomNode().clientHeight + 6;
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
		this.visible = true;
	}

	public hide(): void {
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

	private _layoutContentWidget(): void {
		this.editor.layoutContentWidget(this.resizableContentWidget);
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
			this.element.domNode.style.width = this.editor.getLayoutInfo().width + 'px';
			this.element.domNode.style.height = this.editor.getLayoutInfo().height + 'px';
			this._layoutContentWidget();
			// Added otherwise rendered too small horizontally
			containerDomNode.style.width = containerDomNode.clientWidth + 2 * BORDER_WIDTH + 'px';
		}

		const clientHeight = containerDomNode.clientHeight;
		const clientWidth = containerDomNode.clientWidth;

		this.element.layout(clientHeight + 2 * SASH_WIDTH_MINUS_BORDER, clientWidth + 2 * SASH_WIDTH_MINUS_BORDER);
		this.element.domNode.style.width = clientWidth + 2 * SASH_WIDTH_MINUS_BORDER + 'px';
		this.element.domNode.style.height = clientHeight + 2 * SASH_WIDTH_MINUS_BORDER + 'px';

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

		this.element.northSash.el.style.width = horizontalSashLength + 'px';
		this.element.southSash.el.style.width = horizontalSashLength + 'px';
		this.element.northSash.el.style.left = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.element.southSash.el.style.left = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.element.eastSash.el.style.height = verticalSashLength + 'px';
		this.element.westSash.el.style.height = verticalSashLength + 'px';
		this.element.eastSash.el.style.top = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
		this.element.westSash.el.style.top = SASH_WIDTH_MINUS_BORDER - 1 + 'px';
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

export class ResizableContentHoverWidget extends ResizableContentWidget {

	public static ID = 'editor.contrib.resizableContentHoverWidget';

	constructor(resizableHoverWidget: ResizableHoverWidget, editor: ICodeEditor) {
		super(resizableHoverWidget);
	}

	public getId(): string {
		return ResizableContentHoverWidget.ID;
	}
}

class EditorHoverStatusBar extends Disposable implements IEditorHoverStatusBar {

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
