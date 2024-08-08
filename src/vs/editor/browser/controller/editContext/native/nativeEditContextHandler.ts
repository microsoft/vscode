/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContextHandler';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { HorizontalPosition, RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import * as viewEvents from 'vs/editor/common/viewEvents';

import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { Selection } from 'vs/editor/common/core/selection';
import { canUseZeroSizeTextarea, ensureReadOnlyAttribute, getAndroidWordAtPosition, getCharacterBeforePosition, getWordBeforePosition, IRenderData, IVisibleRangeProvider, measureText, newlinecount, setAccessibilityOptions, setAriaOptions, setAttributes, VisibleTextAreaData } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import * as platform from 'vs/base/common/platform';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { Color } from 'vs/base/common/color';
import { _debugComposition, HiddenAreaState, ISimpleModel, ITypeData, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/editContext/editContextState';
import { ClipboardDataToCopy, CopyOptions, HiddenAreaInput, ICompositionData, IHiddenAreaInputHost, IPasteData } from 'vs/editor/browser/controller/editContext/editContextInput';
import { NativeAreaWrapper } from 'vs/editor/browser/controller/editContext/native/nativeEditContextWrapper';
import * as browser from 'vs/base/browser/browser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { Range } from 'vs/editor/common/core/range';
import { IME } from 'vs/base/common/ime';
import { EndOfLinePreference } from 'vs/editor/common/model';
import * as dom from 'vs/base/browser/dom';

// TODO
// 1. Make typing correct, the editor text is being shifted downwards for some reason
// 2. Position the div correctly
// 3. Test IME, consider adding the test cover

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
	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _hiddenAreaInput: HiddenAreaInput;

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

		// TODO: Do we need to add a part fingerprint here? Should this be text area or should this be something else other than text area.
		PartFingerprints.write(this._domElement, PartFingerprint.TextArea);
		this._domElement.setClassName('native-edit-context');
		const { tabSize } = this._context.viewModel.model.getOptions();
		setAttributes(this._domElement.domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		ensureReadOnlyAttribute(this._domElement.domNode, options);

		// maybe need to uncomment
		// this.divCover = createFastDomNode(document.createElement('div'));
		// this.divCover.setPosition('absolute');

		// In fact this simple model limits the methods that can be accessed from the view model of the context
		// otherwise it is equivalent
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};

		const hiddenAreaInputHost: IHiddenAreaInputHost = {
			getDataToCopy: (): ClipboardDataToCopy => {
				const rawTextToCopy = this._context.viewModel.getPlainTextToCopy(this._modelSelections, this._emptySelectionClipboard, platform.isWindows);
				// Method getEOL returns the end-of-line character of the viewModel
				const newLineCharacter = this._context.viewModel.model.getEOL();

				// only one selection and this unique selection is empty
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
			getScreenReaderContent: (): HiddenAreaState => {
				console.log('getScreenReaderContent');
				if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
					// We know for a fact that a screen reader is not attached
					// On OSX, we write the character before the cursor to allow for "long-press" composition
					// Also on OSX, we write the word before the cursor to allow for the Accessibility Keyboard to give good hints
					const selection = this._selections[0];
					if (platform.isMacintosh && selection.isEmpty()) {
						// main position of the selection
						const position = selection.getStartPosition();

						// Either get the character or the word before the position
						let textBefore = getWordBeforePosition(this._context, position);
						if (textBefore.length === 0) {
							textBefore = getCharacterBeforePosition(this._context.viewModel, position);
						}

						// If there is a character or word before the position, the return a text are state
						if (textBefore.length > 0) {
							console.log('1st hidden area state');
							return new HiddenAreaState(textBefore, textBefore.length, textBefore.length, Range.fromPositions(position), 0);
						}
					}
					// on macOS, write current selection into textarea will allow system text services pick selected text,
					// but we still want to limit the amount of text given Chromium handles very poorly text even of a few
					// thousand chars
					// (https://github.com/microsoft/vscode/issues/27799)
					const LIMIT_CHARS = 500;
					// We get the range of the text within the selection, and if the number of characters is smaller than 500 then get the corresponding text and return it in a text area state
					if (platform.isMacintosh && !selection.isEmpty() && simpleModel.getValueLengthInRange(selection, EndOfLinePreference.TextDefined) < LIMIT_CHARS) {
						const text = simpleModel.getValueInRange(selection, EndOfLinePreference.TextDefined);
						console.log('2nd hidden area state');
						return new HiddenAreaState(text, 0, text.length, selection, 0);
					}

					// on Safari, document.execCommand('cut') and document.execCommand('copy') will just not work
					// if the textarea has no content selected. So if there is an editor selection, ensure something
					// is selected in the textarea.
					if (browser.isSafari && !selection.isEmpty()) {
						const placeholderText = 'vscode-placeholder';
						// if nothing is selected then we send the placeholder text?
						console.log('3rd hidden area state');
						return new HiddenAreaState(placeholderText, 0, placeholderText.length, null, undefined);
					}

					console.log('4th hidden area state');
					return HiddenAreaState.EMPTY;
				}

				if (browser.isAndroid) {
					// when tapping in the editor on a word, Android enters composition mode.
					// in the `compositionstart` event we cannot clear the textarea, because
					// it then forgets to ever send a `compositionend`.
					// we therefore only write the current word in the textarea
					const selection = this._selections[0];
					if (selection.isEmpty()) {
						const position = selection.getStartPosition();
						const [wordAtPosition, positionOffsetInWord] = getAndroidWordAtPosition(this._context.viewModel, position);
						if (wordAtPosition.length > 0) {
							console.log('5th hidden area state');
							return new HiddenAreaState(wordAtPosition, positionOffsetInWord, positionOffsetInWord, Range.fromPositions(position), 0);
						}
					}
					console.log('6th hidden area state');
					return HiddenAreaState.EMPTY;
				}

				return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
			},

			deduceModelPosition: (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position => {
				return this._context.viewModel.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
			}
		};

		const nativeContextAreaWrapper = this._register(new NativeAreaWrapper(this._domElement.domNode, this._context));
		this._hiddenAreaInput = this._register(this._instantiationService.createInstance(HiddenAreaInput, hiddenAreaInputHost, nativeContextAreaWrapper, platform.OS, {
			isAndroid: browser.isAndroid,
			isChrome: browser.isChrome,
			isFirefox: browser.isFirefox,
			isSafari: browser.isSafari,
		}));

		this._register(this._hiddenAreaInput.onKeyDown((e: IKeyboardEvent) => {
			this._viewController.emitKeyDown(e);
		}));

		this._register(this._hiddenAreaInput.onKeyUp((e: IKeyboardEvent) => {
			this._viewController.emitKeyUp(e);
		}));

		this._register(this._hiddenAreaInput.onPaste((e: IPasteData) => {
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

		this._register(this._hiddenAreaInput.onCut(() => {
			this._viewController.cut();
		}));

		this._register(this._hiddenAreaInput.onType((e: ITypeData) => {
			if (e.replacePrevCharCnt || e.replaceNextCharCnt || e.positionDelta) {
				// must be handled through the new command
				if (_debugComposition) {
					console.log(` => compositionType: <<${e.text}>>, ${e.replacePrevCharCnt}, ${e.replaceNextCharCnt}, ${e.positionDelta}`);
				}
				console.log('before composition type');
				console.log('this._context.viewModel.model.getValue(); : ', this._context.viewModel.model.getValue());
				this._viewController.compositionType(e.text, e.replacePrevCharCnt, e.replaceNextCharCnt, e.positionDelta);
				console.log('this._context.viewModel.model.getValue(); : ', this._context.viewModel.model.getValue());
			} else {
				if (_debugComposition) {
					console.log(` => type: <<${e.text}>>`);
				}
				console.log('before type');
				this._viewController.type(e.text);
			}
		}));

		this._register(this._hiddenAreaInput.onSelectionChangeRequest((modelSelection: Selection) => {
			this._viewController.setSelection(modelSelection);
		}));

		this._register(this._hiddenAreaInput.onCompositionStart((e) => {

			const ta = this._domElement.domNode;
			const modelSelection = this._modelSelections[0];

			const { distanceToModelLineStart, widthOfHiddenTextBefore } = (() => {
				if (ta.textContent === null) {
					return { distanceToModelLineStart: 0, widthOfHiddenTextBefore: 0 };
				}
				// Find the text that is on the current line before the selection
				const activeDocument = dom.getActiveWindow().document;
				const activeDocumentSelection = activeDocument.getSelection();
				const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
				if (!activeDocumentRange) {
					return { distanceToModelLineStart: 0, widthOfHiddenTextBefore: 0 };
				}
				const textBeforeSelection = ta.textContent.substring(0, Math.min(activeDocumentRange.startOffset, activeDocumentRange.endOffset));
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
				const widthOfHiddenTextBefore = measureText(this._domElement.domNode.ownerDocument, hiddenLineTextBefore, this._fontInfo, tabSize);

				return { distanceToModelLineStart, widthOfHiddenTextBefore };
			})();

			const { distanceToModelLineEnd } = (() => {
				if (ta.textContent === null) {
					return { distanceToModelLineEnd: 0 };
				}
				const activeDocument = dom.getActiveWindow().document;
				const activeDocumentSelection = activeDocument.getSelection();
				const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
				if (!activeDocumentRange) {
					return { distanceToModelLineEnd: 0 };
				}
				// Find the text that is on the current line after the selection
				const textAfterSelection = ta.textContent.substring(Math.max(activeDocumentRange.startOffset, activeDocumentRange.endOffset));
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
			this._domElement.domNode.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');

			this._visibleTextArea.prepareRender(this._visibleRangeProvider);
			this._render();

			// Show the textarea
			this._domElement.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);

			this._viewController.compositionStart();
			this._context.viewModel.onCompositionStart();
		}));

		this._register(this._hiddenAreaInput.onCompositionUpdate((e: ICompositionData) => {
			if (!this._visibleTextArea) {
				return;
			}

			this._visibleTextArea.prepareRender(this._visibleRangeProvider);
			this._render();
		}));

		this._register(this._hiddenAreaInput.onCompositionEnd(() => {

			this._visibleTextArea = null;

			// We turn on wrapping as necessary if the <textarea> hides after composition
			this._domElement.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');

			this._render();

			this._domElement.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
			this._viewController.compositionEnd();
			this._context.viewModel.onCompositionEnd();
		}));

		this._register(this._hiddenAreaInput.onFocus(() => {
			this._context.viewModel.setHasFocus(true);
		}));

		this._register(this._hiddenAreaInput.onBlur(() => {
			this._context.viewModel.setHasFocus(false);
		}));

		this._register(IME.onDidChange(() => {
			ensureReadOnlyAttribute(this._domElement.domNode, options);
		}));

		// --- developer code
		this._domElement.domNode.addEventListener('focus', () => {
			this._domElement.domNode.style.background = 'yellow';
		});
		this._domElement.domNode.addEventListener('blur', () => {
			this._domElement.domNode.style.background = 'white';
		});
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
	}

	// TODO: requires the native edit context input to be defined
	public writeScreenReaderContent(reason: string): void {
		this._hiddenAreaInput.writeNativeTextAreaContent(reason);
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
		setAttributes(this._domElement.domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
			ensureReadOnlyAttribute(this._domElement.domNode, options);
		}

		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._hiddenAreaInput.writeNativeTextAreaContent('strategy changed');
		}

		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		this._modelSelections = e.modelSelections.slice(0);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this._hiddenAreaInput.writeNativeTextAreaContent('selection changed');
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
	// TODO: instead of updating here the dom node position, we should save the scroll left and scroll top and update in the rendering function as done before
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
		return this._hiddenAreaInput.isFocused();
	}

	public focusTextArea(): void {
		this._hiddenAreaInput.focusTextArea();
	}

	// TODO: once the input will be defined
	public refreshFocusState(): void {
		this._hiddenAreaInput.refreshFocusState();
	}

	public getLastRenderData(): Position | null {
		return this._lastRenderPosition;
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		setAriaOptions(this._domElement.domNode, options);
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
		this._hiddenAreaInput.writeNativeTextAreaContent('render');
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
				const textContent = this._domElement.domNode.textContent;
				if (textContent === null) {
					return;
				}
				const activeDocument = dom.getActiveWindow().document;
				const activeDocumentSelection = activeDocument.getSelection();
				const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
				if (!activeDocumentRange) {
					return;
				}
				const lineCount = newlinecount(textContent.substring(0, activeDocumentRange.startOffset));

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
			const activeDocument = dom.getActiveWindow().document;
			const activeDocumentSelection = activeDocument.getSelection();
			const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
			if (!activeDocumentRange) {
				return;
			}
			const lineCount = this._hiddenAreaInput.hiddenAreaState.newlineCountBeforeSelection ?? newlinecount(this._domElement.domNode.textContent!.substring(0, activeDocumentRange.startOffset));
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
}
