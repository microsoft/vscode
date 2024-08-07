/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { HorizontalPosition, RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit, TextEdit, LineBasedText } from 'vs/editor/common/core/textEdit';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent, ViewDecorationsChangedEvent, ViewFlushedEvent, ViewLinesChangedEvent, ViewLinesDeletedEvent, ViewLinesInsertedEvent, ViewScrollChangedEvent, ViewTokensChangedEvent, ViewZonesChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as dom from 'vs/base/browser/dom';
import { Selection } from 'vs/editor/common/core/selection';
import { canUseZeroSizeTextarea, ensureReadOnlyAttribute, getScreenReaderContent, IRenderData, IVisibleRangeProvider, newlinecount, setAccessibilityOptions, setAriaOptions, setAttributes, VisibleTextAreaData } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { TextAreaState } from 'vs/editor/browser/controller/editContext/textArea/textAreaState';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import * as platform from 'vs/base/common/platform';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { Color } from 'vs/base/common/color';

// TODO: use the pagination strategy to render the hidden area
// TODO: refactor the code
// TODO: test accessibility on NVDA with Windows

// add a native edit context input and make it as most similar as possible to the other implementation

export class NativeEditContext extends AbstractEditContext {

	private readonly _viewController: ViewController;
	private readonly _visibleRangeProvider: IVisibleRangeProvider;
	private _scrollLeft: number;
	private _scrollTop: number;

	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;
	private _textAreaWrapping!: boolean;
	private _textAreaWidth!: number;
	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _fontInfo: FontInfo;
	private _lineHeight: number;
	private _emptySelectionClipboard: boolean;
	private _copyWithSyntaxHighlighting: boolean;

	/**
	 * Defined only when the text area is visible (composition case).
	 */
	private _visibleTextArea: VisibleTextAreaData | null;
	private _selections: Selection[];
	private _modelSelections: Selection[];

	/**
	 * The position at which the textarea was rendered.
	 * This is useful for hit-testing and determining the mouse position.
	 */
	private _lastRenderPosition: Position | null;

	// TODO: uncomment when the div cover will be needed
	// public readonly divCover: FastDomNode<HTMLElement>;
	private readonly _nativeEditContextInput: NativeEditContextInput | undefined; // actually defined

	// ---
	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new EditContext();
	private _editContextState: EditContextState | undefined;

	// Following is probably not needed
	private _isFocused = false;
	private _previousSelection: Selection | undefined;
	private _previousHiddenAreaValue: string | undefined;

	// Development variables, remove later
	private _parent!: HTMLElement;
	private _selectionBoundsElement: HTMLElement | undefined;
	private _controlBoundsElement: HTMLElement | undefined;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		visibleRangeProvider: IVisibleRangeProvider,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(context);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._setAccessibilityOptions(options);

