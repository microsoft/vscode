/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as map from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ExtHostContext, ExtHostWebviewsShape, IExtHostContext, MainContext, MainThreadWebviewsShape, WebviewPanelHandle, WebviewPanelShowOptions } from 'vs/workbench/api/node/extHost.protocol';
import { editorGroupToViewColumn, EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/shared/editor';
import { WebviewEditor } from 'vs/workbench/parts/webview/electron-browser/webviewEditor';
import { WebviewEditorInput } from 'vs/workbench/parts/webview/electron-browser/webviewEditorInput';
import { ICreateWebViewShowOptions, IWebviewEditorService, WebviewInputOptions, WebviewReviver } from 'vs/workbench/parts/webview/electron-browser/webviewEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import * as vscode from 'vscode';
import { extHostNamedCustomer } from './extHostCustomers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews implements MainThreadWebviewsShape, WebviewReviver {

	private static readonly viewType = 'mainThreadWebview';

	private static readonly standardSupportedLinkSchemes = ['http', 'https', 'mailto'];

	private static revivalPool = 0;

	private _toDispose: IDisposable[] = [];

	private readonly _proxy: ExtHostWebviewsShape;
	private readonly _webviews = new Map<WebviewPanelHandle, WebviewEditorInput>();
	private readonly _revivers = new Set<string>();

	private _activeWebview: WebviewPanelHandle | undefined = undefined;

	constructor(
		context: IExtHostContext,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWebviewEditorService private readonly _webviewService: IWebviewEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostWebviews);
		_editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this._toDispose);
		_editorService.onDidVisibleEditorsChange(this.onVisibleEditorsChanged, this, this._toDispose);

		this._toDispose.push(_webviewService.registerReviver(MainThreadWebviews.viewType, this));

		lifecycleService.onBeforeShutdown(e => {
			e.veto(this._onBeforeShutdown());
		}, this, this._toDispose);
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	public $createWebviewPanel(
		handle: WebviewPanelHandle,
		viewType: string,
		title: string,
		showOptions: { viewColumn: EditorViewColumn | null, preserveFocus: boolean },
		options: WebviewInputOptions,
		extensionId: ExtensionIdentifier,
		extensionLocation: UriComponents
	): void {
		const mainThreadShowOptions: ICreateWebViewShowOptions = Object.create(null);
		if (showOptions) {
			mainThreadShowOptions.preserveFocus = showOptions.preserveFocus;
			mainThreadShowOptions.group = viewColumnToEditorGroup(this._editorGroupService, showOptions.viewColumn);
		}

		const webview = this._webviewService.createWebview(MainThreadWebviews.viewType, title, mainThreadShowOptions, reviveWebviewOptions(options), URI.revive(extensionLocation), this.createWebviewEventDelegate(handle));
		webview.state = {
			viewType: viewType,
			state: undefined
		};

		this._webviews.set(handle, webview);
		this._activeWebview = handle;

		/* __GDPR__
			"webviews:createWebviewPanel" : {
				"extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('webviews:createWebviewPanel', { extensionId: extensionId.value });
	}

	public $disposeWebview(handle: WebviewPanelHandle): void {
		const webview = this.getWebview(handle);
		webview.dispose();
	}

	public $setTitle(handle: WebviewPanelHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.setName(value);
	}

	public $setIconPath(handle: WebviewPanelHandle, value: { light: UriComponents, dark: UriComponents } | undefined): void {
		const webview = this.getWebview(handle);
		webview.iconPath = reviveWebviewIcon(value);
	}

	public $setHtml(handle: WebviewPanelHandle, value: string): void {
		const webview = this.getWebview(handle);
		webview.html = value;
	}

	public $setOptions(handle: WebviewPanelHandle, options: vscode.WebviewOptions): void {
		const webview = this.getWebview(handle);
		webview.setOptions(reviveWebviewOptions(options));
	}

	public $reveal(handle: WebviewPanelHandle, showOptions: WebviewPanelShowOptions): void {
		const webview = this.getWebview(handle);
		if (webview.isDisposed()) {
			return;
		}

		const targetGroup = this._editorGroupService.getGroup(viewColumnToEditorGroup(this._editorGroupService, showOptions.viewColumn));

		this._webviewService.revealWebview(webview, targetGroup || this._editorGroupService.activeGroup, showOptions.preserveFocus);
	}

	public $postMessage(handle: WebviewPanelHandle, message: any): Promise<boolean> {
		const webview = this.getWebview(handle);
		const editors = this._editorService.visibleControls
			.filter(e => e instanceof WebviewEditor)
			.map(e => e as WebviewEditor)
			.filter(e => e.input.matches(webview));

		for (const editor of editors) {
			editor.sendMessage(message);
		}

		return Promise.resolve(editors.length > 0);
	}

	public $registerSerializer(viewType: string): void {
		this._revivers.add(viewType);
	}

	public $unregisterSerializer(viewType: string): void {
		this._revivers.delete(viewType);
	}

	public reviveWebview(webview: WebviewEditorInput): Promise<void> {
		const viewType = webview.state.viewType;
		return Promise.resolve(this._extensionService.activateByEvent(`onWebviewPanel:${viewType}`).then(() => {
			const handle = 'revival-' + MainThreadWebviews.revivalPool++;
			this._webviews.set(handle, webview);
			webview._events = this.createWebviewEventDelegate(handle);

			let state = undefined;
			if (webview.state.state) {
				try {
					state = JSON.parse(webview.state.state);
				} catch {
					// noop
				}
			}

			return this._proxy.$deserializeWebviewPanel(handle, webview.state.viewType, webview.getTitle(), state, editorGroupToViewColumn(this._editorGroupService, webview.group), webview.options)
				.then(undefined, error => {
					onUnexpectedError(error);

					webview.html = MainThreadWebviews.getDeserializationFailedContents(viewType);
				});
		}));
	}

	public canRevive(webview: WebviewEditorInput): boolean {
		if (webview.isDisposed() || !webview.state) {
			return false;
		}

		return this._revivers.has(webview.state.viewType) || !!webview.reviver;
	}

	private _onBeforeShutdown(): boolean {
		this._webviews.forEach((view) => {
			if (this.canRevive(view)) {
				view.state.state = view.webviewState;
			}
		});
		return false; // Don't veto shutdown
	}

	private createWebviewEventDelegate(handle: WebviewPanelHandle) {
		return {
			onDidClickLink: uri => this.onDidClickLink(handle, uri),
			onMessage: message => this._proxy.$onMessage(handle, message),
			onDispose: () => {
				const cleanUp = () => {
					this._webviews.delete(handle);
				};
				this._proxy.$onDidDisposeWebviewPanel(handle).then(
					cleanUp,
					cleanUp);
			}
		};
	}

	private onActiveEditorChanged() {
		const activeEditor = this._editorService.activeControl;
		let newActiveWebview: { input: WebviewEditorInput, handle: WebviewPanelHandle } | undefined = undefined;
		if (activeEditor && activeEditor.input instanceof WebviewEditorInput) {
			for (const handle of map.keys(this._webviews)) {
				const input = this._webviews.get(handle);
				if (input.matches(activeEditor.input)) {
					newActiveWebview = { input, handle };
					break;
				}
			}
		}

		if (newActiveWebview && newActiveWebview.handle === this._activeWebview) {
			// Webview itself unchanged but position may have changed
			this._proxy.$onDidChangeWebviewPanelViewState(newActiveWebview.handle, {
				active: true,
				visible: true,
				position: editorGroupToViewColumn(this._editorGroupService, newActiveWebview.input.group)
			});
			return;
		}

		// Broadcast view state update for currently active
		if (typeof this._activeWebview !== 'undefined') {
			const oldActiveWebview = this._webviews.get(this._activeWebview);
			if (oldActiveWebview) {
				this._proxy.$onDidChangeWebviewPanelViewState(this._activeWebview, {
					active: false,
					visible: this._editorService.visibleControls.some(editor => editor.input && editor.input.matches(oldActiveWebview)),
					position: editorGroupToViewColumn(this._editorGroupService, oldActiveWebview.group),
				});
			}
		}

		// Then for newly active
		if (newActiveWebview) {
			this._proxy.$onDidChangeWebviewPanelViewState(newActiveWebview.handle, {
				active: true,
				visible: true,
				position: editorGroupToViewColumn(this._editorGroupService, activeEditor.group)
			});
			this._activeWebview = newActiveWebview.handle;
		} else {
			this._activeWebview = undefined;
		}
	}

	private onVisibleEditorsChanged(): void {
		this._webviews.forEach((input, handle) => {
			for (const workbenchEditor of this._editorService.visibleControls) {
				if (workbenchEditor.input && workbenchEditor.input.matches(input)) {
					const editorPosition = editorGroupToViewColumn(this._editorGroupService, workbenchEditor.group);

					input.updateGroup(workbenchEditor.group.id);
					this._proxy.$onDidChangeWebviewPanelViewState(handle, {
						active: handle === this._activeWebview,
						visible: true,
						position: editorPosition
					});
					break;
				}
			}
		});
	}

	private onDidClickLink(handle: WebviewPanelHandle, link: URI): void {
		if (!link) {
			return;
		}

		const webview = this.getWebview(handle);
		const enableCommandUris = webview.options.enableCommandUris;
		if (MainThreadWebviews.standardSupportedLinkSchemes.indexOf(link.scheme) >= 0 || enableCommandUris && link.scheme === 'command') {
			this._openerService.open(link);
		}
	}

	private getWebview(handle: WebviewPanelHandle): WebviewEditorInput {
		const webview = this._webviews.get(handle);
		if (!webview) {
			throw new Error('Unknown webview handle:' + handle);
		}
		return webview;
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

function reviveWebviewOptions(options: WebviewInputOptions): WebviewInputOptions {
	return {
		...options,
		localResourceRoots: Array.isArray(options.localResourceRoots) ? options.localResourceRoots.map(URI.revive) : undefined
	};
}

function reviveWebviewIcon(
	value: { light: UriComponents, dark: UriComponents } | undefined
): { light: URI, dark: URI } | undefined {
	if (!value) {
		return undefined;
	}

	return {
		light: URI.revive(value.light),
		dark: URI.revive(value.dark)
	};
}
