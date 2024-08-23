/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { AbstractEditContextHandler } from 'vs/editor/browser/controller/editContext/editContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ScreenReaderContentHandler } from 'vs/editor/browser/controller/editContext/native/nativeEditContextScreenReaderHandler';
import { NativeEditContext } from 'vs/editor/browser/controller/editContext/native/nativeEditContext';
import { RestrictedRenderingContext, RenderingContext } from 'vs/editor/browser/view/renderingContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export class NativeEditContextHandler extends AbstractEditContextHandler {

	private readonly _domElement: FastDomNode<HTMLDivElement>;
	private readonly _screenReaderContentHandler: ScreenReaderContentHandler;
	private readonly _nativeEditContext: NativeEditContext;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		@IKeybindingService keybindingService: IKeybindingService,
		@IClipboardService clipboardService: IClipboardService
	) {
		super(context);
		this._domElement = new FastDomNode(document.createElement('div'));
		this._domElement.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		const options = this._context.configuration.options;
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));

		this._screenReaderContentHandler = new ScreenReaderContentHandler(this._domElement, context, viewController, keybindingService, clipboardService);
		this._nativeEditContext = new NativeEditContext(this._domElement, context, viewController);
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._nativeEditContext.setParent(overflowGuardContainer.domNode);
	}

	public writeScreenReaderContent(reason: string): void {
		this._screenReaderContentHandler.writeScreenReaderContent(reason);
		this._nativeEditContext.writeEditContextContent();
	}

	public prepareRender(ctx: RenderingContext): void {
		this._screenReaderContentHandler.prepareRender(ctx);
		this._nativeEditContext.setRenderingContext(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._screenReaderContentHandler.writeScreenReaderContent('render');
		this._nativeEditContext.writeEditContextContent();
	}

	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._screenReaderContentHandler.onCursorStateChanged(e);
		this._nativeEditContext.onCursorStateChanged(e);
		return true;
	}

	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._screenReaderContentHandler.onScrollChanged(e);
		this._nativeEditContext.onScrollChanged(e);
		return true;
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		this._domElement.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._screenReaderContentHandler.onConfigurationChanged(e);
		return true;
	}

	public isFocused(): boolean {
		return this._screenReaderContentHandler.isFocused();
	}

	public focusScreenReaderContent(): void {
		this._screenReaderContentHandler.focusScreenReaderContent();
	}

	public refreshFocusState(): void {
		this._screenReaderContentHandler.refreshFocusState();
	}

	public setAriaOptions(options: IEditorAriaOptions): void { }
}
