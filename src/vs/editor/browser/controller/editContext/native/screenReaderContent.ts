/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { AbstractEditContext, ariaLabelForScreenReaderContent, getAccessibilityOptions, ISimpleModel, newlinecount, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/editContext/editContext';
import { HorizontalPosition, RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as dom from 'vs/base/browser/dom';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { AccessibilitySupport, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { NativeEditContext } from 'vs/editor/browser/controller/editContext/native/nativeEditContext';
import { ViewController } from 'vs/editor/browser/view/viewController';

/**
 * without screen reader incorrect focusing behavior, does not focus
 * With screen reader incorrect focusing behavior when changing from editor to editor
 */
export class ScreenReaderContent extends AbstractEditContext {

	// HTML Elements
	private readonly _nativeEditContext: NativeEditContext;
	private readonly _domElement: FastDomNode<HTMLDivElement>;

	// Settings
	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;
	private _textAreaWrapping!: boolean;
	private _textAreaWidth!: number;
	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _fontInfo: FontInfo;
	private _lineHeight: number;

	private _primarySelection: Selection;
	private _scrollLeft: number = 0;
	private _scrollTop: number = 0;
	private _hasFocus: boolean = false;

	private _screenReaderContentSelectionOffsetRange: OffsetRange | undefined;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super(context);

		console.log('screen reader content handler constructor');
		this._nativeEditContext = new NativeEditContext(context, viewController);
		this._domElement = this._nativeEditContext.domElement;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._setAccessibilityOptions(options);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);

		this._primarySelection = new Selection(1, 1, 1, 1);
		this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._domElement.setAttribute('role', 'textbox');

		this._register(dom.addDisposableListener(this._domElement.domNode, 'paste', (e) => {
			console.log('paste : ', e);
			// TODO does not work
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'cut', (e) => {
			console.log('cut : ', e);
			// TODO does not work
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'copy', (e) => {
			console.log('copy : ', e);
			// TODO: this does work but corresponding paste and cut do not work
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'focus', (e) => {
			console.log('focus');
			this._setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'blur', (e) => {
			console.log('blur');
			this._setHasFocus(false);
		}));
		this.writeScreenReaderContent('ctor');
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._nativeEditContext.setParent(overflowGuardContainer.domNode);
	}

	public writeScreenReaderContent(reason: string): void {
		console.log('writeScreenReaderContent');
		this._writeScreenReaderContent(reason);
		this._nativeEditContext.writeEditContextContent();
	}

	private _writeScreenReaderContent(reason: string): void {
		console.log('_writeScreenReaderContent');
		if (this._accessibilitySupport === AccessibilitySupport.Enabled) {
			const screenReaderContentState = this._getScreenReaderContentState();
			console.log('screenReaderContentState.value : ', screenReaderContentState.value);
			this._setScreenReaderContent(reason, screenReaderContentState.value); // can we allow empty string?
			this._setSelectionOfScreenReaderContent(reason, screenReaderContentState.selectionStart, screenReaderContentState.selectionEnd);
		}
	}

	public override dispose(): void {
		super.dispose();
		this._domElement.domNode.remove();
	}

	private _setAccessibilityOptions(options: IComputedEditorOptions): void {
		const { accessibilitySupport, accessibilityPageSize, textAreaWrapping, textAreaWidth } = getAccessibilityOptions(options);
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
		this._domElement.setAttribute('wrap', this._textAreaWrapping ? 'on' : 'off');
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._domElement.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._writeScreenReaderContent('strategy changed');
		}
		return true;
	}

	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.selections.slice(0)[0] ?? new Selection(1, 1, 1, 1);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this._writeScreenReaderContent('selection changed');
		this._nativeEditContext.onCursorStateChanged(e);
		return true;
	}

	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollLeft = e.scrollLeft;
		this._scrollTop = e.scrollTop;
		this._nativeEditContext.onScrollChanged(e);
		return true;
	}

	// --- end event handlers

	// --- begin view API

	public isFocused(): boolean {
		return this._hasFocus;
	}

	public get domElement(): HTMLElement {
		return this._domElement.domNode;
	}

	public focusScreenReaderContent(): void {
		console.log('focusScreenReaderContent');
		this._setHasFocus(true);
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		console.log('refreshFocusState');
		const shadowRoot = dom.getShadowRoot(this._domElement.domNode);
		let hasFocus: boolean;
		if (shadowRoot) {
			console.log(' shadowRoot.activeElement : ', shadowRoot.activeElement);
			hasFocus = shadowRoot.activeElement === this._domElement.domNode;
		} else if (this._domElement.domNode.isConnected) {
			console.log('dom.getActiveElement() in refreshFocusState : ', dom.getActiveElement());
			hasFocus = dom.getActiveElement() === this._domElement.domNode;
		} else {
			hasFocus = false;
		}
		this._setHasFocus(hasFocus);
	}

	private _setHasFocus(newHasFocus: boolean): void {
		console.log('_setHasFocus');
		console.log('newHasFocus : ', newHasFocus);
		console.log('this._hasFocus : ', this._hasFocus);
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;

		if (this._hasFocus) {
			// write to the screen reader content
			console.log('this._domElement.domNode before focus : ', this._domElement.domNode);
			console.log('this._domElement.domNode.textContent : ', this._domElement.domNode.textContent);
			this._domElement.domNode.focus();
		}

		// Find how to focus differently
		if (this._hasFocus) {
			console.log('focusing');
			this._context.viewModel.setHasFocus(true);
		} else {
			console.log('bluring');
			this._context.viewModel.setHasFocus(false);
		}
		console.log('dom.getActiveElement() in end of _setHasFocus: ', dom.getActiveElement());
	}

	public setAriaOptions(options: IEditorAriaOptions): void { }

	// --- end view API

	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorPosition = new Position(this._primarySelection.positionLineNumber, this._primarySelection.positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._writeScreenReaderContent('render');
		this._nativeEditContext.writeEditContextContent();
		this._render();
	}

	private _render(): void {

		console.log('_render');

		if (!this._primaryCursorVisibleRange) {
			return;
		}
		const left = this._contentLeft + this._primaryCursorVisibleRange.left - this._scrollLeft;
		if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
			return;
		}
		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.positionLineNumber) - this._scrollTop;
		if (top < 0 || top > this._contentHeight) {
			return;
		}

		this._doRender({
			top,
			left: this._textAreaWrapping ? this._contentLeft : left,
			width: this._textAreaWidth,
			height: this._lineHeight,
		});
		// In case the textarea contains a word, we're going to try to align the textarea's cursor
		// with our cursor by scrolling the textarea as much as possible
		this._domElement.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
		const divValue = this._domElement.domNode.textContent ?? '';
		console.log('_render');
		const lineCount = newlinecount(divValue.substring(0, this._screenReaderContentSelectionOffsetRange?.start));
		this._domElement.domNode.scrollTop = lineCount * this._lineHeight;
	}

	private _doRender(position: { top: number; left: number; width: number; height: number }): void {
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domElement, this._fontInfo);
		this._domElement.setTop(position.top);
		this._domElement.setLeft(position.left);
		this._domElement.setWidth(position.width);
		this._domElement.setHeight(position.height);
	}

	private _getScreenReaderContentState(): {
		value: string;
		selectionStart: number;
		selectionEnd: number;
	} {
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
		console.log('_getScreenReaderContentState');
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
	}

	private _setScreenReaderContent(reason: string, value: string): void {

		console.log('setValue : ', value);
		console.log('value : ', value);

		if (this._domElement.domNode.textContent === value) {
			// No change
			return;
		}
		this._domElement.domNode.textContent = value;
	}

	private _setSelectionOfScreenReaderContent(reason: string, selectionStart: number, selectionEnd: number): void {

		console.log('_setSelectionOfScreenReaderContent');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		this._screenReaderContentSelectionOffsetRange = new OffsetRange(selectionStart, selectionEnd);

		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		console.log('activeDocumentSelection : ', activeDocumentSelection);
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = this._domElement.domNode.firstChild;
			console.log('this._domElement.domNode : ', this._domElement.domNode);
			console.log('firstChild : ', firstChild);
			if (firstChild) {
				range.setStart(firstChild, selectionStart);
				range.setEnd(firstChild, selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
				console.log('activeDocumentSelection updated : ', activeDocumentSelection);
			}
		}

		console.log('dom.getActiveElement() in _setSelectionOfScreenReaderContent : ', dom.getActiveElement());
	}
}
