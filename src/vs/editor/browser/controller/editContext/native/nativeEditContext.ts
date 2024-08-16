/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import * as nls from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { HorizontalPosition, RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption, EditorOptions, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as dom from 'vs/base/browser/dom';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ClipboardEventUtils, InMemoryClipboardMetadataManager } from 'vs/editor/browser/controller/editContext/textArea/textAreaInput';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { AccessibilitySupport, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { Color } from 'vs/base/common/color';
import { EndOfLinePreference, IModelDeltaDecoration } from 'vs/editor/common/model';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';
import { ISimpleModel, ITypeData, PagedScreenReaderStrategy, TextAreaState } from 'vs/editor/browser/controller/editContext/textState';

/**
 * Correctly place the bounding boxes so that they are exactly aligned
 */

const canUseZeroSizeTextarea = (browser.isFirefox);

export class NativeEditContext extends AbstractEditContext {

	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _editContext: EditContext = this._domElement.domNode.editContext = new EditContext();

	private _parent!: HTMLElement;
	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;
	private _textAreaWidth!: number;
	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _fontInfo: FontInfo;
	private _lineHeight: number;
	private _emptySelectionClipboard: boolean;
	private _selections: Selection[];
	private _compositionStartPosition: Position | undefined;
	private _compositionEndPosition: Position | undefined;
	private _currentComposition: CompositionContext | undefined;
	private _selectionOfContent: Range | undefined;
	private _renderingContext: RenderingContext | undefined;
	private _textAreaState: TextAreaState = TextAreaState.EMPTY;

	private _scrollLeft: number = 0;
	private _scrollTop: number = 0;
	private _rangeStart: number = 0;
	private _isComposing: boolean = false;
	private _hasFocus: boolean = false;
	private _selectionStartWithinScreenReaderContent: number = 0;
	private _selectionEndWithinScreenReaderContent: number = 0;
	private _selectionStartWithinEditContext: number = 0;
	private _selectionEndWithinEditContext: number = 0;

	private _contextForTextArea = {
		getValue: () => this._editContext.text,
		getSelectionStart: () => this._selectionStartWithinEditContext,
		getSelectionEnd: () => this._selectionEndWithinEditContext,
	};

	private _selectionBounds: IDisposable = Disposable.None;
	private _controlBounds: IDisposable = Disposable.None;
	private _characterBounds: IDisposable = Disposable.None;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super(context);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._setAccessibilityOptions(options);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);

		this._selections = [new Selection(1, 1, 1, 1)];
		this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('aria-label', this._getAriaLabel(options));
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._domElement.setAttribute('role', 'textbox');

		let lastKeyDown: IKeyboardEvent | null = null;
		this._register(dom.addDisposableListener(this._domElement.domNode, 'keydown', (e) => {
			const standardKeyboardEvent = new StandardKeyboardEvent(e);
			if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION
				|| (this._currentComposition && standardKeyboardEvent.keyCode === KeyCode.Backspace)) {
				// Stop propagation for keyDown events if the IME is processing key input
				standardKeyboardEvent.stopPropagation();
			}
			lastKeyDown = standardKeyboardEvent;
			this._viewController.emitKeyDown(standardKeyboardEvent);
		}));

		this._register(dom.addDisposableListener(this._domElement.domNode, 'keyup', (e) => {
			const standardKeyboardEvent = new StandardKeyboardEvent(e);
			this._viewController.emitKeyUp(standardKeyboardEvent);
		}));

		this._register(dom.addDisposableListener(this._domElement.domNode, 'paste', (e) => {
			e.preventDefault();
			if (!e.clipboardData) {
				return;
			}
			let [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
			if (!text) {
				return;
			}
			// try the in-memory store
			metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
			let pasteOnNewLine = false;
			let multicursorText: string[] | null = null;
			let mode: string | null = null;
			if (metadata) {
				pasteOnNewLine = (this._emptySelectionClipboard && !!metadata.isFromEmptySelection);
				multicursorText = (typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null);
				mode = metadata.mode;
			}
			this._viewController.paste(text, pasteOnNewLine, multicursorText, mode);
		}));

		this._register(dom.addDisposableListener(this._domElement.domNode, 'cut', (e) => {
			// TODO: maybe need to do async cutting here
			this._viewController.cut();
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'copy', (e) => {
			// TODO: add the code which copies
		}));

		// -- on input is mixed with the composition start, composition end, textupdate
		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', e => {

			console.log('textupdate : ', e);
			console.log('e.updateRangeStart : ', e.updateRangeStart);
			console.log('e.updateRangeEnd : ', e.updateRangeEnd);
			console.log('e.text : ', e.text);
			console.log('this._editContext.text : ', this._editContext.text);

			const data = e.text.replaceAll(/[^\S\r\n]/gmu, ' ');
			console.log('data : ', data);

			if (this._isComposing) {
				this._compositionEndPosition = this._context.viewModel.getCursorStates()[0].viewState.position;
				const currentComposition = this._currentComposition;
				if (!currentComposition) {
					// should not be possible to receive a 'compositionupdate' without a 'compositionstart'
					return;
				}

				console.log('this._textAreaState : ', this._textAreaState);
				const typeInput = currentComposition.handleCompositionUpdate(data);
				this._textAreaState = TextAreaState.readFromEditContext(this._contextForTextArea, this._textAreaState);

				console.log('typeInput : ', typeInput);
				console.log('this._textAreaState : ', this._textAreaState);

				this._onType(typeInput);
				this._render();
			} else {
				// TODO: Maybe need to place the below under the isComposing check too, because it has boolean isComposing

				this.onInput();
			}
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', e => {

			console.log('oncompositionstart : ', e);

			this._isComposing = true;
			this._compositionStartPosition = this._context.viewModel.getCursorStates()[0].viewState.position;

			const currentComposition = new CompositionContext();
			if (this._currentComposition) {
				// simply reset the composition context
				this._currentComposition = currentComposition;
				return;
			}
			this._currentComposition = currentComposition;

			const currentTarget = e.currentTarget as EditContext;

			if (
				platform.OS === platform.OperatingSystem.Macintosh
				&& lastKeyDown
				&& lastKeyDown.equals(KeyCode.KEY_IN_COMPOSITION)
				&& this._textAreaState.selectionStart === this._textAreaState.selectionEnd
				&& this._textAreaState.selectionStart > 0
				&& this._textAreaState.value.substring(this._textAreaState.selectionStart - 1, 1) === currentTarget.text
				&& (lastKeyDown.code === 'ArrowRight' || lastKeyDown.code === 'ArrowLeft')
			) {
				// Handling long press case on Chromium/Safari macOS + arrow key => pretend the character was selected
				// Pretend the previous character was composed (in order to get it removed by subsequent compositionupdate events)
				currentComposition.handleCompositionUpdate('x');
			}

			this._context.viewModel.revealRange(
				'keyboard',
				true,
				Range.fromPositions(this._selections[0].getStartPosition()),
				viewEvents.VerticalRevealType.Simple,
				ScrollType.Immediate
			);

			this._render();
			this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);
			this._viewController.compositionStart();
			this._context.viewModel.onCompositionStart();
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', e => {

			console.log('oncompositionend : ', e);

			this._isComposing = false;
			this._compositionEndPosition = this._context.viewModel.getCursorStates()[0].viewState.position;

			if ('data' in e && typeof e.data === 'string') {

				const currentComposition = this._currentComposition;
				if (!currentComposition) {
					return;
				}
				this._currentComposition = undefined;
				const typeInput = currentComposition.handleCompositionUpdate(e.data);
				this._textAreaState = TextAreaState.readFromEditContext(this._contextForTextArea, this._textAreaState);
				this._onType(typeInput);

				this._render();
				this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
				this._viewController.compositionEnd();
				this._context.viewModel.onCompositionEnd();
			}
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'beforeinput', (e) => {

			console.log('beforeinput : ', e);

			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				console.log('this._editContext.text : ', this._editContext.text);
				console.log('this._selectionStartWithin : ', this._selectionStartWithinEditContext);
				console.log('this._selectionEndWithin : ', this._selectionEndWithinEditContext);
				const editContextText = this._editContext.text;
				const textAfterAddingNewLine = editContextText.substring(0, this._selectionStartWithinEditContext) + '\n' + editContextText.substring(this._selectionEndWithinEditContext);
				this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, textAfterAddingNewLine);
				this.onInput();
			}
		}));

		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', e => {
			this._handleTextFormatUpdate(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', e => {
			console.log('characterboundsupdate : ', e);
			this._rangeStart = e.rangeStart;
			this._updateCharacterBounds(e.rangeStart);
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'focus', (e) => {
			this._setHasFocus(true);
		}));

		this._register(dom.addDisposableListener(this._domElement.domNode, 'blur', (e) => {
			this._setHasFocus(false);
		}));

		const that = this;
		this._context.addEventHandler(new class extends ViewEventHandler {
			public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
				that._scrollTop = e.scrollTop;
				that._updateBounds();
				return false;
			}
			public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
				that._updateBounds();
				return false;
			}
		});
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._parent = overflowGuardContainer.domNode;
	}

	public writeScreenReaderContent(reason: string): void {
		if ((!this._accessibilityService.isScreenReaderOptimized() && reason === 'render') || this._currentComposition) {
			// Do not write to the text on render unless a screen reader is being used #192278
			// Do not write to the text area when doing composition
			return;
		}
		let textAreaState = this._getScreenReaderContent();
		if (!this._hasFocus) {
			textAreaState = textAreaState.collapseSelection();
		}
		this.setValue(reason, textAreaState.value);
		if (this._hasFocus) {
			this.setSelectionRange(reason, textAreaState.selectionStart, textAreaState.selectionEnd);
		}
	}

	public writeEditContextContent(): void {
		const IMEContentData = this._getIMEContentData();

		console.log('updateText');
		console.log('IMEContentData : ', IMEContentData);

		const content = IMEContentData.state.value;
		const selectionStart = IMEContentData.state.selectionStart;
		const selectionEnd = IMEContentData.state.selectionEnd;

		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, content);
		this._editContext.updateSelection(selectionStart, selectionEnd);

		this._selectionStartWithinEditContext = selectionStart;
		this._selectionEndWithinEditContext = selectionEnd;
		this._selectionOfContent = IMEContentData.selectionOfContent;

		console.log('this._editContext.text : ', this._editContext.text);
		console.log('this._selectionStartWithin : ', this._selectionStartWithinEditContext);
		console.log('this._selectionEndWithin : ', this._selectionEndWithinEditContext);
		console.log('this._selectionOfContent : ', this._selectionOfContent);

		this._textAreaState = IMEContentData.state;
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
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('aria-label', this._getAriaLabel(options));
		this._domElement.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));

		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this.writeScreenReaderContent('strategy changed');
		}

		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this.writeScreenReaderContent('selection changed');
		this.writeEditContextContent();
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
		return this._hasFocus;
	}

	public focusTextArea(): void {
		// Setting this._hasFocus and writing the screen reader content
		// will result in a focus() and setSelectionRange() in the textarea
		this._setHasFocus(true);

		// If the editor is off DOM, focus cannot be really set, so let's double check that we have managed to set the focus
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		console.log('refreshFocusState');
		// TODO: not sure why this does not work
		// let hasFocus: boolean = true;
		// const shadowRoot = dom.getShadowRoot(this._domElement.domNode);
		// if (shadowRoot) {
		// 	console.log('1');
		// 	hasFocus = shadowRoot.activeElement === this._domElement.domNode;
		// } else if (this._domElement.domNode.isConnected) {
		// 	console.log('2');
		// 	hasFocus = dom.getActiveElement() === this._domElement.domNode;
		// } else {
		// 	console.log('3');
		// 	hasFocus = false;
		// }
		// console.log('hasFocus : ', hasFocus);
		const hasFocus = true;
		this._setHasFocus(hasFocus);
	}

	private _setHasFocus(newHasFocus: boolean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;

		if (this._hasFocus) {
			// write to the screen reader content
		}

		if (this._hasFocus) {
			this._context.viewModel.setHasFocus(true);
		} else {
			this._context.viewModel.setHasFocus(false);
		}
	}

	public setAriaOptions(options: IEditorAriaOptions): void { }

	// --- end view API

	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	public prepareRender(ctx: RenderingContext): void {
		this._renderingContext = ctx;
		this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
	}

	public render(ctx: RestrictedRenderingContext): void {
		// Write the content into the screen reader content div
		this.writeScreenReaderContent('render');
		this.writeEditContextContent();
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
				left: left,
				width: this._textAreaWidth,
				height: this._lineHeight,
				useCover: false
			});
			// In case the textarea contains a word, we're going to try to align the textarea's cursor
			// with our cursor by scrolling the textarea as much as possible
			this._domElement.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
			const divValue = this._domElement.domNode.textContent ?? '';
			const lineCount = this._textAreaState.newlineCountBeforeSelection ?? this._newlinecount(divValue.substring(0, this._selectionStartWithinScreenReaderContent));
			this._domElement.domNode.scrollTop = lineCount * this._lineHeight;
			return;
		}

		this._doRender({
			lastRenderPosition: this._primaryCursorPosition,
			top: top,
			left: left,
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

	// -- additional code

	private _onType(typeInput: ITypeData): void {
		if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
			this._viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
		} else {
			this._viewController.type(typeInput.text);
		}
	}

	private _getScreenReaderContent(): TextAreaState {
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

		if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
			// When accessibility is turned off we not need the screen reader content
			return TextAreaState.EMPTY;
		}
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
	}

	public _getIMEContentData(): {
		state: TextAreaState;
		selectionOfContent: Selection;
	} {
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
	}

	public setValue(reason: string, value: string): void {

		console.log('setValue : ', value);
		console.log('value : ', value);

		const textArea = this._domElement.domNode;
		if (textArea.textContent === value) {
			// No change
			return;
		}
		textArea.textContent = value;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {

		console.log('setSelectionRange');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		const textArea = this._domElement.domNode;

		let activeElement: Element | null = null;
		const shadowRoot = dom.getShadowRoot(textArea);
		if (shadowRoot) {
			activeElement = shadowRoot.activeElement;
		} else {
			activeElement = dom.getActiveElement();
		}
		const activeWindow = dom.getWindow(activeElement);

		const currentIsFocused = (activeElement === textArea);

		if (currentIsFocused && this._selectionStartWithinScreenReaderContent === selectionStart && this._selectionEndWithinScreenReaderContent === selectionEnd) {
			// No change
			// Firefox iframe bug https://github.com/microsoft/monaco-editor/issues/643#issuecomment-367871377
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// console.log('reason: ' + reason + ', setSelectionRange: ' + selectionStart + ' -> ' + selectionEnd);

		if (currentIsFocused) {
			// No need to focus, only need to change the selection range
			this._updateDocumentSelection(selectionStart, selectionEnd);
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// If the focus is outside the textarea, browsers will try really hard to reveal the textarea.
		// Here, we try to undo the browser's desperate reveal.
		try {
			const scrollState = dom.saveParentsScrollTop(textArea);
			textArea.focus();
			this._updateDocumentSelection(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}

	private _updateDocumentSelection(selectionStart: number, selectionEnd: number) {

		console.log('_updateDocumentSelection');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		this._selectionStartWithinScreenReaderContent = selectionStart;
		this._selectionEndWithinScreenReaderContent = selectionEnd;

		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = this._domElement.domNode.firstChild;
			if (firstChild) {
				range.setStart(firstChild, selectionStart);
				range.setEnd(firstChild, selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
	}

	public onInput() {
		if (this._currentComposition) {
			return;
		}
		const newState = TextAreaState.readFromEditContext(this._contextForTextArea, this._textAreaState);
		const typeInput = TextAreaState.deduceInput(this._textAreaState, newState, platform.OS === platform.OperatingSystem.Macintosh);

		console.log('onInput');
		console.log('this._textAreaState : ', this._textAreaState);
		console.log('newState : ', newState);
		console.log('typeInput : ', typeInput);

		this._textAreaState = newState;
		if (
			typeInput.text !== ''
			|| typeInput.replacePrevCharCnt !== 0
			|| typeInput.replaceNextCharCnt !== 0
			|| typeInput.positionDelta !== 0
		) {
			this._onType(typeInput);
		}
	}

	private _updateCharacterBounds(rangeStart: number) {

		console.log('_updateCharacterBounds');
		console.log('this._parent : ', this._parent);
		console.log('this._compositionStartPosition : ', this._compositionStartPosition);
		console.log('this._compositionEndPosition : ', this._compositionEndPosition);

		if (!this._parent || !this._compositionStartPosition || !this._compositionEndPosition) {
			console.log('early return of _updateCharacterBounds');
			return;
		}

		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(this._compositionStartPosition.lineNumber);
		let left: number = parentBounds.left + this._contentLeft;
		let width: number = typicalHalfwidthCharacterWidth / 2;

		console.log('before using this rendering context');
		console.log('this._renderingContext : ', this._renderingContext);

		if (this._renderingContext) {
			const range = Range.fromPositions(this._compositionStartPosition, this._compositionEndPosition);
			const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(range, true) ?? [];

			console.log('range : ', range);
			console.log('linesVisibleRanges : ', linesVisibleRanges);

			if (linesVisibleRanges.length === 0) { return; }
			const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
			const maxLeft = Math.max(...linesVisibleRanges.map(r => Math.max(...r.ranges.map(r => r.left + r.width))));
			left += minLeft;
			width = maxLeft - minLeft;
		}

		console.log('before setting characterBounds');

		const characterBounds = [new DOMRect(
			left,
			parentBounds.top + verticalOffsetStart - this._scrollTop,
			width,
			lineHeight,
		)];

		console.log('characterBounds : ', characterBounds);
		this._editContext.updateCharacterBounds(rangeStart, characterBounds);

		// -- dev
		this._characterBounds.dispose();
		this._characterBounds = createRect(characterBounds[0], 'green');
	}

	private _decorations: string[] = [];

	// do we need this? looks like in the current implementation we wouldnt use these format
	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {

		const formats = e.getTextFormats();

		console.log('_handleTextFormatUpdate');
		console.log('e : ', e);
		console.log('formats : ', formats);

		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const offsetRange = new OffsetRange(f.rangeStart, f.rangeEnd);
			const textPositionTransformer = new PositionOffsetTransformer(this._editContext.text);
			const range = textPositionTransformer.getRange(offsetRange);

			console.log('range : ', range);
			console.log('this._selectionOfValue : ', this._selectionOfContent);

			if (!this._selectionOfContent) {
				return;
			}
			const startLineNumber = this._selectionOfContent.startLineNumber + range.startLineNumber - 1;
			const endLineNumber = this._selectionOfContent.startLineNumber + range.endLineNumber - 1;
			let startColumn: number;
			if (startLineNumber === this._selectionOfContent.startLineNumber) {
				startColumn = this._selectionOfContent.startColumn + range.startColumn - 1;
			} else {
				startColumn = range.startColumn;
			}
			let endColumn: number;
			if (endLineNumber === this._selectionOfContent.startLineNumber) {
				endColumn = this._selectionOfContent.startColumn + range.endColumn - 1;
			} else {
				endColumn = range.endColumn;
			}
			const decorationRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);

			console.log('decorationRange : ', decorationRange);

			const classNames = [
				'underline',
				`style-${f.underlineStyle.toLowerCase()}`,
				`thickness-${f.underlineThickness.toLowerCase()}`,
			];
			decorations.push({
				range: decorationRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			});
		});

		console.log('decorations : ', decorations);

		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _updateBounds() {
		this._updateSelectionAndControlBounds();
		// Need to update character bounds eagerly in order for the IME to be positioned correctly
		this._updateCharacterBounds(this._rangeStart);
	}

	private _updateSelectionAndControlBounds() {

		console.log('_updateBounds');

		if (!this._parent) {
			return;
		}
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;
		const primarySelection = primaryViewState.selection;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(primarySelection.startLineNumber);
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);

		let selectionBounds: DOMRect;
		let controlBounds: DOMRect;
		if (primarySelection.isEmpty()) {
			const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			let left: number = parentBounds.left + this._contentLeft;
			if (this._renderingContext) {
				const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(primaryViewState.selection, true) ?? [];
				if (linesVisibleRanges.length === 0) { return; }
				const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
				left += (minLeft + typicalHalfwidthCharacterWidth / 2);
			}
			selectionBounds = new DOMRect(
				left,
				parentBounds.top + verticalOffsetStart - this._scrollTop,
				typicalHalfwidthCharacterWidth / 2,
				lineHeight,
			);
			controlBounds = selectionBounds;
		} else {
			const numberOfLines = primarySelection.endLineNumber - primarySelection.startLineNumber;
			selectionBounds = new DOMRect(
				parentBounds.left + this._contentLeft,
				parentBounds.top + verticalOffsetStart - this._scrollTop,
				parentBounds.width - this._contentLeft,
				(numberOfLines + 1) * lineHeight,
			);
			controlBounds = selectionBounds;
		}

		console.log('selectionBounds : ', selectionBounds);
		console.log('controlBounds : ', controlBounds);

		this._editContext.updateControlBounds(controlBounds);
		this._editContext.updateSelectionBounds(selectionBounds);

		// visualizing the selection bounds
		this._selectionBounds.dispose();
		this._controlBounds.dispose();
		this._selectionBounds = createRect(selectionBounds, 'red');
		this._controlBounds = createRect(controlBounds, 'blue');
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

class CompositionContext {

	private _lastTypeTextLength: number;

	constructor() {
		this._lastTypeTextLength = 0;
	}

	public handleCompositionUpdate(text: string | null | undefined): ITypeData {
		text = text || '';
		const typeInput: ITypeData = {
			text: text,
			replacePrevCharCnt: this._lastTypeTextLength,
			replaceNextCharCnt: 0,
			positionDelta: 0
		};
		this._lastTypeTextLength = text.length;
		return typeInput;
	}
}


function createRect(rect: DOMRect, color: 'red' | 'blue' | 'green'): IDisposable {
	const ret = document.createElement('div');
	ret.style.position = 'absolute';
	ret.style.zIndex = '999999999';
	ret.style.outline = `2px solid ${color}`;
	ret.className = 'debug-rect-marker';
	ret.style.pointerEvents = 'none';

	ret.style.top = rect.top + 'px';
	ret.style.left = rect.left + 'px';
	ret.style.width = rect.width + 'px';
	ret.style.height = rect.height + 'px';

	// eslint-disable-next-line no-restricted-syntax
	document.body.appendChild(ret);

	return {
		dispose: () => {
			ret.remove();
		}
	};
}
