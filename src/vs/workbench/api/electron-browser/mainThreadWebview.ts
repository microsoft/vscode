/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as map from 'vs/base/common/map';
import { MainThreadWebviewsShape, MainContext, IExtHostContext, ExtHostContext, ExtHostWebviewsShape, WebviewHandle } from 'vs/workbench/api/node/extHost.protocol';
import { dispose, Disposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from './extHostCustomers';
import { Position } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as vscode from 'vscode';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import URI from 'vs/base/common/uri';
import { WebviewInput } from 'vs/workbench/parts/webview/electron-browser/webviewInput';
import { WebviewEditor } from 'vs/workbench/parts/webview/electron-browser/webviewEditor';


@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews implements MainThreadWebviewsShape {
	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private _toDispose: Disposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<WebviewHandle, WebviewInput>();

	private _activeWebview: WebviewInput | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IPartService private readonly _partService: IPartService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IEditorGroupService private readonly _editorGroupService: IEditorGroupService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
		_editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this._toDispose);
	}

	dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	$createWebview(
		handle: WebviewHandle,
		viewType: string,
		title: string,
		column: Position,
		options: vscode.WebviewOptions,
		extensionFolderPath: string
	): void {
		const webviewInput = new WebviewInput(URI.parse('webview://' + handle), title, options, '', {
			onMessage: message => this._proxy.$onMessage(handle, message),
			onDidChangePosition: position => this._proxy.$onDidChangePosition(handle, position),
			onDispose: () => {
				this._proxy.$onDidDisposeWeview(handle).then(() => {
					this._webviews.delete(handle);
				});
			},
			onDidClickLink: (link, options) => this.onDidClickLink(link, options)
		}, this._partService);

		this._webviews.set(handle, webviewInput);

		this._editorService.openEditor(webviewInput, { pinned: true }, column);
	}

	$disposeWebview(handle: WebviewHandle): void {
		const webview = this.getWebview(handle);
		if (webview) {
			this._editorService.closeEditor(webview.position, webview);
		}
	}

	$setTitle(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setName(value);
	}

	$setHtml(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setHtml(value);
	}

	$show(handle: WebviewHandle, column: Position): void {
		const webviewInput = this.getWebview(handle);
		if (webviewInput.position === column) {
			this._editorService.openEditor(webviewInput, { preserveFocus: true }, column);
		} else {
			this._editorGroupService.moveEditor(webviewInput, webviewInput.position, column, { preserveFocus: true });
		}
	}

	async $sendMessage(handle: WebviewHandle, message: any): Promise<boolean> {
		const webviewInput = this.getWebview(handle);
		const editors = this._editorService.getVisibleEditors()
			.filter(e => e instanceof WebviewEditor)
			.map(e => e as WebviewEditor)
			.filter(e => e.input.matches(webviewInput));

		for (const editor of editors) {
			editor.sendMessage(message);
		}

		return (editors.length > 0);
	}

	private getWebview(handle: number): WebviewInput {
		const webviewInput = this._webviews.get(handle);
		if (!webviewInput) {
			throw new Error('Unknown webview handle:' + handle);
		}
		return webviewInput;
	}

	private onEditorsChanged() {
		const activeEditor = this._editorService.getActiveEditor();
		let newActiveWebview: { input: WebviewInput, handle: WebviewHandle } | undefined = undefined;
		if (activeEditor && activeEditor.input instanceof WebviewInput) {
			for (const handle of map.keys(this._webviews)) {
				const input = this._webviews.get(handle);
				if (input.matches(activeEditor.input)) {
					newActiveWebview = { input, handle };
					break;
				}
			}
		}

		if (newActiveWebview) {
			if (!this._activeWebview || !newActiveWebview.input.matches(this._activeWebview)) {
				this._proxy.$onDidChangeActiveWeview(newActiveWebview.handle);
				this._activeWebview = newActiveWebview.input;
			}
		} else {
			if (this._activeWebview) {
				this._proxy.$onDidChangeActiveWeview(undefined);
				this._activeWebview = undefined;
			}
		}
	}

	private onDidClickLink(link: URI, options: vscode.WebviewOptions): void {
		if (!link) {
			return;
		}

		const enableCommandUris = options.enableCommandUris;
		if (MainThreadWebviews.standardSupportedLinkSchemes.indexOf(link.scheme) >= 0 || enableCommandUris && link.scheme === 'command') {
			this._openerService.open(link);
		}
	}
}
