/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContextHandler';
import * as nls from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as platform from 'vs/base/common/platform';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { HorizontalPosition, RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption, EditorOptions, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IME } from 'vs/base/common/ime';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { Color } from 'vs/base/common/color';
import { CopyOptions, ICompositionData, ITextAreaInputHost, NativeEditContextInput, NativeEditContextWrapper, ScreenReaderContent } from 'vs/editor/browser/controller/editContext/native/nativeEditContextInput';
import { ClipboardDataToCopy, IPasteData } from 'vs/editor/browser/controller/editContext/textArea/textAreaInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { _debugComposition, ISimpleModel, ITypeData, PagedScreenReaderStrategy, TextAreaState } from 'vs/editor/browser/controller/editContext/native/nativeEditContextState';

const canUseZeroSizeTextarea = (browser.isFirefox);

export class NativeEditContext extends AbstractEditContext {

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
	private _selections: Selection[];
	private _modelSelections: Selection[];

	/**
	 * The position at which the textarea was rendered.
	 * This is useful for hit-testing and determining the mouse position.
	 */
	private _lastRenderPosition: Position | null;

	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _nativeEditContextInput: NativeEditContextInput;

	private _screenReaderWrapper: ScreenReaderContent;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(context);

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

		this._selections = [new Selection(1, 1, 1, 1)];
		this._modelSelections = [new Selection(1, 1, 1, 1)];
		this._lastRenderPosition = null;

		PartFingerprints.write(this._domElement, PartFingerprint.TextArea);
		this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('autocorrect', 'off');
		this._domElement.setAttribute('autocapitalize', 'off');
		this._domElement.setAttribute('autocomplete', 'off');
		this._domElement.setAttribute('spellcheck', 'false');
		this._domElement.setAttribute('aria-label', this._getAriaLabel(options));
		this._domElement.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._domElement.setAttribute('role', 'textbox');
		this._domElement.setAttribute('aria-roledescription', nls.localize('editor', "editor"));
		this._domElement.setAttribute('aria-multiline', 'true');
		this._domElement.setAttribute('aria-autocomplete', options.get(EditorOption.readOnly) ? 'none' : 'both');

