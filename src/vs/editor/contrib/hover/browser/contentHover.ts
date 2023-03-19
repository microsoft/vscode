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

const $ = dom.$;

// TODO: set maximum width
// TODO: remove the double flickering that happens on double rendering, but is it possible to remove it really?
// TODO: correct potential errors on sticky hover

class ResizeState {
	constructor(
		readonly persistedSize: dom.Dimension | undefined,
		readonly currentSize: dom.Dimension,
		public persistHeight = false,
		public persistWidth = false,
	) { }
}

export class ContentHoverController extends Disposable {

	private readonly _participants: IEditorHoverParticipant[];
	private readonly _resizableWidget = this._register(this._instantiationService.createInstance(ResizableHoverOverlay, this._editor));
	private readonly _widget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
	private readonly _computer: ContentHoverComputer;
	private readonly _hoverOperation: HoverOperation<IHoverPart>;

	private _currentResult: HoverResult | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._resizableWidget.containingWidget = this._widget;
		this._widget._hover.scrollbar.scanDomNode();

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
			console.log('* Result of the hover operation is attained');
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
		this._register(this._editor.onDidChangeModel(() => {
			this._resizableWidget.hide();
		}));
		this._register(this._resizableWidget.onDidResize((e) => {
			this._widget.resize(e.dimension);
		}));
	}

	get resizableWidget() {
		return this._resizableWidget;
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	public maybeShowAt(mouseEvent: IEditorMouseEvent): boolean {

		if (this._resizableWidget.isResizing()) {
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
			this._resizableWidget.hide();
		}
	}

	public hide(): void {
		console.log('Inside of hide of content hover controller');
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
		console.log('Inside of _renderMessage');
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
				console.log('Inside of onContentsChanged of the context inside of _renderMessage');
				console.log('Before onContentsChanged');
				let resizableWidgetDomNode = this._resizableWidget.getDomNode();
				console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
				console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
				console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
				console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
				console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

				const persistedSize = this._resizableWidget.findPersistedSize();
				console.log('persistedSize : ', persistedSize);
				this._widget.onContentsChanged(persistedSize);
				this._editor.render();

				console.log('After onContentsChanged');
				console.log('this._widget.getDomNode().offsetTop : ', this._widget.getDomNode().offsetTop);
				console.log('this._resizableWidget.getDomNode().offsetTop : ', this._resizableWidget.getDomNode().offsetTop);

				const widgetDomNode = this._widget.getDomNode();
				const top = widgetDomNode.offsetTop;
				const left = widgetDomNode.offsetLeft;

				this._resizableWidget.resizableElement().domNode.style.top = top - 2 + 'px';
				this._resizableWidget.resizableElement().domNode.style.left = left - 2 + 'px';
				this._resizableWidget.resizableElement().domNode.style.zIndex = '5';
				this._resizableWidget.resizableElement().domNode.tabIndex = 0;
				this._resizableWidget.resizableElement().domNode.style.position = 'fixed';
				const clientWidth = this._widget.getDomNode().clientWidth;
				const clientHeight = this._widget.getDomNode().clientHeight;
				this._resizableWidget.resizableElement().layout(clientHeight + 7, clientWidth + 7);
				this._editor.layoutOverlayWidget(this._resizableWidget);
				this._editor.render();

				resizableWidgetDomNode = this._resizableWidget.getDomNode();

				console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
				console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
				console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
				console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
				console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

				const containerDomNode = this._widget.getDomNode();
				console.log('containerDomNode : ', containerDomNode);
				console.log('containerDomNode client width : ', containerDomNode.clientWidth);
				console.log('containerDomNode client height : ', containerDomNode.clientHeight);
				console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
				console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
				const contentsDomNode = this._widget.getContentsDomNode();
				console.log('contentsDomNode : ', contentsDomNode);
				console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
				console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
				console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
				console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);

				console.log('At the end of onContentsChanged of _renderMessages');
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
			const preferAbove = this._editor.getOption(EditorOption.hover).above;

			const tooltipPosition: IPosition = { lineNumber: showAtPosition.lineNumber, column: showAtPosition.column };
			this._resizableWidget.setToooltipPosition(tooltipPosition);
			const persistedSize = this._resizableWidget.findPersistedSize();

			console.log('persisted size : ', persistedSize);

			// Added here but does not seem to have an effect
			if (persistedSize) {
				this._widget.getDomNode().style.width = persistedSize.width + 'px';
				this._widget.getDomNode().style.height = persistedSize.height + 'px';
				this._editor.addContentWidget(this._widget);
				this._editor.layoutContentWidget(this._widget);
				this._editor.render();
			}

			console.log('* Before this._widget.showAt');
			let resizableWidgetDomNode = this._resizableWidget.getDomNode();
			console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
			console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
			console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
			console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
			console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

			this._widget.showAt(fragment, new ContentHoverVisibleData(
				colorPicker,
				showAtPosition,
				showAtSecondaryPosition,
				preferAbove,
				this._computer.shouldFocus,
				this._computer.source,
				isBeforeContent,
				anchor.initialMousePosX,
				anchor.initialMousePosY,
				disposables
			), persistedSize);
			console.log('* After this._widget.showAt');
			console.log('* Before layoutContentWidget and render');
			// Before there wasn't any of this below
			this._editor.layoutContentWidget(this._widget);
			this._editor.render();

			console.log('* After layoutContentWidget and render');
			const containerDomNode = this._widget.getDomNode();
			console.log('containerDomNode : ', containerDomNode);
			console.log('containerDomNode client width : ', containerDomNode.clientWidth);
			console.log('containerDomNode client height : ', containerDomNode.clientHeight);
			console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
			console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
			resizableWidgetDomNode = this._resizableWidget.getDomNode();
			console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
			console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
			console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
			console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
			console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

			const contentsDomNode = this._widget.getContentsDomNode();
			console.log('contentsDomNode : ', contentsDomNode);
			console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
			console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
			console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
			console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);
			resizableWidgetDomNode = this._resizableWidget.getDomNode();
			console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
			console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
			console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
			console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
			console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

			const size = new dom.Dimension(this._widget.getDomNode().clientWidth, this._widget.getDomNode().clientHeight);
			console.log('size : ', size);
			const position = { clientTop: this._widget.getDomNode().offsetTop, clientLeft: this._widget.getDomNode().offsetLeft };
			console.log('position : ', position);

			console.log('* Before showAt of resizableWidget');
			resizableWidgetDomNode = this._resizableWidget.getDomNode();
			console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
			console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
			console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
			console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
			console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

			// Find if rendered above or below

			const topLineNumber = anchor.initialMousePosY;
			console.log('topLineNumber : ', topLineNumber);
			console.log('position.clientTop : ', position.clientTop);

			let renderingAbove: boolean = true;

			if (topLineNumber) {
				if (position.clientTop <= topLineNumber) {
					renderingAbove = true;
				} else {
					renderingAbove = false;
				}
			}

			console.log('Rendering above : ', renderingAbove);

			this._resizableWidget.showAt(position, size, renderingAbove);

			console.log('* After showAt of resizableWidget');
			resizableWidgetDomNode = this._resizableWidget.getDomNode();
			console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
			console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
			console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
			console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
			console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);
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

	public pageUp(): void {
		this._widget.pageUp();
	}

	public pageDown(): void {
		this._widget.pageDown();
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
	private _resizableElement: ResizableHTMLElement = this._register(new ResizableHTMLElement());
	private _resizing: boolean = false;
	private readonly _persistedHoverWidgetSizes = new Map<string, Map<string, dom.Dimension>>();
	private _size: dom.Dimension | null = null;
	private _initialHeight: number = -1;
	private _initialTop: number = -1;
	private _maxRenderingHeight: number | undefined;
	private _tooltipPosition: IPosition | null = null;
	private _renderingPosition: IOverlayWidgetPosition | null = null;
	private _visible: boolean = false;
	private _renderingAbove: ContentWidgetPositionPreference = ContentWidgetPositionPreference.ABOVE;
	private _containingWidget: ContentHoverWidget | null = null;

	private readonly _onDidResize = new Emitter<IResizeEvent>();
	readonly onDidResize: Event<IResizeEvent> = this._onDidResize.event;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		this._maxRenderingHeight = this._editor.getLayoutInfo().height;
		console.log('Inside of constructor of ResizableHoverOverlay');

		this._editor.onDidChangeModelContent((e) => {
			console.log('onDidChangeModelContent');
			console.log('e : ', e);
			const uri = this._editor.getModel()?.uri.toString();
			console.log('uri : ', uri);
			console.log('this._persistedHoverWidgetSizes : ', this._persistedHoverWidgetSizes);
			if (!uri || !this._persistedHoverWidgetSizes.has(uri)) {
				return;
			}
			const mapToUpdate = this._persistedHoverWidgetSizes.get(uri)!;
			const newMap = new Map<string, dom.Dimension>();
			console.log('mapToUpdate : ', mapToUpdate);
			for (const change of e.changes) {
				const changeOffset = change.rangeOffset;
				const rangeLength = change.rangeLength;
				const endOffset = changeOffset + rangeLength;
				const textLength = change.text.length;
				console.log('changeOffset : ', changeOffset);
				console.log('rangeLength : ', rangeLength);
				console.log('endOffset : ', endOffset);
				console.log('textLength : ', textLength);
				for (const stringifiedEntry of mapToUpdate.keys()) {
					const entry = JSON.parse(stringifiedEntry);
					console.log('entry : ', entry);
					if (endOffset < entry[0]) {
						console.log('first if statement');
						const oldSize = mapToUpdate.get(stringifiedEntry)!;
						console.log('oldSize : ', oldSize);
						console.log('entry[0] - rangeLength + textLength : ', entry[0] - rangeLength + textLength);
						const newEntry: [number, number] = [entry[0] - rangeLength + textLength, entry[1]];
						console.log('newEntry : ', newEntry);
						newMap.set(JSON.stringify(newEntry), oldSize);
					} else if (changeOffset >= entry[0] + entry[1]) {
						console.log('second if statement');
						newMap.set(stringifiedEntry, mapToUpdate.get(stringifiedEntry)!);
					}
				}
			}
			this._persistedHoverWidgetSizes.set(uri, newMap);
		});

		let state: ResizeState | undefined;

		this._register(this._resizableElement.onDidWillResize(() => {
			console.log('this._persistedHoverWidgetSizes ; ', this._persistedHoverWidgetSizes);
			const persistedSize = this.findPersistedSize();
			state = new ResizeState(persistedSize, this._resizableElement.size);
			this._resizing = true;
			this._initialHeight = this._resizableElement.domNode.clientHeight;
			this._initialTop = this._resizableElement.domNode.offsetTop;
		}));
		this._register(this._resizableElement.onDidResize(e => {

			console.log('* Inside of onDidResize of ContentHoverWidget');
			console.log('e : ', e);

			// update the left position of the resizable overlay on resize
			const offsetLeft = this._containingWidget?.getDomNode().offsetLeft;
			if (offsetLeft) {
				this._resizableElement.domNode.style.left = offsetLeft - 1 + 'px';
			}

			if (!this._visible) {
				this._resizing = false;
				return;
			}

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
			console.log('this._initialTop : ', this._initialTop);
			console.log('this._intiialHeight : ', this._initialHeight);
			console.log('height : ', height);
			console.log('this._initialTop - (height - this._initialHeight) : ', this._initialTop - (height - this._initialHeight));

			// When resizing and then the size is smaller so that can be displayed above, display above
			// if (height <= maxHeightAbove && this._renderingAbove === ContentWidgetPositionPreference.BELOW) {
			//	this._renderingAbove = ContentWidgetPositionPreference.ABOVE;
			// }

			if (this._renderingAbove === ContentWidgetPositionPreference.ABOVE) {
				this._resizableElement.domNode.style.top = this._initialTop - (height - this._initialHeight) + 'px';
			}

			this._onDidResize.fire({ dimension: this._size, done: false });

			console.log('this._containingWidget : ', this._containingWidget);

			if (!this._containingWidget) {
				return;
			}


			this._maxRenderingHeight = this._containingWidget.findMaxRenderingHeight(this._renderingAbove);
			console.log('this._maxRenderingHeight : ', this._maxRenderingHeight);
			if (!this._maxRenderingHeight) {
				return;
			}
			this._resizableElement.minSize = new dom.Dimension(10, 24);
			this._resizableElement.maxSize = new dom.Dimension(maxWidth, this._maxRenderingHeight);

			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
				if (!this._editor.hasModel()) {
					return;
				}
				const uri = this._editor.getModel().uri.toString();
				if (!uri) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				if (!this._tooltipPosition) {
					return;
				}
				const wordPosition = this._editor.getModel().getWordAtPosition(this._tooltipPosition);
				if (!wordPosition) {
					return;
				}
				const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				if (!this._persistedHoverWidgetSizes.get(uri)) {
					const map = new Map<string, dom.Dimension>([]);
					map.set(JSON.stringify([offset, length]), persistedSize);
					this._persistedHoverWidgetSizes.set(uri, map);
				} else {
					console.log('saving the new persist size');
					const map = this._persistedHoverWidgetSizes.get(uri)!;
					map.set(JSON.stringify([offset, length]), persistedSize);
				}
			}
			if (e.done) {
				console.log('Inside of the case when done');
				this._resizing = false;
			}
			console.log('Before layout overlay widget of the onDidResize listener');
			this._editor.layoutOverlayWidget(this);
			this._editor.render();

		}));
		state = undefined;
	}

	public get size(): dom.Dimension | null {
		return this._size;
	}

	public get initialTop(): number {
		return this._initialTop;
	}

	public get initialHeight(): number {
		return this._initialTop;
	}

	public set containingWidget(containingWidget: ContentHoverWidget) {
		console.log('setting the containing widget');
		this._containingWidget = containingWidget;
	}

	public findPersistedSize(): dom.Dimension | undefined {
		if (!this._tooltipPosition) {
			return;
		}
		const wordPosition = this._editor.getModel()?.getWordAtPosition(this._tooltipPosition);
		if (!wordPosition || !this._editor.hasModel()) {
			return;
		}
		const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this._editor.getModel().uri.toString();
		const textModelMap = this._persistedHoverWidgetSizes.get(uri);
		if (!textModelMap) {
			return;
		}
		console.log('Inside of findPersistedSize');
		console.log('[offset, length] : ', [offset, length]);
		return textModelMap.get(JSON.stringify([offset, length]));
	}

	public isResizing(): boolean {
		return this._resizing;
	}

	public hide(): void {
		console.log('hiding the resizable hover overlay');
		this._resizableElement.enableSashes(false, false, false, false);
		this._resizableElement.clearSashHoverState();
		this._resizableElement.maxSize = new dom.Dimension(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
		this._visible = false;
		this._resizing = false;
		this._editor.removeOverlayWidget(this);
		this._editor.render();
	}

	public resizableElement(): ResizableHTMLElement {
		return this._resizableElement;
	}

	public getId(): string {
		return ResizableHoverOverlay.ID;
	}

	public getDomNode(): HTMLElement {
		console.log('Inside of getDomNode() of ResizableHoverOverlay');
		return this._resizableElement.domNode;
	}

	public setToooltipPosition(position: IPosition): void {
		console.log('Inside of setTooltipPosition of ResizableHOverOverlay');
		console.log('this._position : ', this._tooltipPosition);
		this._tooltipPosition = position;
	}

	public setPosition(renderingPosition: IOverlayWidgetPosition): void {
		this._renderingPosition = renderingPosition;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		console.log('Inside of getPosition of ResizableHoverOverlay');
		console.log('this._renderingPosition : ', this._renderingPosition);
		return this._renderingPosition;
	}

	public showAt(position: any, size: dom.Dimension, renderingAbove: boolean): void {
		console.log('Inside of showAt of ResizableHoverOverlay');
		console.log('Before adding overlay widget');

		let resizableWidgetDomNode = this.getDomNode();
		console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
		console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
		console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
		console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
		console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

		this._visible = true;
		this._editor.addOverlayWidget(this);
		console.log('After adding overlay widget');
		resizableWidgetDomNode = this.getDomNode();
		console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
		console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
		console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
		console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
		console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

		this._renderingAbove = renderingAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

		if (renderingAbove) {
			this._resizableElement.enableSashes(true, true, false, false);
		} else {
			this._resizableElement.enableSashes(false, true, true, false);
		}

		this._resizableElement.domNode.style.top = position.clientTop - 2 + 'px';
		this._resizableElement.domNode.style.left = position.clientLeft - 2 + 'px';
		this._resizableElement.domNode.style.zIndex = '5';
		this._resizableElement.domNode.tabIndex = 0;
		this._resizableElement.domNode.style.position = 'fixed';
		this._resizableElement.domNode.style.height = size.height + 7 + 'px';
		this._resizableElement.domNode.style.width = size.width + 7 + 'px';
		this._resizableElement.layout(size.height, size.width);

		console.log('After style change of overlay widget');
		resizableWidgetDomNode = this.getDomNode();
		console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
		console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
		console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
		console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
		console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

		this._editor.layoutOverlayWidget(this);
		console.log('After layout overlay widget');
		resizableWidgetDomNode = this.getDomNode();
		console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
		console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
		console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
		console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
		console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);

		this._editor.render();
		console.log('After render');
		resizableWidgetDomNode = this.getDomNode();
		console.log('resizableWidgetDomNode : ', resizableWidgetDomNode);
		console.log('resizableWidgetDomNode client width : ', resizableWidgetDomNode.clientWidth);
		console.log('resizableWidgetDomNode client height : ', resizableWidgetDomNode.clientHeight);
		console.log('resizableWidgetDomNode offset top : ', resizableWidgetDomNode.offsetTop);
		console.log('resizableWidgetDomNode offset left : ', resizableWidgetDomNode.offsetLeft);
	}

}

