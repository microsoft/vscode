/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as map from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Position } from 'vs/platform/editor/common/editor';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ExtHostContext, ExtHostWebviewsShape, IExtHostContext, MainContext, MainThreadWebviewsShape, WebviewHandle } from 'vs/workbench/api/node/extHost.protocol';
import { WebviewEditor } from 'vs/workbench/parts/webview/electron-browser/webviewEditor';
import { WebviewEditorInput } from 'vs/workbench/parts/webview/electron-browser/webviewEditorInput';
import { IWebviewEditorService, WebviewInputOptions, WebviewReviver } from 'vs/workbench/parts/webview/electron-browser/webviewEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { extHostNamedCustomer } from './extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews implements MainThreadWebviewsShape, WebviewReviver {

	private static readonly serializeTimeout = 500; // ms

	private static readonly viewType = 'mainThreadWebview';

	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private static revivalPool = 0;

	private _toDispose: IDisposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<WebviewHandle, WebviewEditorInput>();
	private readonly _revivers = new Set<string>();

	private _activeWebview: WebviewEditorInput | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IWebviewEditorService private readonly _webviewService: IWebviewEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IExtensionService private readonly _extensionService: IExtensionService,

	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
		editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this._toDispose);

		_webviewService.registerReviver(MainThreadWebviews.viewType, this);
		this._toDispose.push(lifecycleService.onWillShutdown(e => {
			e.veto(this._onWillShutdown());
		}));
	}

	dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	$createWebview(
		handle: WebviewHandle,
		viewType: string,
		title: string,
		column: Position,
		options: WebviewInputOptions,
		extensionFolderPath: string
	): void {
		const webview = this._webviewService.createWebview(MainThreadWebviews.viewType, title, column, options, extensionFolderPath, this.createWebviewEventDelegate(handle));
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

	$reveal(handle: WebviewHandle, column: Position): void {
		const webview = this.getWebview(handle);
		this._webviewService.revealWebview(webview, column);
	}

	async $sendMessage(handle: WebviewHandle, message: any): TPromise<boolean> {
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

	$registerSerializer(viewType: string): void {
		this._revivers.add(viewType);
	}

	$unregisterSerializer(viewType: string): void {
		this._revivers.delete(viewType);
	}

	reviveWebview(webview: WebviewEditorInput): TPromise<void> {
		const viewType = webview.state.viewType;
		return this._extensionService.activateByEvent(`onView:${viewType}`).then(() => {
			const handle = 'revival-' + MainThreadWebviews.revivalPool++;
			this._webviews.set(handle, webview);
			webview._events = this.createWebviewEventDelegate(handle);

			return this._proxy.$deserializeWebview(handle, webview.state.viewType, webview.state.state, webview.position, webview.options)
				.then(undefined, () => {
					webview.html = MainThreadWebviews.getDeserializationFailedContents(viewType);
				});
		});
	}

	canRevive(webview: WebviewEditorInput): boolean {
		return this._revivers.has(webview.viewType) || webview.reviver !== null;
	}

	private _onWillShutdown(): TPromise<boolean> {
		const toRevive: WebviewHandle[] = [];
		this._webviews.forEach((view, key) => {
			if (this.canRevive(view)) {
				toRevive.push(key);
			}
		});

		const reviveResponses = toRevive.map(handle =>
			TPromise.any([
				this._proxy.$serializeWebview(handle).then(
					state => ({ handle, state }),
					() => ({ handle, state: null })),
				TPromise.timeout(MainThreadWebviews.serializeTimeout).then(() => ({ handle, state: null }))
			]).then(x => x.value));

		return TPromise.join(reviveResponses).then(results => {
			for (const result of results) {
				const view = this._webviews.get(result.handle);
				if (view) {
					if (result.state) {
						view.state.state = result.state;
					} else {
						view.state = null;
					}
				}
			}
			return false; // Don't veto shutdown
		});
	}

	private createWebviewEventDelegate(handle: WebviewHandle) {
		return {
			onDidClickLink: uri => this.onDidClickLink(handle, uri),
			onMessage: message => this._proxy.$onMessage(handle, message),
			onDidChangePosition: position => this._proxy.$onDidChangePosition(handle, position),
			onDispose: () => {
				this._proxy.$onDidDisposeWeview(handle).then(() => {
					this._webviews.delete(handle);
				});
			}
		};
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

	private onDidClickLink(handle: WebviewHandle, link: URI): void {
		if (!link) {
			return;
		}

		const webview = this.getWebview(handle);
		const enableCommandUris = webview.options.enableCommandUris;
		if (MainThreadWebviews.standardSupportedLinkSchemes.indexOf(link.scheme) >= 0 || enableCommandUris && link.scheme === 'command') {
			this._openerService.open(link);
		}
	}

	private static getDeserializationFailedContents(viewType: string) {
		return `<!DOCTYPE html>
		<html>
			<head>
				<base href="https://code.visualstudio.com/raw/">
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src vscode-core-resource: https: 'unsafe-inline'; child-src 'none'; frame-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while restoring view:{0}", viewType)}</body>
		</html>`;
	}
}