		this._ensureReadOnlyAttribute();


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
				if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
					// When accessibility is turned off we not need the screen reader content
					return TextAreaState.EMPTY;
				}

				return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
			},
			// TODO: maybe don't need the actual full selection, just the end position?
			getIMEContentData: (): {
				state: TextAreaState;
				selectionOfContent: Selection;
			} => {
				const cursorState = this._context.viewModel.getPrimaryCursorState().modelState;
				const selectionOfContent = cursorState.selection;
				// Need to do multiline also
				let content = '';
				let selectionStartWithin: number = 0;
				let selectionEndWithin: number = 0;
				for (let i = selectionOfContent.startLineNumber; i <= selectionOfContent.endLineNumber; i++) {
					content += this._context.viewModel.getLineContent(i);
					if (i === selectionOfContent.startLineNumber) {
						selectionStartWithin = selectionOfContent.startColumn - 1;
					}
					if (i === selectionOfContent.endLineNumber) {
						selectionEndWithin += selectionOfContent.endColumn - 1;
					} else {
						selectionEndWithin += this._context.viewModel.getLineMaxColumn(i) - 1;
					}
				}
				const state = new TextAreaState(content, selectionStartWithin, selectionStartWithin, null, undefined);
				return { state, selectionOfContent };
			},
			deduceModelPosition: (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position => {
				return this._context.viewModel.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
			}
		};

		const nativeEditContextWrapper = new NativeEditContextWrapper(this._domElement.domNode, this._context);
		this._screenReaderWrapper = this._register(new ScreenReaderContent(nativeEditContextWrapper));
		this._nativeEditContextInput = this._register(this._instantiationService.createInstance(NativeEditContextInput, textAreaInputHost, nativeEditContextWrapper, this._screenReaderWrapper, platform.OS, {
			isAndroid: browser.isAndroid,
			isChrome: browser.isChrome,
			isFirefox: browser.isFirefox,
			isSafari: browser.isSafari,
		}));

		this._register(this._nativeEditContextInput.onKeyDown((e: IKeyboardEvent) => {
			this._viewController.emitKeyDown(e);
		}));

		this._register(this._nativeEditContextInput.onKeyUp((e: IKeyboardEvent) => {
			this._viewController.emitKeyUp(e);
		}));

		this._register(this._nativeEditContextInput.onPaste((e: IPasteData) => {
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

		this._register(this._nativeEditContextInput.onCut(() => {
			this._viewController.cut();
		}));

		this._register(this._nativeEditContextInput.onType((e: ITypeData) => {
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

		this._register(this._nativeEditContextInput.onSelectionChangeRequest((modelSelection: Selection) => {
			this._viewController.setSelection(modelSelection);
		}));

		this._register(this._nativeEditContextInput.onCompositionStart((e) => {

			// When composition starts we do not change the screen reader content, it will be changed only when the screen reader is used.

			// Scroll to reveal the location in the editor where composition occurs
			this._context.viewModel.revealRange(
				'keyboard',
				true,
				Range.fromPositions(this._selections[0].getStartPosition()),
				viewEvents.VerticalRevealType.Simple,
				ScrollType.Immediate
			);

			this._render();

			// Hidden screen reader content should not depend anymore on the IME state, it should depend only on the accessibility state
			// The only thing that should change is maybe the cursor state that sort of thing
			this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);

			this._viewController.compositionStart();
			this._context.viewModel.onCompositionStart();
		}));

		this._register(this._nativeEditContextInput.onCompositionUpdate((e: ICompositionData) => {
			this._render();
		}));

		this._register(this._nativeEditContextInput.onCompositionEnd(() => {
			this._render();

			this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
			this._viewController.compositionEnd();
			this._context.viewModel.onCompositionEnd();
		}));

		this._register(this._nativeEditContextInput.onFocus(() => {
			this._context.viewModel.setHasFocus(true);
		}));

		this._register(this._nativeEditContextInput.onBlur(() => {
			this._context.viewModel.setHasFocus(false);
		}));

		this._register(IME.onDidChange(() => {
			this._ensureReadOnlyAttribute();
		}));
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
	}

	public writeScreenReaderContent(reason: string): void {
		this._nativeEditContextInput.writeNativeTextAreaContent(reason);
		// Should not need the following?
		// this._nativeEditContextInput.writeEditContextContent(reason);
	}

	public override dispose(): void {
		super.dispose();
	}

	private _getAriaLabel(options: IComputedEditorOptions): string {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		if (accessibilitySupport === AccessibilitySupport.Disabled) {

			const toggleKeybindingLabel = this._keybindingService.lookupKeybinding('editor.action.toggleScreenReaderAccessibilityMode')?.getAriaLabel();
			const runCommandKeybindingLabel = this._keybindingService.lookupKeybinding('workbench.action.showCommands')?.getAriaLabel();
			const keybindingEditorKeybindingLabel = this._keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings')?.getAriaLabel();
			const editorNotAccessibleMessage = nls.localize('accessibilityModeOff', "The editor is not accessible at this time.");
			if (toggleKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabel', "{0} To enable screen reader optimized mode, use {1}", editorNotAccessibleMessage, toggleKeybindingLabel);
			} else if (runCommandKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabelNoKb', "{0} To enable screen reader optimized mode, open the quick pick with {1} and run the command Toggle Screen Reader Accessibility Mode, which is currently not triggerable via keyboard.", editorNotAccessibleMessage, runCommandKeybindingLabel);
			} else if (keybindingEditorKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabelNoKbs', "{0} Please assign a keybinding for the command Toggle Screen Reader Accessibility Mode by accessing the keybindings editor with {1} and run it.", editorNotAccessibleMessage, keybindingEditorKeybindingLabel);
			} else {
				// SOS
				return editorNotAccessibleMessage;
			}
		}
		return options.get(EditorOption.ariaLabel);
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
			this._textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
		} else {
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
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('aria-label', this._getAriaLabel(options));
		this._domElement.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));

		if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
			this._ensureReadOnlyAttribute();
		}

		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._nativeEditContextInput.writeNativeTextAreaContent('strategy changed');
		}

		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		this._modelSelections = e.modelSelections.slice(0);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this._nativeEditContextInput.writeNativeTextAreaContent('selection changed');
		this._nativeEditContextInput.writeEditContextContent('selection changed');
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
		return this._nativeEditContextInput.isFocused();
	}

	public focusTextArea(): void {
		this._nativeEditContextInput.focusTextArea();
	}

	public refreshFocusState(): void {
		this._nativeEditContextInput.refreshFocusState();
	}

	public getLastRenderData(): Position | null {
		return this._lastRenderPosition;
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		if (options.activeDescendant) {
			this._domElement.setAttribute('aria-haspopup', 'true');
			this._domElement.setAttribute('aria-autocomplete', 'list');
			this._domElement.setAttribute('aria-activedescendant', options.activeDescendant);
		} else {
			this._domElement.setAttribute('aria-haspopup', 'false');
			this._domElement.setAttribute('aria-autocomplete', 'both');
			this._domElement.removeAttribute('aria-activedescendant');
		}
		if (options.role) {
			this._domElement.setAttribute('role', options.role);
		}
	}

	// --- end view API

	private _ensureReadOnlyAttribute(): void {
		const options = this._context.configuration.options;
		// When someone requests to disable IME, we set the "readonly" attribute on the <textarea>.
		// This will prevent composition.
		const useReadOnly = !IME.enabled || (options.get(EditorOption.domReadOnly) && options.get(EditorOption.readOnly));
		if (useReadOnly) {
			this._domElement.setAttribute('readonly', 'true');
		} else {
			this._domElement.removeAttribute('readonly');
		}
	}

	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
	}

	public render(ctx: RestrictedRenderingContext): void {
		// Write the content into the screen reader content div
		this._nativeEditContextInput.writeNativeTextAreaContent('render');
		this._nativeEditContextInput.writeEditContextContent('render');
		this._render();
	}

	private _render(): void {
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
			const lineCount = this._nativeEditContextInput.textAreaState.newlineCountBeforeSelection ?? this._newlinecount(this._screenReaderWrapper.getValue().substring(0, this._screenReaderWrapper.getSelectionStart()));
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

	private _newlinecount(text: string): number {
		let result = 0;
		let startIndex = -1;
		do {
			startIndex = text.indexOf('\n', startIndex + 1);
			if (startIndex === -1) {
				break;
			}
			result++;
		} while (true);
		return result;
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

		const ta = this._domElement;

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