export class ContentHoverWidget extends Disposable implements IContentWidget {

	static readonly ID = 'editor.contrib.contentHoverWidget';

	public readonly allowEditorOverflow = true;

	public readonly _hover: HoverWidget = this._register(new HoverWidget());
	private _visibleData: ContentHoverVisibleData | null = null;
	private readonly _hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly _hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly _focusTracker = this._register(dom.trackFocus(this.getDomNode()));
	private _renderingType: ContentWidgetPositionPreference = this._editor.getOption(EditorOption.hover).above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;

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

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
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

	public resize(size: dom.Dimension | null) {
		this._hover.contentsDomNode.style.maxHeight = 'none';
		this._hover.contentsDomNode.style.maxWidth = 'none';
		console.log('Inside of the resize of the content hover widget');
		if (!size) {
			return;
		}
		this._hover.containerDomNode.style.width = size.width - 6 + 'px';
		this._hover.containerDomNode.style.height = size.height - 6 + 'px';
		this._hover.contentsDomNode.style.width = size.width - 6 + 'px';
		this._hover.contentsDomNode.style.height = size.height - 6 + 'px';
		this._editor.layoutContentWidget(this);
		this._editor.render();
		this._hover.scrollbar.scanDomNode();
	}

	public getSize() {
		return new dom.Dimension(this._hover.containerDomNode.clientWidth, this._hover.containerDomNode.clientHeight);
	}

