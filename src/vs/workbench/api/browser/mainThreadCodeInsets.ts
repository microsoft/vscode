/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../base/browser/dom.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IActiveCodeEditor, IViewZone } from '../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { reviveWebviewContentOptions } from './mainThreadWebviews.js';
import { ExtHostContext, ExtHostEditorInsetsShape, IWebviewContentOptions, MainContext, MainThreadEditorInsetsShape } from '../common/extHost.protocol.js';
import { IWebviewService, IWebviewElement } from '../../contrib/webview/browser/webview.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

// todo@jrieken move these things back into something like contrib/insets
class EditorWebviewZone implements IViewZone {

	readonly domNode: HTMLElement;
	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;

	private _id?: string;
	// suppressMouseDown?: boolean | undefined;
	// heightInPx?: number | undefined;
	// minWidthInPx?: number | undefined;
	// marginDomNode?: HTMLElement | null | undefined;
	// onDomNodeTop?: ((top: number) => void) | undefined;
	// onComputedHeight?: ((height: number) => void) | undefined;

	constructor(
		readonly editor: IActiveCodeEditor,
		readonly line: number,
		readonly height: number,
		readonly webview: IWebviewElement,
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.zIndex = '10'; // without this, the webview is not interactive
		this.afterLineNumber = line;
		this.afterColumn = 1;
		this.heightInLines = height;

		editor.changeViewZones(accessor => this._id = accessor.addZone(this));
		webview.mountTo(this.domNode, getWindow(editor.getDomNode()));
	}

	dispose(): void {
		this.editor.changeViewZones(accessor => this._id && accessor.removeZone(this._id));
	}
}

@extHostNamedCustomer(MainContext.MainThreadEditorInsets)
export class MainThreadEditorInsets implements MainThreadEditorInsetsShape {

	private readonly _proxy: ExtHostEditorInsetsShape;
	private readonly _disposables = new DisposableStore();
	private readonly _insets = new Map<number, EditorWebviewZone>();

	constructor(
		context: IExtHostContext,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostEditorInsets);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	async $createEditorInset(handle: number, id: string, uri: UriComponents, line: number, height: number, options: IWebviewContentOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): Promise<void> {

		let editor: IActiveCodeEditor | undefined;
		id = id.substr(0, id.indexOf(',')); //todo@jrieken HACK

		for (const candidate of this._editorService.listCodeEditors()) {
			if (candidate.getId() === id && candidate.hasModel() && isEqual(candidate.getModel().uri, URI.revive(uri))) {
				editor = candidate;
				break;
			}
		}

		if (!editor) {
			setTimeout(() => this._proxy.$onDidDispose(handle));
			return;
		}

		const disposables = new DisposableStore();

		const webview = this._webviewService.createWebviewElement({
			title: undefined,
			options: {
				enableFindWidget: false,
			},
			contentOptions: reviveWebviewContentOptions(options),
			extension: { id: extensionId, location: URI.revive(extensionLocation) }
		});

		const webviewZone = new EditorWebviewZone(editor, line, height, webview);

		const remove = () => {
			disposables.dispose();
			this._proxy.$onDidDispose(handle);
			this._insets.delete(handle);
		};

		disposables.add(editor.onDidChangeModel(remove));
		disposables.add(editor.onDidDispose(remove));
		disposables.add(webviewZone);
		disposables.add(webview);
		disposables.add(webview.onMessage(msg => this._proxy.$onDidReceiveMessage(handle, msg.message)));

		this._insets.set(handle, webviewZone);
	}

	$disposeEditorInset(handle: number): void {
		const inset = this.getInset(handle);
		this._insets.delete(handle);
		inset.dispose();
	}

	$setHtml(handle: number, value: string): void {
		const inset = this.getInset(handle);
		inset.webview.setHtml(value);
	}

	$setOptions(handle: number, options: IWebviewContentOptions): void {
		const inset = this.getInset(handle);
		inset.webview.contentOptions = reviveWebviewContentOptions(options);
	}

	async $postMessage(handle: number, value: unknown): Promise<boolean> {
		const inset = this.getInset(handle);
		inset.webview.postMessage(value);
		return true;
	}

	private getInset(handle: number): EditorWebviewZone {
		const inset = this._insets.get(handle);
		if (!inset) {
			throw new Error('Unknown inset');
		}
		return inset;
	}
}
