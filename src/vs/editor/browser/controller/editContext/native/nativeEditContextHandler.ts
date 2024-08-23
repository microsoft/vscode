/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { AbstractEditContextHandler, newlinecount } from 'vs/editor/browser/controller/editContext/editContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ScreenReaderContentHandler } from 'vs/editor/browser/controller/editContext/native/nativeEditContextScreenReaderHandler';
import { NativeEditContext } from 'vs/editor/browser/controller/editContext/native/nativeEditContext';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import * as dom from 'vs/base/browser/dom';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';

export class NativeEditContextHandler extends AbstractEditContextHandler {

	private readonly _domElement: FastDomNode<HTMLDivElement>;
	private readonly _nativeEditContext: NativeEditContext;
	private readonly _screenReaderContentHandler: ScreenReaderContentHandler;

	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _scrollLeft: number = 0;
	private _scrollTop: number = 0;
	private _lineHeight: number;
	private _fontInfo: FontInfo;
	private _hasFocus: boolean = false;

	private _primarySelection: Selection;
	private _primaryCursorPosition: Position = new Position(1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		@IKeybindingService keybindingService: IKeybindingService,
		@IClipboardService clipboardService: IClipboardService
	) {
		super(context);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._primarySelection = new Selection(1, 1, 1, 1);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);

		this._domElement = new FastDomNode(document.createElement('div'));
		this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;

		this._screenReaderContentHandler = new ScreenReaderContentHandler(this._domElement, context, viewController, keybindingService);
		this._nativeEditContext = new NativeEditContext(this._domElement, context, viewController, clipboardService);

		this._register(dom.addDisposableListener(this._domElement.domNode, 'focus', (e) => {
			console.log('focus');
			this._domElement.domNode.style.background = 'yellow';
			this._setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'blur', (e) => {
			console.log('blur');
			this._domElement.domNode.style.background = 'white';
			this._setHasFocus(false);
		}));
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._nativeEditContext.setParent(overflowGuardContainer.domNode);
	}

	public writeScreenReaderContent(reason: string): void {
		this._screenReaderContentHandler.writeScreenReaderContent(reason);
		this._nativeEditContext.writeEditContextContent();
		this._render();
	}

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorPosition = new Position(this._primarySelection.positionLineNumber, this._primarySelection.positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
		this._nativeEditContext.setRenderingContext(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._screenReaderContentHandler.writeScreenReaderContent('render');
		this._nativeEditContext.writeEditContextContent();
		this._render();
	}

	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.selections.slice(0)[0] ?? new Selection(1, 1, 1, 1);
		this._screenReaderContentHandler.onCursorStateChanged(e);
		this._nativeEditContext.onCursorStateChanged(e);
		return true;
	}

	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._nativeEditContext.onScrollChanged(e);
		return true;
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._domElement.setAttribute('wrap', layoutInfo.wrappingColumn !== -1 ? 'on' : 'off');
		const { tabSize } = this._context.viewModel.model.getOptions();
		this._domElement.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._screenReaderContentHandler.onConfigurationChanged(e);
		return true;
	}

	public isFocused(): boolean {
		return this._hasFocus;
	}

	public focusScreenReaderContent(): void {
		this._setHasFocus(true);
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
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

		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domElement, this._fontInfo);
		this._domElement.setTop(top);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const wrappingColumn = layoutInfo.wrappingColumn;
		const isTextWrapping = wrappingColumn !== -1;
		const fontInfo = options.get(EditorOption.fontInfo);
		const textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);

		this._domElement.setTop(top);
		this._domElement.setLeft(isTextWrapping ? this._contentLeft : left);
		this._domElement.setWidth(textAreaWidth);
		this._domElement.setHeight(this._lineHeight);

		// In case the textarea contains a word, we're going to try to align the textarea's cursor
		// with our cursor by scrolling the textarea as much as possible
		this._domElement.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
		const divValue = this._domElement.domNode.textContent ?? '';
		const lineCount = newlinecount(divValue.substring(0, this._screenReaderContentHandler.screenReaderContentSelectionOffsetRange?.start));
		this._domElement.domNode.scrollTop = lineCount * this._lineHeight;
	}
}