	public findMaxRenderingHeight(rendering: ContentWidgetPositionPreference): number | undefined {
		console.log('rendering : ', rendering);
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		if (!this._visibleData?.showAtPosition) {
			return;
		}
		const mouseBox = this._editor.getScrolledVisiblePosition(this._visibleData?.showAtPosition);
		const bodyBox = dom.getClientArea(document.body);
		let availableSpace: number;

		if (rendering === ContentWidgetPositionPreference.ABOVE) {
			availableSpace = editorBox.top + mouseBox.top - 30;
		} else {
			const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
			availableSpace = bodyBox.height - mouseBottom;
		}
		console.log('availableSpace : ', availableSpace);
		let actualMaxHeight = 0;
		for (const childHtmlElement of this._hover.contentsDomNode.children) {
			actualMaxHeight += childHtmlElement.clientHeight;
		}
		console.log('actual max height : ', actualMaxHeight);
		const maxRenderingHeight = Math.min(availableSpace, actualMaxHeight + 7);
		console.log('maxRenderingHeight : ', maxRenderingHeight);
		return maxRenderingHeight;
	}

	public override dispose(): void {
		console.log('Inside of dispose of the ContentHoverWidget');
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
		console.log('Inside of getPosition of ContentHoverWidget');
		if (!this._visibleData) {
			console.log('Early return');
			return null;
		}
		let preferAbove = this._visibleData.preferAbove;
		if (!preferAbove && this._contextKeyService.getContextKeyValue<boolean>(SuggestContext.Visible.key)) {
			// Prefer rendering above if the suggest widget is visible
			preferAbove = true;
		}

		// :before content can align left of the text content
		const affinity = this._visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		// Instead use a specfic preference as to the rendering and do not have it dynamically change
		return {
			position: this._visibleData.showAtPosition,
			secondaryPosition: this._visibleData.showAtSecondaryPosition,
			preference: ([this._renderingType]),
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

		console.log(' * Entered into showAt of ContentHoverWidget');
		this._setVisibleData(visibleData);

		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._hover.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		console.log('* Before the first onContentsChanged of showAt of ContentHoverWidget');
		this.onContentsChanged();

		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();

		const containerDomNode = this.getDomNode();
		let height;

		if (persistedSize) {
			height = persistedSize.height;
		} else {
			height = containerDomNode.clientHeight;
			this._hover.contentsDomNode.style.maxHeight = `${Math.max(this._editor.getLayoutInfo().height / 4, 250)}px`;
			this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
		}

		console.log('containerDomNode : ', containerDomNode);
		console.log('containerDomNode client width : ', containerDomNode.clientWidth);
		console.log('containerDomNode client height : ', containerDomNode.clientHeight);
		console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
		console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);

		console.log('* After render inside of showAt of ContentHoverWidget');

		// TODO: Should be added in the final rendering after the persisted size is used, because that is the one that should be applied
		/** Specifying the side on which to render the content hover **/
		// Initial height is not used without persisting

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
		if (this._editor.getOption(EditorOption.hover).above) {
			this._renderingType = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			this._renderingType = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}

		/** End of specifying the side on which to render **/
		// specify the rendering position here

		const contentsDomNode = this.getContentsDomNode();
		console.log('contentsDomNode : ', contentsDomNode);
		console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
		console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
		console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
		console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);


		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		console.log('* Before the second onContentsChanged of showAt of ContentHoverWidget');
		this.onContentsChanged();