		this._viewController = viewController;
		this._visibleRangeProvider = visibleRangeProvider;
		this._scrollLeft = 0;
		this._scrollTop = 0;
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this._copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);

		this._visibleTextArea = null;
		this._selections = [new Selection(1, 1, 1, 1)];
		this._modelSelections = [new Selection(1, 1, 1, 1)];
		this._lastRenderPosition = null;

		const domNode = this._domElement.domNode;
		// TODO: Do we need to add a part fingerprint here? Should this be text area or should this be something else other than text area.
		PartFingerprints.write(this._domElement, PartFingerprint.TextArea);
		domNode.className = 'native-edit-context';
		const { tabSize } = this._context.viewModel.model.getOptions();
		setAttributes(domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		ensureReadOnlyAttribute(domNode, options);

		// TODO: need to place all of this code into a separate input class which will use the edit context in order to do the corresponidng logic

		this._register(dom.addDisposableListener(domNode, 'focus', () => {
			this._isFocused = true;
			// Is the below correct?
			this._context.viewModel.setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(domNode, 'blur', () => {
			this._isFocused = false;
			// Is the below correct?
			this._context.viewModel.setHasFocus(false);
		}));
		let copiedText: string | undefined;
		this._register(dom.addDisposableListener(domNode, 'copy', () => {
			if (this._previousSelection) {
				copiedText = '';
				const numberOfLinesToCopy = this._previousSelection.endLineNumber - this._previousSelection.startLineNumber;
				for (let i = 0; i <= numberOfLinesToCopy; i++) {
					const childElement = this._domElement.domNode.children.item(i);
					if (!childElement) {
						continue;
					}
					if (i === 0) {
						const startColumn = this._previousSelection.startColumn;
						copiedText += childElement.textContent?.substring(startColumn - 1) ?? '';
					}
					else if (i === numberOfLinesToCopy) {
						const endColumn = this._previousSelection.endColumn;
						copiedText += '\n' + (childElement.textContent?.substring(0, endColumn) ?? '');
					}
					else {
						copiedText += '\n' + (childElement.textContent ?? '');
					}
				}
				console.log('copiedText : ', copiedText);
			}
		}));
		this._register(dom.addDisposableListener(domNode, 'keydown', (e) => {
			if (this._editContextState && copiedText !== undefined && e.metaKey && e.key === 'v') {
				this._handleTextUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, copiedText, 0, 0);
				copiedText = undefined;
			}
			this._viewController.emitKeyDown(new StandardKeyboardEvent(e));
		}));
		this._register(dom.addDisposableListener(domNode, 'keyup', (e) => {
			this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
		}));
		this._register(dom.addDisposableListener(domNode, 'beforeinput', (e) => {
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._handleEnter(e);
			}
		}));
		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text)));
		this._register(editContextAddDisposableListener(this._ctx, 'textformatupdate', e => this._handleTextFormatUpdate(e)));
		this._register(this._context.viewModel.model.onDidChangeContent(() => this._onDidChangeContent()));
		this._onDidChangeContent();
		// TODO - place all the above code into an input class for the native edit context which will use the EditContext where possible

		// --- developer code
		domNode.addEventListener('focus', () => {
			domNode.style.background = 'yellow';
		});
		domNode.addEventListener('blur', () => {
			domNode.style.background = 'white';
		});
	}

	// TODO: How come we have decorations here but no decorations in the text are handler?
	private _decorations: string[] = [];

	public override appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._parent = overflowGuardContainer.domNode;
	}

	// TODO: requires the native edit context input to be defined
	public override writeScreenReaderContent(reason: string): void { }

	public override dispose(): void {
		super.dispose();
	}

	private _setAccessibilityOptions(options: IComputedEditorOptions): void {
		const { accessibilitySupport, accessibilityPageSize, textAreaWrapping, textAreaWidth } = setAccessibilityOptions(options, canUseZeroSizeTextarea);
		this._accessibilitySupport = accessibilitySupport;
		this._accessibilityPageSize = accessibilityPageSize;
		this._textAreaWrapping = textAreaWrapping;
		this._textAreaWidth = textAreaWidth;
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {

		// same as in the other text are handler file
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._setAccessibilityOptions(options);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this._copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);

		const { tabSize } = this._context.viewModel.model.getOptions();
		setAttributes(this._domElement.domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
			ensureReadOnlyAttribute(this._domElement.domNode, options);
		}

		/**
		 * TODO: uncomment this when the input will be defined

		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._textAreaInput.writeNativeTextAreaContent('strategy changed');
		}
		 */

		return true;
	}

	// TODO: modify the following when we will have the input defined
	override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
		this._onDidChangeSelection(e);
		return true;
	}

	private _onDidChangeSelection(e: ViewCursorStateChangedEvent) {

		// TODO: may no longer need to rerender the hidden element on selection change because we are sending in a big block of text?
		// TODO: need to check what text is placed in the text area when selection is changed when the accessibility page size is set to a small value like 5, in order to understand the inner working of the code
		const selection = e.selections[0];
		const textAreaState = this._hiddenAreaContent(selection);
		this._rerenderHiddenAreaElementOnSelectionChange(textAreaState, selection);
		this._updateDocumentSelection(textAreaState);
		this._updateDomNodePosition(selection.startLineNumber);

		console.log('onDidChangeSelection');
		console.log('selection ; ', selection);
	}
	// ----
	public override onDecorationsChanged(e: ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public override onFlushed(e: ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: ViewLinesInsertedEvent): boolean {
		return true;
	}
	// TODO: instead of updating here the dom node position, we should save the scroll left and scroll top and update in the rendering function as done before
	override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		if (this._previousSelection?.startLineNumber === undefined) {
			return false;
		}
		this._updateDomNodePosition(this._previousSelection.startLineNumber);
		return true;
	}
	public override onZonesChanged(e: ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	// --- begin view API

	public override isFocused(): boolean {
		return this._isFocused;
	}

	public override focusTextArea(): void {
		this._domElement.domNode.focus();
	}

	// TODO: once the input will be defined
	public override refreshFocusState(): void { }

	public getLastRenderData(): Position | null {
		return this._lastRenderPosition;
	}

	public override setAriaOptions(options: IEditorAriaOptions): void {
		setAriaOptions(this._domElement.domNode, options);
	}

	// --- end view API

	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
		// TODO: prepare the render on the visible text area, does this require any change?
		this._visibleTextArea?.prepareRender(ctx);

		// --- below is new code
		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) ?? [];
		if (linesVisibleRanges.length === 0) { return; }

		const controlBoundingClientRect = this._domElement.domNode.getBoundingClientRect();
		const controlBounds = new DOMRect(
			controlBoundingClientRect.left - this._contentLeft + 19, // +19 to align with the text, need to find variable value
			controlBoundingClientRect.top - 92, // need to find variable value
			controlBoundingClientRect.width,
			controlBoundingClientRect.height,
		);
		const selectionBounds = controlBounds;
		this._ctx.updateControlBounds(controlBounds);
		this._ctx.updateSelectionBounds(selectionBounds);
		this.updateEditContext();

		// developer code
		this._renderSelectionBoundsForDevelopment(controlBounds, selectionBounds);
	}

	public override render(ctx: RestrictedRenderingContext): void {

		// Write the text area content when the input will be defined
		// this._textAreaInput.writeNativeTextAreaContent('render');
		// this._render();
	}

	private _render(): void {
		if (this._visibleTextArea) {
			// The text area is visible for composition reasons

			const visibleStart = this._visibleTextArea.visibleTextareaStart;
			const visibleEnd = this._visibleTextArea.visibleTextareaEnd;
			const startPosition = this._visibleTextArea.startPosition;
			const endPosition = this._visibleTextArea.endPosition;
			if (startPosition && endPosition && visibleStart && visibleEnd && visibleEnd.left >= this._scrollLeft && visibleStart.left <= this._scrollLeft + this._contentWidth) {
				const top = (this._context.viewLayout.getVerticalOffsetForLineNumber(this._primaryCursorPosition.lineNumber) - this._scrollTop);
				const textContent = this._domElement.domNode.textContent;
				if (textContent === null) {
					return;
				}
				const lineCount = newlinecount(textContent.substring(0, 100)); // this._domElement.domNode.selectionStart

				let scrollLeft = this._visibleTextArea.widthOfHiddenLineTextBefore;
				let left = (this._contentLeft + visibleStart.left - this._scrollLeft);
				// See https://github.com/microsoft/vscode/issues/141725#issuecomment-1050670841
				// Here we are adding +1 to avoid flickering that might be caused by having a width that is too small.
				// This could be caused by rounding errors that might only show up with certain font families.
				// In other words, a pixel might be lost when doing something like
				//      `Math.round(end) - Math.round(start)`
				// vs
				//      `Math.round(end - start)`
				let width = visibleEnd.left - visibleStart.left + 1;
				if (left < this._contentLeft) {
					// the textarea would be rendered on top of the margin,
					// so reduce its width. We use the same technique as
					// for hiding text before
					const delta = (this._contentLeft - left);
					left += delta;
					scrollLeft += delta;
					width -= delta;
				}
				if (width > this._contentWidth) {
					// the textarea would be wider than the content width,
					// so reduce its width.
					width = this._contentWidth;
				}

				// Try to render the textarea with the color/font style to match the text under it
				const viewLineData = this._context.viewModel.getViewLineData(startPosition.lineNumber);
				const startTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(startPosition.column - 1);
				const endTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(endPosition.column - 1);
				const textareaSpansSingleToken = (startTokenIndex === endTokenIndex);
				const presentation = this._visibleTextArea.definePresentation(
					(textareaSpansSingleToken ? viewLineData.tokens.getPresentation(startTokenIndex) : null)
				);

				this._domElement.domNode.scrollTop = lineCount * this._lineHeight;
				this._domElement.domNode.scrollLeft = scrollLeft;

				this._doRender({
					lastRenderPosition: null,
					top: top,
					left: left,
					width: width,
					height: this._lineHeight,
					useCover: false,
					color: (TokenizationRegistry.getColorMap() || [])[presentation.foreground],
					italic: presentation.italic,
					bold: presentation.bold,
					underline: presentation.underline,
					strikethrough: presentation.strikethrough
				});
			}
			return;
		}

		if (!this._primaryCursorVisibleRange) {
			// The primary cursor is outside the viewport => place textarea to the top left
			this._renderAtTopLeft();
			return;
		}

		const left = this._contentLeft + this._primaryCursorVisibleRange.left - this._scrollLeft;
		if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._selections[0].positionLineNumber) - this._scrollTop;
		if (top < 0 || top > this._contentHeight) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		// The primary cursor is in the viewport (at least vertically) => place textarea on the cursor

		if (platform.isMacintosh || this._accessibilitySupport === AccessibilitySupport.Enabled) {
			// For the popup emoji input, we will make the text area as high as the line height
			// We will also make the fontSize and lineHeight the correct dimensions to help with the placement of these pickers
			this._doRender({
				lastRenderPosition: this._primaryCursorPosition,
				top,
				left: this._textAreaWrapping ? this._contentLeft : left,
				width: this._textAreaWidth,
				height: this._lineHeight,
				useCover: false
			});
			// In case the textarea contains a word, we're going to try to align the textarea's cursor
			// with our cursor by scrolling the textarea as much as possible
			this._domElement.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
			const textContent = this._domElement.domNode.textContent;
			if (textContent === null) {
				return;
			}
			// TODO: need to uncomment when the native edit input is defined
			// const lineCount = this._textAreaInput.textAreaState.newlineCountBeforeSelection ?? this._newlinecount(textContent.substring(0, 100)); // this._domElement.domNode.selectionStart
			const lineCount = 100;
			this._domElement.domNode.scrollTop = lineCount * this._lineHeight;
			return;
		}

		this._doRender({
			lastRenderPosition: this._primaryCursorPosition,
			top: top,
			left: this._textAreaWrapping ? this._contentLeft : left,
			width: this._textAreaWidth,
			height: (canUseZeroSizeTextarea ? 0 : 1),
			useCover: false
		});
	}

	private _renderAtTopLeft(): void {
		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		// specifically, when doing Korean IME, setting the textarea to 0x0 breaks IME badly.
		this._doRender({
			lastRenderPosition: null,
			top: 0,
			left: 0,
			width: this._textAreaWidth,
			height: (canUseZeroSizeTextarea ? 0 : 1),
			useCover: true
		});
	}

	private _doRender(renderData: IRenderData): void {
		this._lastRenderPosition = renderData.lastRenderPosition;

		applyFontInfo(this._domElement, this._fontInfo);
		this._domElement.setTop(renderData.top);
		this._domElement.setLeft(renderData.left);
		this._domElement.setWidth(renderData.width);
		this._domElement.setHeight(renderData.height);

		this._domElement.setColor(renderData.color ? Color.Format.CSS.formatHex(renderData.color) : '');
		this._domElement.setFontStyle(renderData.italic ? 'italic' : '');
		if (renderData.bold) {
			// fontWeight is also set by `applyFontInfo`, so only overwrite it if necessary
			this._domElement.setFontWeight('bold');
		}
		this._domElement.setTextDecoration(`${renderData.underline ? ' underline' : ''}${renderData.strikethrough ? ' line-through' : ''}`);

		/*
		TODO: Do we need the text area cover?

		const tac = this.textAreaCover;
		const options = this._context.configuration.options;

		tac.setTop(renderData.useCover ? renderData.top : 0);
		tac.setLeft(renderData.useCover ? renderData.left : 0);
		tac.setWidth(renderData.useCover ? renderData.width : 0);
		tac.setHeight(renderData.useCover ? renderData.height : 0);

		if (options.get(EditorOption.glyphMargin)) {
			tac.setClassName('monaco-editor-background textAreaCover ' + Margin.OUTER_CLASS_NAME);
		} else {
			if (options.get(EditorOption.lineNumbers).renderType !== RenderLineNumbersType.Off) {
				tac.setClassName('monaco-editor-background textAreaCover ' + LineNumbersOverlay.CLASS_NAME);
			} else {
				tac.setClassName('monaco-editor-background textAreaCover');
			}
		}
		*/
	}

	// --- added new below

	private _onDidChangeContent() {
		console.log('onDidChangeContent');

		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const textAreaState = this._hiddenAreaContent(selection);
		this._renderHiddenAreaElement(textAreaState, selection);
	}

	private _hiddenAreaContent(selection: Selection): TextAreaState {
		// TODO: Maybe should place into the constructor
		const options = this._context.configuration.options;
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		// TODO: uncomment this when will be sent to production
		// const accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
		const accessibilityPageSize = 10;
		const textAreaState = getScreenReaderContent(this._context, selection, accessibilitySupport, accessibilityPageSize);
		console.log('textAreaState : ', textAreaState);
		return textAreaState;
	}

	private _updateDocumentSelection(textAreaState: TextAreaState) {
		const domNode = this._domElement.domNode;
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = domNode.firstChild;
			if (firstChild) {
				range.setStart(firstChild, textAreaState.selectionStart);
				range.setEnd(firstChild, textAreaState.selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
	}

	private _rerenderHiddenAreaElementOnSelectionChange(textAreaState: TextAreaState, selection: Selection): void {
		const hiddenAreaContent = textAreaState.value;
		if (this._previousHiddenAreaValue !== hiddenAreaContent
			|| this._previousSelection?.startLineNumber !== selection.startLineNumber
			|| this._previousSelection?.endLineNumber !== selection.endLineNumber) {
			this._renderHiddenAreaElement(textAreaState, selection);
		}
		this._previousSelection = selection;
		this._previousHiddenAreaValue = hiddenAreaContent;
	}

	private _renderHiddenAreaElement(textAreaState: TextAreaState, selection: Selection): void {
		this._domElement.domNode.textContent = textAreaState.value;
		this._updateDomNodePosition(selection.startLineNumber);
	}

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {
		if (!this._editContextState) {
			return;
		}
		const formats = e.getTextFormats();
		const decorations: IModelDeltaDecoration[] = formats.map(f => {
			const r = new OffsetRange(f.rangeStart, f.rangeEnd);
			const range = this._editContextState!.textPositionTransformer.getRange(r);
			const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
			const viewModelRange = this._editContextState!.viewModelToEditContextText.inverseMapRange(range, doc);
			const modelRange = this._context.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewModelRange);
			const classNames = [
				'underline',
				`style-${f.underlineStyle.toLowerCase()}`,
				`thickness-${f.underlineThickness.toLowerCase()}`,
			];
			return {
				range: modelRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			};
		});
		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _handleEnter(e: InputEvent): void {
		if (!this._editContextState) {
			return;
		}
		e.preventDefault();
		this._handleTextUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, '\n');
	}

	private _handleTextUpdate(updateRangeStart: number, updateRangeEnd: number, text: string, _deleteBefore?: number, _deleteAfter?: number): void {
		console.log('_handleTextUpdate');
		console.log('updateRangeStart : ', updateRangeStart);
		console.log('updateRangeEnd : ', updateRangeEnd);
		console.log('text : ', text);

		if (!this._editContextState) {
			return;
		}
		const updateRange = new OffsetRange(updateRangeStart, updateRangeEnd);
		if (!updateRange.equals(this._editContextState.selection)) {
			const deleteBefore = _deleteBefore !== undefined ? _deleteBefore : this._editContextState.positionOffset - updateRangeStart;
			const deleteAfter = _deleteAfter !== undefined ? _deleteAfter : updateRangeEnd - this._editContextState.positionOffset;
			this._viewController.compositionType(text, deleteBefore, deleteAfter, 0);
		} else {
			this._viewController.type(text);
		}
		this.updateEditContext();
	}

	private updateEditContext() {

		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStart = new Position(selection.startLineNumber - 2, 1);
		const textEnd = new Position(selection.endLineNumber + 1, Number.MAX_SAFE_INTEGER);
		const textEdit = new TextEdit([
			docStart.isBefore(textStart) ? new SingleTextEdit(Range.fromPositions(docStart, textStart), '') : undefined,
			textEnd.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEnd, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const value = textEdit.apply(doc);
		const selectionStart = textEdit.mapPosition(selection.getStartPosition()) as Position;
		const selectionEnd = textEdit.mapPosition(selection.getEndPosition()) as Position;
		const position = textEdit.mapPosition(selection.getPosition()) as Position;
		const offsetTransformer = new PositionOffsetTransformer(value);
		const offsetRange = new OffsetRange((offsetTransformer.getOffset(selectionStart)), (offsetTransformer.getOffset(selectionEnd)));
		const positionOffset = offsetTransformer.getOffset(position);
		const editContextState = new EditContextState(textEdit, offsetTransformer, positionOffset, offsetRange);
		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, value);
		this._ctx.updateSelection(offsetRange.start, offsetRange.endExclusive);
		this._editContextState = editContextState;


		// Developer code
		const subContent = value.substring(offsetRange.start, offsetRange.endExclusive);
		console.log('updateEditContext');
		console.log('value : ', value);
		console.log('subcontent : ', subContent);
	}

	private _renderSelectionBoundsForDevelopment(controlBounds: DOMRect, selectionBounds: DOMRect) {
		const controlBoundsElement = document.createElement('div');
		controlBoundsElement.style.position = 'absolute';
		controlBoundsElement.style.left = `${controlBounds.left}px`;
		controlBoundsElement.style.top = `${controlBounds.top}px`;
		controlBoundsElement.style.width = `${controlBounds.width}px`;
		controlBoundsElement.style.height = `${controlBounds.height}px`;
		controlBoundsElement.style.background = `blue`;
		this._controlBoundsElement?.remove();
		this._controlBoundsElement = controlBoundsElement;

		const selectionBoundsElement = document.createElement('div');
		selectionBoundsElement.style.position = 'absolute';
		selectionBoundsElement.style.left = `${selectionBounds.left}px`;
		selectionBoundsElement.style.top = `${selectionBounds.top}px`;
		selectionBoundsElement.style.width = `${selectionBounds.width}px`;
		selectionBoundsElement.style.height = `${selectionBounds.height}px`;
		selectionBoundsElement.style.background = `green`;
		this._selectionBoundsElement?.remove();
		this._selectionBoundsElement = selectionBoundsElement;

		this._parent.appendChild(controlBoundsElement);
		this._parent.appendChild(selectionBoundsElement);

		console.log('controlBounds : ', controlBounds);
		console.log('selectionBounds : ', selectionBounds);
		console.log('controlBoundsElement : ', controlBoundsElement);
		console.log('selectionBoundsElement : ', selectionBoundsElement);
		console.log('character bounds : ', this._ctx.characterBounds());
	}

	override onTokensChanged(e: ViewTokensChangedEvent): boolean {
		this._domElement.domNode.style.fontSize = `${this._context.configuration.options.get(EditorOption.fontSize)}px`;
		return true;
	}

	private _updateDomNodePosition(startLineNumber: number): void {
		const domNode = this._domElement.domNode;
		// TODO: should not be adding 15 but doing it for the purpose of the development
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(startLineNumber + 15) - this._context.viewLayout.getCurrentScrollTop()}px`;
		domNode.style.left = `${this._contentLeft - this._context.viewLayout.getCurrentScrollLeft()}px`;
	}
}

function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}

class EditContextState {
	constructor(
		public readonly viewModelToEditContextText: TextEdit,
		public readonly textPositionTransformer: PositionOffsetTransformer,
		public readonly positionOffset: number,
		public readonly selection: OffsetRange,
	) { }
}
