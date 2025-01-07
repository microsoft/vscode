/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './textAreaEditContext.css';
import * as nls from '../../../../../nls.js';
import * as browser from '../../../../../base/browser/browser.js';
import { FastDomNode, createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { IKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import * as platform from '../../../../../base/common/platform.js';
import * as strings from '../../../../../base/common/strings.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { ViewController } from '../../../view/viewController.js';
import { PartFingerprint, PartFingerprints } from '../../../view/viewPart.js';
import { LineNumbersOverlay } from '../../../viewParts/lineNumbers/lineNumbers.js';
import { Margin } from '../../../viewParts/margin/margin.js';
import { RenderLineNumbersType, EditorOption, IComputedEditorOptions, EditorOptions } from '../../../../common/config/editorOptions.js';
import { FontInfo } from '../../../../common/config/fontInfo.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { ScrollType } from '../../../../common/editorCommon.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { RenderingContext, RestrictedRenderingContext, HorizontalPosition, LineVisibleRanges } from '../../../view/renderingContext.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../../common/viewEvents.js';
import { AccessibilitySupport } from '../../../../../platform/accessibility/common/accessibility.js';
import { IEditorAriaOptions } from '../../../editorBrowser.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { TokenizationRegistry } from '../../../../common/languages.js';
import { ColorId, ITokenPresentation } from '../../../../common/encodedTokenAttributes.js';
import { Color } from '../../../../../base/common/color.js';
import { IME } from '../../../../../base/common/ime.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AbstractEditContext } from '../editContext.js';
import { ICompositionData, IPasteData, ITextAreaInputHost, TextAreaInput, TextAreaWrapper } from './textAreaEditContextInput.js';
import { ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy } from '../screenReaderUtils.js';
import { ClipboardDataToCopy, getDataToCopy } from '../clipboardUtils.js';
import { _debugComposition, ITypeData, TextAreaState } from './textAreaEditContextState.js';
import { getMapForWordSeparators, WordCharacterClass } from '../../../../common/core/wordCharacterClassifier.js';

export interface IVisibleRangeProvider {
	visibleRangeForPosition(position: Position): HorizontalPosition | null;
	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] | null;
}

class VisibleTextAreaData {
	_visibleTextAreaBrand: void = undefined;

	public startPosition: Position | null = null;
	public endPosition: Position | null = null;

	public visibleTextareaStart: HorizontalPosition | null = null;
	public visibleTextareaEnd: HorizontalPosition | null = null;

	/**
	 * When doing composition, the currently composed text might be split up into
	 * multiple tokens, then merged again into a single token, etc. Here we attempt
	 * to keep the presentation of the <textarea> stable by using the previous used
	 * style if multiple tokens come into play. This avoids flickering.
	 */
	private _previousPresentation: ITokenPresentation | null = null;

	constructor(
		private readonly _context: ViewContext,
		public readonly modelLineNumber: number,
		public readonly distanceToModelLineStart: number,
		public readonly widthOfHiddenLineTextBefore: number,
		public readonly distanceToModelLineEnd: number,
	) {
	}

	prepareRender(visibleRangeProvider: IVisibleRangeProvider): void {
		const startModelPosition = new Position(this.modelLineNumber, this.distanceToModelLineStart + 1);
		const endModelPosition = new Position(this.modelLineNumber, this._context.viewModel.model.getLineMaxColumn(this.modelLineNumber) - this.distanceToModelLineEnd);

		this.startPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(startModelPosition);
		this.endPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(endModelPosition);

		if (this.startPosition.lineNumber === this.endPosition.lineNumber) {
			this.visibleTextareaStart = visibleRangeProvider.visibleRangeForPosition(this.startPosition);
			this.visibleTextareaEnd = visibleRangeProvider.visibleRangeForPosition(this.endPosition);
		} else {
			// TODO: what if the view positions are not on the same line?
			this.visibleTextareaStart = null;
			this.visibleTextareaEnd = null;
		}
	}

	definePresentation(tokenPresentation: ITokenPresentation | null): ITokenPresentation {
		if (!this._previousPresentation) {
			// To avoid flickering, once set, always reuse a presentation throughout the entire IME session
			if (tokenPresentation) {
				this._previousPresentation = tokenPresentation;
			} else {
				this._previousPresentation = {
					foreground: ColorId.DefaultForeground,
					italic: false,
					bold: false,
					underline: false,
					strikethrough: false,
				};
			}
		}
		return this._previousPresentation;
	}
}

const canUseZeroSizeTextarea = (browser.isFirefox);

export class TextAreaEditContext extends AbstractEditContext {

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
		overflowGuardContainer: FastDomNode<HTMLElement>,
		viewController: ViewController,
		visibleRangeProvider: IVisibleRangeProvider,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(context);

		this._viewController = viewController;
		this._visibleRangeProvider = visibleRangeProvider;
		this._scrollLeft = 0;
		this._scrollTop = 0;

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

		this._visibleTextArea = null;
		this._selections = [new Selection(1, 1, 1, 1)];
		this._modelSelections = [new Selection(1, 1, 1, 1)];
		this._lastRenderPosition = null;

		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = createFastDomNode(document.createElement('textarea'));
		PartFingerprints.write(this.textArea, PartFingerprint.TextArea);
		this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
		const { tabSize } = this._context.viewModel.model.getOptions();
		this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('autocomplete', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		this.textArea.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this.textArea.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-roledescription', nls.localize('editor', "editor"));
		this.textArea.setAttribute('aria-multiline', 'true');
		this.textArea.setAttribute('aria-autocomplete', options.get(EditorOption.readOnly) ? 'none' : 'both');

		this._ensureReadOnlyAttribute();

		this.textAreaCover = createFastDomNode(document.createElement('div'));
		this.textAreaCover.setPosition('absolute');

		overflowGuardContainer.appendChild(this.textArea);
		overflowGuardContainer.appendChild(this.textAreaCover);

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

		const textAreaInputHost: ITextAreaInputHost = {
			getDataToCopy: (): ClipboardDataToCopy => {
				return getDataToCopy(this._context.viewModel, this._modelSelections, this._emptySelectionClipboard, this._copyWithSyntaxHighlighting);
			},
			getScreenReaderContent: (): TextAreaState => {
				if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
					// We know for a fact that a screen reader is not attached
					// On OSX, we write the character before the cursor to allow for "long-press" composition
					// Also on OSX, we write the word before the cursor to allow for the Accessibility Keyboard to give good hints
					const selection = this._selections[0];
					if (platform.isMacintosh && selection.isEmpty()) {
						const position = selection.getStartPosition();

						let textBefore = this._getWordBeforePosition(position);
						if (textBefore.length === 0) {
							textBefore = this._getCharacterBeforePosition(position);
						}

						if (textBefore.length > 0) {
							return new TextAreaState(textBefore, textBefore.length, textBefore.length, Range.fromPositions(position), 0);
						}
					}
					// on macOS, write current selection into textarea will allow system text services pick selected text,
					// but we still want to limit the amount of text given Chromium handles very poorly text even of a few
					// thousand chars
					// (https://github.com/microsoft/vscode/issues/27799)
					const LIMIT_CHARS = 500;
					if (platform.isMacintosh && !selection.isEmpty() && simpleModel.getValueLengthInRange(selection, EndOfLinePreference.TextDefined) < LIMIT_CHARS) {
						const text = simpleModel.getValueInRange(selection, EndOfLinePreference.TextDefined);
						return new TextAreaState(text, 0, text.length, selection, 0);
					}

					// on Safari, document.execCommand('cut') and document.execCommand('copy') will just not work
					// if the textarea has no content selected. So if there is an editor selection, ensure something
					// is selected in the textarea.
					if (browser.isSafari && !selection.isEmpty()) {
						const placeholderText = 'vscode-placeholder';
						return new TextAreaState(placeholderText, 0, placeholderText.length, null, undefined);
					}

					return TextAreaState.EMPTY;
				}

				if (browser.isAndroid) {
					// when tapping in the editor on a word, Android enters composition mode.
					// in the `compositionstart` event we cannot clear the textarea, because
					// it then forgets to ever send a `compositionend`.
					// we therefore only write the current word in the textarea
					const selection = this._selections[0];
					if (selection.isEmpty()) {
						const position = selection.getStartPosition();
						const [wordAtPosition, positionOffsetInWord] = this._getAndroidWordAtPosition(position);
						if (wordAtPosition.length > 0) {
							return new TextAreaState(wordAtPosition, positionOffsetInWord, positionOffsetInWord, Range.fromPositions(position), 0);
						}
					}
					return TextAreaState.EMPTY;
				}

				const screenReaderContentState = PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
				return TextAreaState.fromScreenReaderContentState(screenReaderContentState);
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
			this._ensureReadOnlyAttribute();
		}));
	}

	public get domNode() {
		return this.textArea;
	}

	public writeScreenReaderContent(reason: string): void {
		this._textAreaInput.writeNativeTextAreaContent(reason);
	}

	public getTextAreaDomNode(): HTMLTextAreaElement {
		return this.textArea.domNode;
	}

	public override dispose(): void {
		super.dispose();
		this.textArea.domNode.remove();
		this.textAreaCover.domNode.remove();
	}

	private _getAndroidWordAtPosition(position: Position): [string, number] {
		const ANDROID_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
		const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
		const wordSeparators = getMapForWordSeparators(ANDROID_WORD_SEPARATORS, []);

		let goingLeft = true;
		let startColumn = position.column;
		let goingRight = true;
		let endColumn = position.column;
		let distance = 0;
		while (distance < 50 && (goingLeft || goingRight)) {
			if (goingLeft && startColumn <= 1) {
				goingLeft = false;
			}
			if (goingLeft) {
				const charCode = lineContent.charCodeAt(startColumn - 2);
				const charClass = wordSeparators.get(charCode);
				if (charClass !== WordCharacterClass.Regular) {
					goingLeft = false;
				} else {
					startColumn--;
				}
			}
			if (goingRight && endColumn > lineContent.length) {
				goingRight = false;
			}
			if (goingRight) {
				const charCode = lineContent.charCodeAt(endColumn - 1);
				const charClass = wordSeparators.get(charCode);
				if (charClass !== WordCharacterClass.Regular) {
					goingRight = false;
				} else {
					endColumn++;
				}
			}
			distance++;
		}

		return [lineContent.substring(startColumn - 1, endColumn - 1), position.column - startColumn];
	}

	private _getWordBeforePosition(position: Position): string {
		const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
		const wordSeparators = getMapForWordSeparators(this._context.configuration.options.get(EditorOption.wordSeparators), []);

		let column = position.column;
		let distance = 0;
		while (column > 1) {
			const charCode = lineContent.charCodeAt(column - 2);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular || distance > 50) {
				return lineContent.substring(column - 1, position.column - 1);
			}
			distance++;
			column--;
		}
		return lineContent.substring(0, position.column - 1);
	}

	private _getCharacterBeforePosition(position: Position): string {
		if (position.column > 1) {
			const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
			const charBefore = lineContent.charAt(position.column - 2);
			if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
				return charBefore;
			}
		}
		return '';
	}

	private _setAccessibilityOptions(options: IComputedEditorOptions): void {
		this._accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		const accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
		if (this._accessibilitySupport === AccessibilitySupport.Enabled && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
			// If a screen reader is attached and the default value is not set we should automatically increase the page size to 500 for a better experience
			this._accessibilityPageSize = 500;
		} else {
			this._accessibilityPageSize = accessibilityPageSize;
		}

		// When wrapping is enabled and a screen reader might be attached,
		// we will size the textarea to match the width used for wrapping points computation (see `domLineBreaksComputer.ts`).
		// This is because screen readers will read the text in the textarea and we'd like that the
		// wrapping points in the textarea match the wrapping points in the editor.
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const wrappingColumn = layoutInfo.wrappingColumn;
		if (wrappingColumn !== -1 && this._accessibilitySupport !== AccessibilitySupport.Disabled) {
			const fontInfo = options.get(EditorOption.fontInfo);
			this._textAreaWrapping = true;
			this._textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
		} else {
			this._textAreaWrapping = false;
			this._textAreaWidth = (canUseZeroSizeTextarea ? 0 : 1);
		}
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
		this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
		const { tabSize } = this._context.viewModel.model.getOptions();
		this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this.textArea.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		this.textArea.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this.textArea.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));

		if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
			this._ensureReadOnlyAttribute();
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

	public focus(): void {
		this._textAreaInput.focusTextArea();
	}

	public refreshFocusState() {
		this._textAreaInput.refreshFocusState();
	}

	public getLastRenderData(): Position | null {
		return this._lastRenderPosition;
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		if (options.activeDescendant) {
			this.textArea.setAttribute('aria-haspopup', 'true');
			this.textArea.setAttribute('aria-autocomplete', 'list');
			this.textArea.setAttribute('aria-activedescendant', options.activeDescendant);
		} else {
			this.textArea.setAttribute('aria-haspopup', 'false');
			this.textArea.setAttribute('aria-autocomplete', 'both');
			this.textArea.removeAttribute('aria-activedescendant');
		}
		if (options.role) {
			this.textArea.setAttribute('role', options.role);
		}
	}

	// --- end view API

	private _ensureReadOnlyAttribute(): void {
		const options = this._context.configuration.options;
		// When someone requests to disable IME, we set the "readonly" attribute on the <textarea>.
		// This will prevent composition.
		const useReadOnly = !IME.enabled || (options.get(EditorOption.domReadOnly) && options.get(EditorOption.readOnly));
		if (useReadOnly) {
			this.textArea.setAttribute('readonly', 'true');
		} else {
			this.textArea.removeAttribute('readonly');
		}
	}

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
			const lineCount = this._textAreaInput.textAreaState.newlineCountBeforeSelection ?? newlinecount(this.textArea.domNode.value.substring(0, this.textArea.domNode.selectionStart));
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

interface IRenderData {
	lastRenderPosition: Position | null;
	top: number;
	left: number;
	width: number;
	height: number;
	useCover: boolean;

	color?: Color | null;
	italic?: boolean;
	bold?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
}

function measureText(targetDocument: Document, text: string, fontInfo: FontInfo, tabSize: number): number {
	if (text.length === 0) {
		return 0;
	}

	const container = targetDocument.createElement('div');
	container.style.position = 'absolute';
	container.style.top = '-50000px';
	container.style.width = '50000px';

	const regularDomNode = targetDocument.createElement('span');
	applyFontInfo(regularDomNode, fontInfo);
	regularDomNode.style.whiteSpace = 'pre'; // just like the textarea
	regularDomNode.style.tabSize = `${tabSize * fontInfo.spaceWidth}px`; // just like the textarea
	regularDomNode.append(text);
	container.appendChild(regularDomNode);

	targetDocument.body.appendChild(container);

	const res = regularDomNode.offsetWidth;

	container.remove();

	return res;
}