		if (visibleData.stoleFocus) {
			this._hover.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();
	}

	public hide(): void {
		console.log('Inside of hide of the content hover widget');
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

		console.log('* Inside of contents changed');
		console.log('* Before changes');
		let containerDomNode = this.getDomNode();
		console.log('containerDomNode : ', containerDomNode);
		console.log('containerDomNode client width : ', containerDomNode.clientWidth);
		console.log('containerDomNode client height : ', containerDomNode.clientHeight);
		console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
		console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
		let contentsDomNode = this.getContentsDomNode();
		console.log('contentsDomNode : ', contentsDomNode);
		console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
		console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
		console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
		console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);

		console.log('persisted size : ', persistedSize);

		// Added here but does not seem to have an effect
		if (persistedSize) {
			containerDomNode.style.width = persistedSize.width - 8 + 'px';
			containerDomNode.style.height = persistedSize.height - 8 + 'px';
			// this._editor.addContentWidget(this._widget);
			// this._editor.layoutContentWidget(this._widget);
			// this._editor.render();
		} else {
			containerDomNode.style.width = 'auto';
			containerDomNode.style.height = 'auto';
			contentsDomNode.style.width = 'auto';
			contentsDomNode.style.height = 'auto';
		}

		this._editor.layoutContentWidget(this);

