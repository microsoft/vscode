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
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, PositionAffinity } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { HoverOperation, HoverStartMode, HoverStartSource, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, HoverRangeAnchor, IEditorHoverColorPickerWidget, IEditorHoverAction, IEditorHoverParticipant, IEditorHoverRenderContext, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import { AsyncIterableObject } from 'vs/base/common/async';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IResizeEvent, ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Emitter, Event } from 'vs/base/common/event';


// QUESTIONS TO ASK
// 1. How to make the overlay have higher index, appear on top and have the layer below still detect the on mouse events

const $ = dom.$;

export class ContentHoverController extends Disposable {

	private readonly _participants: IEditorHoverParticipant[];
	private readonly _resizableOverlay = this._register(this._instantiationService.createInstance(ResizableHoverOverlay, this._editor));
	private readonly _widget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
	private readonly _computer: ContentHoverComputer;
	private readonly _hoverOperation: HoverOperation<IHoverPart>;
	private _renderingAbove: boolean = this._editor.getOption(EditorOption.hover).above;

	private _currentResult: HoverResult | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._resizableOverlay.hoverWidget = this._widget;
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
		this._register(this._resizableOverlay.onDidResize((e) => {
			// When the resizable hover overlay changes, resize the widget
			this._widget.resize(e.dimension);
			// Update the left and top offset of the resizable element because the content widget may change its left and top offset as it is resized
			this._repositionResizableOverlay();
		}));
		this._register(this._editor.onDidLayoutChange(() => {
			// Sometimes the hover does not disappear on changing the layout of the editor, in that case reposition the resizable hover
			this._repositionResizableOverlay();
		}));
	}

	private _repositionResizableOverlay(): void {
		const resizableOverlayDomNode = this._resizableOverlay.getDomNode();
		const widgetDomNode = this._widget.getDomNode();
		const offsetTop = widgetDomNode.offsetTop;
		const offsetLeft = widgetDomNode.offsetLeft;

		if (offsetLeft) {
			resizableOverlayDomNode.style.left = offsetLeft + 'px';
		}
		if (offsetTop) {
			if (this._renderingAbove) {
				resizableOverlayDomNode.style.top = offsetTop - 2 + 'px';
			} else {
				resizableOverlayDomNode.style.top = offsetTop + 'px';
			}
		}
	}

	get resizableOverlay() {
		return this._resizableOverlay;
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	public maybeShowAt(mouseEvent: IEditorMouseEvent): boolean {

		// While the hover overlay is resizing, the hover is showing
		if (this._resizableOverlay.isResizing()) {
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
			this._resizableOverlay.hide();
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
			onContentsChanged: () => {

				const persistedSize = this._resizableOverlay.findPersistedSize();
				this._widget.onContentsChanged(persistedSize);
				// Needed in order to render correctly the content hover widget
				this._editor.render();

				// After the final rendering of the widget, retrieve its top and left offsets in order to set the size of the resizable element
				const widgetDomNode = this._widget.getDomNode();
				const offsetTop = widgetDomNode.offsetTop;
				const offsetLeft = widgetDomNode.offsetLeft;
				const clientWidth = widgetDomNode.clientWidth;
				const clientHeight = widgetDomNode.clientHeight;

				// Update the left and top offset to match the widget dom node
				const resizableElement = this._resizableOverlay.resizableElement();
				resizableElement.layout(clientHeight + 4, clientWidth + 4);

				// Find if rendered above or below in the container dom node
				const topLineNumber = anchor.initialMousePosY;
				let renderingAbove: boolean = true;

				if (topLineNumber) {
					if (offsetTop <= topLineNumber) {
						renderingAbove = true;
					} else {
						renderingAbove = false;
					}
				}

				this._renderingAbove = renderingAbove;
				this._widget.renderingAbove = renderingAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
				this._resizableOverlay.renderingAbove = renderingAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

				// Enable sashes depending on what side the rendering is on
				if (renderingAbove) {
					this._resizableOverlay.resizableElement().enableSashes(true, true, false, false);
					resizableElement.domNode.style.top = offsetTop - 2 + 'px';
				} else {
					this._resizableOverlay.resizableElement().enableSashes(false, true, true, false);
					resizableElement.domNode.style.top = offsetTop + 'px';
				}

				resizableElement.domNode.style.left = offsetLeft + 'px';

				const maxRenderingWidth = this._widget.findMaxRenderingWidth();
				const maxRenderingHeight = this._widget.findMaxRenderingHeight(this._widget.renderingAbove);

				if (!maxRenderingWidth || !maxRenderingHeight) {
					return;
				}

				this._resizableOverlay.resizableElement().maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
				this._editor.layoutOverlayWidget(this._resizableOverlay);
			},
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

			// Save the position of the tooltip, where the content hover should appear
			const tooltipPosition: IPosition = { lineNumber: showAtPosition.lineNumber, column: showAtPosition.column };
			// The tooltip position is saved in the resizable overlay
			this._resizableOverlay.tooltipPosition = tooltipPosition;
			const persistedSize = this._resizableOverlay.findPersistedSize();

			// The persisted size is used in the content hover widget
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
			), persistedSize);

			this._resizableOverlay.showAt();
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

export class ResizableHoverOverlay extends Disposable implements IOverlayWidget {

	static readonly ID = 'editor.contrib.resizableHoverOverlay';
	// Creating a new resizable HTML element
	private readonly _resizableElement: ResizableHTMLElement = this._register(new ResizableHTMLElement());
	// Map which maps from a text model URI, to a map from the stringified version of [offset, left] to the dom dimension
	private readonly _persistedHoverWidgetSizes = new Map<string, Map<string, dom.Dimension>>();
	// Boolean which is indicating whether we are currently resizing or not
	private _resizing: boolean = false;
	// The current size of the resizable element
	private _size: dom.Dimension | null = null;
	// The initial height of the content hover when it first appears
	private _initialHeight: number = -1;
	// The initial top of the content hover widget when it first appears
	private _initialTop: number = -1;
	// The maximum rendering height
	private _maxRenderingHeight: number | undefined = this._editor.getLayoutInfo().height;
	// The maximum rendering width
	private _maxRenderingWidth: number | undefined = this._editor.getLayoutInfo().width;
	// The position where to render the hover
	private _tooltipPosition: IPosition | null = null;
	// Boolean indicating whether we are rendering above or below
	private _renderingAbove: ContentWidgetPositionPreference = this._editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
	// The hover widget which appears above the resizable overlay
	private _hoverWidget: ContentHoverWidget | null = null;

	// Event emitter which fires whenever the resizable hover is resized
	private readonly _onDidResize = new Emitter<IResizeEvent>();
	readonly onDidResize: Event<IResizeEvent> = this._onDidResize.event;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		this._resizableElement.minSize = new dom.Dimension(10, 24);
		this._editor.onDidChangeModelContent((e) => {
			const uri = this._editor.getModel()?.uri.toString();
			if (!uri || !this._persistedHoverWidgetSizes.has(uri)) {
				return;
			}
			const persistedSizesForUri = this._persistedHoverWidgetSizes.get(uri)!;
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
			this._persistedHoverWidgetSizes.set(uri, updatedPersistedSizesForUri);
		});

		this._register(this._resizableElement.onDidWillResize(() => {
			this._resizing = true;
			this._initialHeight = this._resizableElement.domNode.clientHeight;
			this._initialTop = this._resizableElement.domNode.offsetTop;
		}));
		this._register(this._resizableElement.onDidResize(e => {

			let height = e.dimension.height;
			let width = e.dimension.width;
			const maxWidth = this._resizableElement.maxSize.width;
			const maxHeight = this._resizableElement.maxSize.height;

			width = Math.min(maxWidth, width);
			height = Math.min(maxHeight, height);
			if (!this._maxRenderingHeight) {
				return;
			}
			this._size = new dom.Dimension(width, height);
			this._resizableElement.layout(height, width);

			// Update the top parameters only when we decided to render above
			if (this._renderingAbove === ContentWidgetPositionPreference.ABOVE) {
				this._resizableElement.domNode.style.top = this._initialTop - (height - this._initialHeight) + 'px';
			}

			// Fire the current dimension
			this._onDidResize.fire({ dimension: this._size, done: false });

			this._maxRenderingWidth = this._hoverWidget!.findMaxRenderingWidth();
			this._maxRenderingHeight = this._hoverWidget!.findMaxRenderingHeight(this._renderingAbove);

			if (!this._maxRenderingHeight || !this._maxRenderingWidth) {
				return;
			}

			this._resizableElement.maxSize = new dom.Dimension(this._maxRenderingWidth, this._maxRenderingHeight);

			// Persist the height only when the resizing has stopped
			if (e.done) {
				if (!this._editor.hasModel()) {
					return;
				}
				const uri = this._editor.getModel().uri.toString();
				if (!uri || !this._tooltipPosition) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this._editor.getModel().getWordAtPosition(this._tooltipPosition);
				if (!wordPosition) {
					return;
				}
				const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				// Suppose that the uri does not exist in the persisted widget hover sizes, then create a map
				if (!this._persistedHoverWidgetSizes.get(uri)) {
					const persistedWidgetSizesForUri = new Map<string, dom.Dimension>([]);
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
					this._persistedHoverWidgetSizes.set(uri, persistedWidgetSizesForUri);
				} else {
					const persistedWidgetSizesForUri = this._persistedHoverWidgetSizes.get(uri)!;
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
				}
				this._resizing = false;
			}

			this._editor.layoutOverlayWidget(this);
			this._editor.render();
		}));
	}

	public get renderingAbove(): ContentWidgetPositionPreference {
		return this._renderingAbove;
	}

	public set renderingAbove(renderingAbove: ContentWidgetPositionPreference) {
		this._renderingAbove = renderingAbove;
	}

	public set hoverWidget(hoverWidget: ContentHoverWidget) {
		this._hoverWidget = hoverWidget;
	}

	public findPersistedSize(): dom.Dimension | undefined {
		if (!this._tooltipPosition || !this._editor.hasModel()) {
			return;
		}
		const wordPosition = this._editor.getModel().getWordAtPosition(this._tooltipPosition);
		if (!wordPosition) {
			return;
		}
		const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this._editor.getModel().uri.toString();
		const persistedSizesForUri = this._persistedHoverWidgetSizes.get(uri);
		if (!persistedSizesForUri) {
			return;
		}
		return persistedSizesForUri.get(JSON.stringify([offset, length]));
	}

	public isResizing(): boolean {
		return this._resizing;
	}

	public hide(): void {
		this._resizing = false;
		this._resizableElement.maxSize = new dom.Dimension(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
		this._resizableElement.clearSashHoverState();
		this._editor.removeOverlayWidget(this);
	}

	public resizableElement(): ResizableHTMLElement {
		return this._resizableElement;
	}

	public getId(): string {
		return ResizableHoverOverlay.ID;
	}

	public getDomNode(): HTMLElement {
		return this._resizableElement.domNode;
	}

	public set tooltipPosition(tooltipPosition: IPosition) {
		this._tooltipPosition = tooltipPosition;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return null;
	}

	public showAt(): void {
		// Adding the overlay widget
		this._editor.addOverlayWidget(this);
		this._resizableElement.domNode.style.zIndex = '49';
		this._resizableElement.domNode.style.position = 'fixed';
	}

}

export class ContentHoverWidget extends Disposable implements IContentWidget {

	static readonly ID = 'editor.contrib.contentHoverWidget';

	public readonly allowEditorOverflow = true;

	public readonly _hover: HoverWidget = this._register(new HoverWidget());
	private readonly _hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly _hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly _focusTracker = this._register(dom.trackFocus(this.getDomNode()));
	private readonly _horizontalScrollingBy: number = 30;
	private _visibleData: ContentHoverVisibleData | null = null;
	private _renderingAbove: ContentWidgetPositionPreference = this._editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

	/**
	 * Returns `null` if the hover is not visible.
	 */
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

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._register(this._editor.onDidLayoutChange(() => this._layout()));
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._setVisibleData(null);
		this._layout();
		this._editor.addContentWidget(this);

		this._register(this._focusTracker.onDidFocus(() => {
			this._hoverFocusedKey.set(true);
		}));
		this._register(this._focusTracker.onDidBlur(() => {
			this._hoverFocusedKey.set(false);
		}));
	}

	public resize(size: dom.Dimension) {
		// Removing the max height and max width here, the max resizing is controller by the resizable overlay
		this._hover.contentsDomNode.style.maxHeight = 'none';
		this._hover.contentsDomNode.style.maxWidth = 'none';

		this._hover.containerDomNode.style.width = size.width - 4 + 'px';
		this._hover.containerDomNode.style.height = size.height - 4 + 'px';
		this._hover.contentsDomNode.style.width = size.width - 4 + 'px';
		this._hover.contentsDomNode.style.height = size.height - 4 + 'px';

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// When there is a horizontal scroll-bar use a different height
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
			}
			this._hover.contentsDomNode.style.height = size.height - 14 + 'px';
		}

		this._hover.scrollbar.scanDomNode();
		this._editor.layoutContentWidget(this);
		this._editor.render();
	}

	public findMaxRenderingHeight(rendering: ContentWidgetPositionPreference): number | undefined {

		if (!this._editor || !this._editor.hasModel() || !this._visibleData?.showAtPosition) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		const mouseBox = this._editor.getScrolledVisiblePosition(this._visibleData.showAtPosition);
		const bodyBox = dom.getClientArea(document.body);
		let availableSpace: number;

		if (rendering === ContentWidgetPositionPreference.ABOVE) {
			availableSpace = editorBox.top + mouseBox.top - 30;
		} else {
			const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
			availableSpace = bodyBox.height - mouseBottom;
		}

		let divMaxHeight = 0;
		for (const childHtmlElement of this._hover.contentsDomNode.children) {
			divMaxHeight += childHtmlElement.clientHeight;
		}

		let maxRenderingHeight;
		if (this._hover.contentsDomNode.clientWidth < this._hover.contentsDomNode.scrollWidth) {
			// Adding 10 which is the width of the horizontal scrollbar
			maxRenderingHeight = Math.min(availableSpace, divMaxHeight + 16);
		} else {
			maxRenderingHeight = Math.min(availableSpace, divMaxHeight + 6);
		}

		return maxRenderingHeight;
	}

	public findMaxRenderingWidth(): number | undefined {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		const widthOfEditor = editorBox.width;
		const leftOfEditor = editorBox.left;
		const glyphMarginWidth = this._editor.getLayoutInfo().glyphMarginWidth;
		const leftOfContainer = this._hover.containerDomNode.offsetLeft;
		return widthOfEditor + leftOfEditor - leftOfContainer - glyphMarginWidth;
	}

	public override dispose(): void {
		this._editor.removeContentWidget(this);
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		super.dispose();
	}

	public getId(): string {
		return ContentHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._hover.containerDomNode;
	}

	public getContentsDomNode(): HTMLElement {
		return this._hover.contentsDomNode;
	}

	public getPosition(): IContentWidgetPosition | null {
		if (!this._visibleData) {
			return null;
		}
		let preferAbove = this._visibleData.preferAbove;
		if (!preferAbove && this._contextKeyService.getContextKeyValue<boolean>(SuggestContext.Visible.key)) {
			// Prefer rendering above if the suggest widget is visible
			preferAbove = true;
		}

		// :before content can align left of the text content
		const affinity = this._visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		return {
			position: this._visibleData.showAtPosition,
			secondaryPosition: this._visibleData.showAtSecondaryPosition,
			preference: ([this._renderingAbove]),
			positionAffinity: affinity
		};
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

	private _setVisibleData(visibleData: ContentHoverVisibleData | null): void {
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		this._visibleData = visibleData;
		this._hoverVisibleKey.set(!!this._visibleData);
		this._hover.containerDomNode.classList.toggle('hidden', !this._visibleData);
	}

	private _layout(): void {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);

		this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		this._hover.contentsDomNode.style.maxHeight = `${height}px`;
		this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverVisibleData, persistedSize: dom.Dimension | undefined): void {

		if (!this._editor || !this._editor.hasModel()) {
			return;
		}

		this._setVisibleData(visibleData);

		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._hover.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		const containerDomNode = this.getDomNode();
		let height;

		// If the persisted size has already been found then set a maximum height and width
		if (!persistedSize) {
			this._hover.contentsDomNode.style.maxHeight = `${Math.max(this._editor.getLayoutInfo().height / 4, 250)}px`;
			this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
			this.onContentsChanged();

			// Simply force a synchronous render on the editor
			// such that the widget does not really render with left = '0px'
			this._editor.render();
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
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		const mouseBox = this._editor.getScrolledVisiblePosition(visibleData.showAtPosition);
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
		if (this._editor.getOption(EditorOption.hover).above) {
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
	}

	public hide(): void {
		if (this._visibleData) {
			const stoleFocus = this._visibleData.stoleFocus;
			this._setVisibleData(null);
			this._editor.layoutContentWidget(this);
			if (stoleFocus) {
				this._editor.focus();
			}
		}
	}

	public onContentsChanged(persistedSize?: dom.Dimension | undefined): void {

		const containerDomNode = this.getDomNode();
		const contentsDomNode = this.getContentsDomNode();

		// Suppose a persisted size is defined
		if (persistedSize) {

			const widthMinusSash = Math.min(this.findMaxRenderingWidth() ?? Infinity, persistedSize.width - 4);
			const heightMinusSash = Math.min(this.findMaxRenderingHeight(this._renderingAbove) ?? Infinity, persistedSize.height - 4);

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

		this._editor.layoutContentWidget(this);
		this._hover.onContentsChanged();

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			let rerender = false;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				rerender = true;
			}
			const maxRenderingHeight = this.findMaxRenderingHeight(this._renderingAbove);
			// Need the following code since we are using an exact height when using the persisted size. If not used the horizontal scrollbar would just not be visible.
			if (persistedSize && maxRenderingHeight) {
				containerDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - 4) + 'px';
				contentsDomNode.style.height = Math.min(maxRenderingHeight, persistedSize.height - 14) + 'px';
				rerender = true;
			}
			if (rerender) {
				this._editor.layoutContentWidget(this);
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
		this._editor.focus();
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
