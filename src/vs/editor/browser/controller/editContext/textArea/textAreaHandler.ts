/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./textAreaHandler';
import * as browser from 'vs/base/browser/browser';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as platform from 'vs/base/common/platform';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { CopyOptions, ICompositionData, IPasteData, ITextAreaInputHost, TextAreaInput, ClipboardDataToCopy, TextAreaWrapper } from 'vs/editor/browser/controller/editContext/textArea/textAreaInput';
import { ITypeData, TextAreaState, _debugComposition } from 'vs/editor/browser/controller/editContext/textArea/textAreaState';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { LineNumbersOverlay } from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import { Margin } from 'vs/editor/browser/viewParts/margin/margin';
import { RenderLineNumbersType, EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { RenderingContext, RestrictedRenderingContext, HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { Color } from 'vs/base/common/color';
import { IME } from 'vs/base/common/ime';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { canUseZeroSizeTextarea, ensureReadOnlyAttribute, getScreenReaderContent, IRenderData, IVisibleRangeProvider, measureText, newlinecount, setAccessibilityOptions, setAriaOptions, setAttributes, VisibleTextAreaData } from 'vs/editor/browser/controller/editContext/editContextUtils';

// TODO: verify all of the code here and check what is needed in the other native edit context code and what is not needed. Do a full port of the code there. Use vscode2 in order to understand what the code is used for and if I need it.
// TODO: once that is done and the port is done, then check that with NVDA works as expected and voice over as compared to normal code
// TODO: then do IME scenarios.

export class TextAreaContext extends AbstractEditContext {

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

	public readonly textArea: FastDomNode<HTMLTextAreaElement>;
	public readonly textAreaCover: FastDomNode<HTMLElement>;
	private readonly _textAreaInput: TextAreaInput;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		visibleRangeProvider: IVisibleRangeProvider,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
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

		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = createFastDomNode(document.createElement('textarea'));
		PartFingerprints.write(this.textArea, PartFingerprint.TextArea);
		this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		const { tabSize } = this._context.viewModel.model.getOptions();
		setAttributes(this.textArea.domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		ensureReadOnlyAttribute(this.textArea.domNode, options);

		// TODO: The text area cover is used because otherwise the text area is not detected when it is hidden should be ported too
		this.textAreaCover = createFastDomNode(document.createElement('div'));
		this.textAreaCover.setPosition('absolute');

		const textAreaInputHost: ITextAreaInputHost = {
			getDataToCopy: (): ClipboardDataToCopy => {
				const rawTextToCopy = this._context.viewModel.getPlainTextToCopy(this._modelSelections, this._emptySelectionClipboard, platform.isWindows);
				const newLineCharacter = this._context.viewModel.model.getEOL();

				const isFromEmptySelection = (this._emptySelectionClipboard && this._modelSelections.length === 1 && this._modelSelections[0].isEmpty());
				const multicursorText = (Array.isArray(rawTextToCopy) ? rawTextToCopy : null);
				const text = (Array.isArray(rawTextToCopy) ? rawTextToCopy.join(newLineCharacter) : rawTextToCopy);

				let html: string | null | undefined = undefined;
				let mode: string | null = null;
				if (CopyOptions.forceCopyWithSyntaxHighlighting || (this._copyWithSyntaxHighlighting && text.length < 65536)) {
					const richText = this._context.viewModel.getRichTextToCopy(this._modelSelections, this._emptySelectionClipboard);
					if (richText) {
						html = richText.html;
						mode = richText.mode;
					}
				}
				return {
					isFromEmptySelection,
					multicursorText,
					text,
					html,
					mode
				};
			},
			getScreenReaderContent: (): TextAreaState => {
				return getScreenReaderContent(this._context, this._selections[0], this._accessibilitySupport, this._accessibilityPageSize);
			},

			deduceModelPosition: (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position => {
				return this._context.viewModel.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
			}
		};

		const textAreaWrapper = this._register(new TextAreaWrapper(this.textArea.domNode));
		this._textAreaInput = this._register(this._instantiationService.createInstance(TextAreaInput, textAreaInputHost, textAreaWrapper, platform.OS, {
			isAndroid: browser.isAndroid,
			isChrome: browser.isChrome,
			isFirefox: browser.isFirefox,
			isSafari: browser.isSafari,
		}));

		this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {
			this._viewController.emitKeyDown(e);
		}));

		this._register(this._textAreaInput.onKeyUp((e: IKeyboardEvent) => {
			this._viewController.emitKeyUp(e);
		}));

		this._register(this._textAreaInput.onPaste((e: IPasteData) => {
			let pasteOnNewLine = false;
			let multicursorText: string[] | null = null;
			let mode: string | null = null;
			if (e.metadata) {
				pasteOnNewLine = (this._emptySelectionClipboard && !!e.metadata.isFromEmptySelection);
				multicursorText = (typeof e.metadata.multicursorText !== 'undefined' ? e.metadata.multicursorText : null);
				mode = e.metadata.mode;
			}
			this._viewController.paste(e.text, pasteOnNewLine, multicursorText, mode);
		}));

		this._register(this._textAreaInput.onCut(() => {
			this._viewController.cut();
		}));

		this._register(this._textAreaInput.onType((e: ITypeData) => {
			if (e.replacePrevCharCnt || e.replaceNextCharCnt || e.positionDelta) {
				// must be handled through the new command
				if (_debugComposition) {
					console.log(` => compositionType: <<${e.text}>>, ${e.replacePrevCharCnt}, ${e.replaceNextCharCnt}, ${e.positionDelta}`);
				}
				this._viewController.compositionType(e.text, e.replacePrevCharCnt, e.replaceNextCharCnt, e.positionDelta);
			} else {
				if (_debugComposition) {
					console.log(` => type: <<${e.text}>>`);
				}
				this._viewController.type(e.text);
			}
		}));

		this._register(this._textAreaInput.onSelectionChangeRequest((modelSelection: Selection) => {
			this._viewController.setSelection(modelSelection);
		}));

		this._register(this._textAreaInput.onCompositionStart((e) => {

			// The textarea might contain some content when composition starts.
			//
			// When we make the textarea visible, it always has a height of 1 line,
			// so we don't need to worry too much about content on lines above or below
			// the selection.
			//
			// However, the text on the current line needs to be made visible because
			// some IME methods allow to move to other glyphs on the current line
			// (by pressing arrow keys).
			//
			// (1) The textarea might contain only some parts of the current line,
			// like the word before the selection. Also, the content inside the textarea
			// can grow or shrink as composition occurs. We therefore anchor the textarea
			// in terms of distance to a certain line start and line end.
			//
			// (2) Also, we should not make \t characters visible, because their rendering
			// inside the <textarea> will not align nicely with our rendering. We therefore
			// will hide (if necessary) some of the leading text on the current line.

			const ta = this.textArea.domNode;
			const modelSelection = this._modelSelections[0];

			const { distanceToModelLineStart, widthOfHiddenTextBefore } = (() => {
				// Find the text that is on the current line before the selection
				const textBeforeSelection = ta.value.substring(0, Math.min(ta.selectionStart, ta.selectionEnd));
				const lineFeedOffset1 = textBeforeSelection.lastIndexOf('\n');
				const lineTextBeforeSelection = textBeforeSelection.substring(lineFeedOffset1 + 1);

				// We now search to see if we should hide some part of it (if it contains \t)
				const tabOffset1 = lineTextBeforeSelection.lastIndexOf('\t');
				const desiredVisibleBeforeCharCount = lineTextBeforeSelection.length - tabOffset1 - 1;
				const startModelPosition = modelSelection.getStartPosition();
				const visibleBeforeCharCount = Math.min(startModelPosition.column - 1, desiredVisibleBeforeCharCount);
				const distanceToModelLineStart = startModelPosition.column - 1 - visibleBeforeCharCount;
				const hiddenLineTextBefore = lineTextBeforeSelection.substring(0, lineTextBeforeSelection.length - visibleBeforeCharCount);
				const { tabSize } = this._context.viewModel.model.getOptions();
				const widthOfHiddenTextBefore = measureText(this.textArea.domNode.ownerDocument, hiddenLineTextBefore, this._fontInfo, tabSize);

				return { distanceToModelLineStart, widthOfHiddenTextBefore };
			})();

			const { distanceToModelLineEnd } = (() => {
				// Find the text that is on the current line after the selection
				const textAfterSelection = ta.value.substring(Math.max(ta.selectionStart, ta.selectionEnd));
				const lineFeedOffset2 = textAfterSelection.indexOf('\n');
				const lineTextAfterSelection = lineFeedOffset2 === -1 ? textAfterSelection : textAfterSelection.substring(0, lineFeedOffset2);

				const tabOffset2 = lineTextAfterSelection.indexOf('\t');
				const desiredVisibleAfterCharCount = (tabOffset2 === -1 ? lineTextAfterSelection.length : lineTextAfterSelection.length - tabOffset2 - 1);
				const endModelPosition = modelSelection.getEndPosition();
				const visibleAfterCharCount = Math.min(this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column, desiredVisibleAfterCharCount);
				const distanceToModelLineEnd = this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column - visibleAfterCharCount;

				return { distanceToModelLineEnd };
			})();

			// Scroll to reveal the location in the editor where composition occurs
			this._context.viewModel.revealRange(
				'keyboard',
				true,
				Range.fromPositions(this._selections[0].getStartPosition()),
				viewEvents.VerticalRevealType.Simple,
				ScrollType.Immediate
			);

			this._visibleTextArea = new VisibleTextAreaData(
				this._context,
				modelSelection.startLineNumber,
				distanceToModelLineStart,
				widthOfHiddenTextBefore,
				distanceToModelLineEnd,
			);

			// We turn off wrapping if the <textarea> becomes visible for composition
			this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');

			this._visibleTextArea.prepareRender(this._visibleRangeProvider);
			this._render();

			// Show the textarea
			this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);

			this._viewController.compositionStart();
			this._context.viewModel.onCompositionStart();
		}));

		this._register(this._textAreaInput.onCompositionUpdate((e: ICompositionData) => {
			if (!this._visibleTextArea) {
				return;
			}

			this._visibleTextArea.prepareRender(this._visibleRangeProvider);
			this._render();
		}));

		this._register(this._textAreaInput.onCompositionEnd(() => {

			this._visibleTextArea = null;

			// We turn on wrapping as necessary if the <textarea> hides after composition
			this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');

			this._render();

			this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
			this._viewController.compositionEnd();
			this._context.viewModel.onCompositionEnd();
		}));

		this._register(this._textAreaInput.onFocus(() => {
			this._context.viewModel.setHasFocus(true);
		}));

		this._register(this._textAreaInput.onBlur(() => {
			this._context.viewModel.setHasFocus(false);
		}));

		this._register(IME.onDidChange(() => {
			ensureReadOnlyAttribute(this.textArea.domNode, options);
		}));
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this.textArea);
		// TODO: maybe need to also place the text area cover when this will be needed
		overflowGuardContainer.appendChild(this.textAreaCover);
	}

	public writeScreenReaderContent(reason: string): void {
		this._textAreaInput.writeNativeTextAreaContent(reason);
	}

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

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
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
		setAttributes(this.textArea.domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
			ensureReadOnlyAttribute(this.textArea.domNode, options);
		}

		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._textAreaInput.writeNativeTextAreaContent('strategy changed');
		}

		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		this._modelSelections = e.modelSelections.slice(0);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this._textAreaInput.writeNativeTextAreaContent('selection changed');
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollLeft = e.scrollLeft;
		this._scrollTop = e.scrollTop;
		return true;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	// --- begin view API

	public isFocused(): boolean {
		return this._textAreaInput.isFocused();
	}

	public focusTextArea(): void {
		this._textAreaInput.focusTextArea();
	}

	public refreshFocusState() {
		this._textAreaInput.refreshFocusState();
	}

	public getLastRenderData(): Position | null {
		return this._lastRenderPosition;
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		setAriaOptions(this.textArea.domNode, options);
	}

	// --- end view API

	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
		this._visibleTextArea?.prepareRender(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._textAreaInput.writeNativeTextAreaContent('render');
		this._render();
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
				const lineCount = newlinecount(this.textArea.domNode.value.substr(0, this.textArea.domNode.selectionStart));

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

				this.textArea.domNode.scrollTop = lineCount * this._lineHeight;
				this.textArea.domNode.scrollLeft = scrollLeft;

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
			this.textArea.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
			const lineCount = this._textAreaInput.textAreaState.newlineCountBeforeSelection ?? newlinecount(this.textArea.domNode.value.substr(0, this.textArea.domNode.selectionStart));
			this.textArea.domNode.scrollTop = lineCount * this._lineHeight;
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

		const ta = this.textArea;
		const tac = this.textAreaCover;

		applyFontInfo(ta, this._fontInfo);
		ta.setTop(renderData.top);
		ta.setLeft(renderData.left);
		ta.setWidth(renderData.width);
		ta.setHeight(renderData.height);

		ta.setColor(renderData.color ? Color.Format.CSS.formatHex(renderData.color) : '');
		ta.setFontStyle(renderData.italic ? 'italic' : '');
		if (renderData.bold) {
			// fontWeight is also set by `applyFontInfo`, so only overwrite it if necessary
			ta.setFontWeight('bold');
		}
		ta.setTextDecoration(`${renderData.underline ? ' underline' : ''}${renderData.strikethrough ? ' line-through' : ''}`);

		tac.setTop(renderData.useCover ? renderData.top : 0);
		tac.setLeft(renderData.useCover ? renderData.left : 0);
		tac.setWidth(renderData.useCover ? renderData.width : 0);
		tac.setHeight(renderData.useCover ? renderData.height : 0);

		const options = this._context.configuration.options;

		if (options.get(EditorOption.glyphMargin)) {
			tac.setClassName('monaco-editor-background textAreaCover ' + Margin.OUTER_CLASS_NAME);
		} else {
			if (options.get(EditorOption.lineNumbers).renderType !== RenderLineNumbersType.Off) {
				tac.setClassName('monaco-editor-background textAreaCover ' + LineNumbersOverlay.CLASS_NAME);
			} else {
				tac.setClassName('monaco-editor-background textAreaCover');
			}
		}
	}
}
