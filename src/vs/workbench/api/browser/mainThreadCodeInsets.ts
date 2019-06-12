/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents, URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { MainContext, MainThreadEditorInsetsShape, IExtHostContext, ExtHostEditorInsetsShape, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from '../common/extHostCustomers';
import { IRange } from 'vs/editor/common/core/range';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IWebviewService, Webview } from 'vs/workbench/contrib/webview/common/webview';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';

// todo@joh move these things back into something like contrib/insets
class EditorWebviewZone implements IViewZone {

	readonly domNode: HTMLElement;
	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;

	private _id: number;
	// suppressMouseDown?: boolean | undefined;
	// heightInPx?: number | undefined;
	// minWidthInPx?: number | undefined;
	// marginDomNode?: HTMLElement | null | undefined;
	// onDomNodeTop?: ((top: number) => void) | undefined;
	// onComputedHeight?: ((height: number) => void) | undefined;

	constructor(
		readonly editor: IActiveCodeEditor,
		readonly range: IRange,
		readonly webview: Webview,
	) {
		this.domNode = document.createElement('div');
		this.afterLineNumber = range.startLineNumber;
		this.afterColumn = range.startColumn;
		this.heightInLines = range.endLineNumber - range.startLineNumber;

		editor.changeViewZones(accessor => this._id = accessor.addZone(this));
		webview.mountTo(this.domNode);
	}

	dispose(): void {
		this.editor.changeViewZones(accessor => accessor.removeZone(this._id));
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

	async $createEditorInset(handle: number, id: string, uri: UriComponents, range: IRange, options: modes.IWebviewOptions): Promise<void> {

		let editor: IActiveCodeEditor | undefined;
		id = id.substr(0, id.indexOf(',')); //todo@joh HACK

		for (const candidate of this._editorService.listCodeEditors()) {
			if (candidate.getId() === id && candidate.hasModel() && candidate.getModel()!.uri.toString() === URI.revive(uri).toString()) {
				editor = candidate;
				break;
			}
		}

		if (!editor) {
			setTimeout(() => this._proxy.$onDidDispose(handle));
			return;
		}

		const disposables = new DisposableStore();

		const webview = this._webviewService.createWebview({
			enableFindWidget: false,
			allowSvgs: false,
			extension: undefined
		}, {
				allowScripts: options.enableScripts
			});

		const webviewZone = new EditorWebviewZone(editor, range, webview);

		const remove = () => {
			disposables.dispose();
			this._proxy.$onDidDispose(handle);
			this._insets.delete(handle);
		};

		disposables.add(editor.onDidChangeModel(remove));
		disposables.add(editor.onDidDispose(remove));
		disposables.add(webviewZone);
		disposables.add(webview);
		disposables.add(webview.onMessage(msg => this._proxy.$onDidReceiveMessage(handle, msg)));

		this._insets.set(handle, webviewZone);
	}

	$disposeEditorInset(handle: number): void {
		const inset = this._insets.get(handle);
		if (inset) {
			this._insets.delete(handle);
			inset.dispose();
		}
	}

	$setHtml(handle: number, value: string): void {
		const inset = this._insets.get(handle);
		if (inset) {
			inset.webview.html = value;
		}
	}

	$setOptions(handle: number, options: modes.IWebviewOptions): void {
		const inset = this._insets.get(handle);
		if (inset) {
			inset.webview.options = options;
		}
	}

	$postMessage(handle: number, value: any): Promise<boolean> {
		const inset = this._insets.get(handle);
		if (inset) {
			inset.webview.sendMessage(value);
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}
}
