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
import * as vscode from 'vscode';
import { WebviewEditorInput } from 'vs/workbench/parts/webview/electron-browser/webviewInput';
import { WebviewEditor } from 'vs/workbench/parts/webview/electron-browser/webviewEditor';
import { IWebviewService, WebviewReviver } from 'vs/workbench/parts/webview/electron-browser/webviewService';
import { IEditorGroupService } from '../../services/group/common/groupService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { IExtensionService } from '../../services/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews implements MainThreadWebviewsShape, WebviewReviver {

	private static readonly viewType = 'mainThreadWebview';

	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private static revivalPool = 0;

	private _toDispose: Disposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<WebviewHandle, WebviewEditorInput>();
	private readonly _revivers = new Set<string>();

	private _activeWebview: WebviewEditorInput | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IEditorGroupService _editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
		_editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this._toDispose);

		_webviewService.registerReviver(MainThreadWebviews.viewType, this);
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
		const webview = this._webviewService.createWebview(MainThreadWebviews.viewType, title, column, options, extensionFolderPath, {
			onDidClickLink: uri => this.onDidClickLink(uri, webview.options),
			onMessage: message => this._proxy.$onMessage(handle, message),
			onDidChangePosition: position => this._proxy.$onDidChangePosition(handle, position),
			onDispose: () => {
				this._proxy.$onDidDisposeWeview(handle).then(() => {
					this._webviews.delete(handle);
				});
			}
		});

		webview.state = {
			viewType: viewType,
			state: undefined
		};

		this._webviews.set(handle, webview);
	}

	$disposeWebview(handle: WebviewHandle): void {
		const webview = this.getWebview(handle);
		webview.dispose();
	}

	$setTitle(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setName(value);
	}

	$setHtml(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.html = value;
	}

	$setState(handle: WebviewHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.state.state = value;
	}

	$reveal(handle: WebviewHandle, column: Position): void {
		const webview = this.getWebview(handle);
		this._webviewService.revealWebview(webview, column);
	}

	async $sendMessage(handle: WebviewHandle, message: any): Promise<boolean> {
		const webview = this.getWebview(handle);
		const editors = this._editorService.getVisibleEditors()
			.filter(e => e instanceof WebviewEditor)
			.map(e => e as WebviewEditor)
			.filter(e => e.input.matches(webview));

		for (const editor of editors) {
			editor.sendMessage(message);
		}

		return (editors.length > 0);
	}

	$registerReviver(viewType: string): void {
		this._revivers.add(viewType);
	}

	$unregisterReviver(viewType: string): void {
		this._revivers.delete(viewType);
	}

	reviveWebview(webview: WebviewEditorInput) {
		this._extensionService.activateByEvent(`onView:${webview.state.viewType}`).then(() => {
			const handle = 'revival-' + MainThreadWebviews.revivalPool++;
			this._webviews.set(handle, webview);

			webview._events = {
				onDidClickLink: uri => this.onDidClickLink(uri, webview.options),
				onMessage: message => this._proxy.$onMessage(handle, message),
				onDidChangePosition: position => this._proxy.$onDidChangePosition(handle, position),
				onDispose: () => {
					this._proxy.$onDidDisposeWeview(handle).then(() => {
						this._webviews.delete(handle);
					});
				}
			};

			this._proxy.$reviveWebview(handle, webview.state.viewType, webview.state.state, webview.position, webview.options);
		});
	}

	canRevive(webview: WebviewEditorInput): boolean {
		return this._revivers.has(webview.viewType) || webview.reviver !== null;
	}

	private getWebview(handle: WebviewHandle): WebviewEditorInput {
		const webview = this._webviews.get(handle);
		if (!webview) {
			throw new Error('Unknown webview handle:' + handle);
		}
		return webview;
	}

	private onEditorsChanged() {
		const activeEditor = this._editorService.getActiveEditor();
		let newActiveWebview: { input: WebviewEditorInput, handle: WebviewHandle } | undefined = undefined;
		if (activeEditor && activeEditor.input instanceof WebviewEditorInput) {
			for (const handle of map.keys(this._webviews)) {
				const input = this._webviews.get(handle);
				if (input.matches(activeEditor.input)) {
					newActiveWebview = { input, handle };
					break;
				}
			}
		}

		if (newActiveWebview) {
			if (!this._activeWebview || newActiveWebview.input !== this._activeWebview) {
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