		console.log('* After layout content widget');
		containerDomNode = this.getDomNode();
		console.log('containerDomNode : ', containerDomNode);
		console.log('containerDomNode client width : ', containerDomNode.clientWidth);
		console.log('containerDomNode client height : ', containerDomNode.clientHeight);
		console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
		console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
		contentsDomNode = this.getContentsDomNode();
		console.log('contentsDomNode : ', contentsDomNode);
		console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
		console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
		console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
		console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);

		this._hover.onContentsChanged();

		console.log('* After hover on contents changed');
		containerDomNode = this.getDomNode();
		console.log('containerDomNode : ', containerDomNode);
		console.log('containerDomNode client width : ', containerDomNode.clientWidth);
		console.log('containerDomNode client height : ', containerDomNode.clientHeight);
		console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
		console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
		contentsDomNode = this.getContentsDomNode();
		console.log('contentsDomNode : ', contentsDomNode);
		console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
		console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
		console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
		console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				this._editor.layoutContentWidget(this);
				this._hover.onContentsChanged();
			}
		}

		console.log('* After changes');
		containerDomNode = this.getDomNode();
		console.log('containerDomNode : ', containerDomNode);
		console.log('containerDomNode client width : ', containerDomNode.clientWidth);
		console.log('containerDomNode client height : ', containerDomNode.clientHeight);
		console.log('containerDomNode offset top : ', containerDomNode.offsetTop);
		console.log('containerDomNode offset left : ', containerDomNode.offsetLeft);
		contentsDomNode = this.getContentsDomNode();
		console.log('contentsDomNode : ', contentsDomNode);
		console.log('contentsDomNode client width : ', contentsDomNode.clientWidth);
		console.log('contentsDomNode client height : ', contentsDomNode.clientHeight);
		console.log('contentsDomNode offset top : ', contentsDomNode.offsetTop);
		console.log('contentsDomNode offset left : ', contentsDomNode.offsetLeft);
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
