/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import type { MainThreadWebviews } from 'vs/workbench/api/browser/mainThreadWebview';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToViewColumn } from 'vs/workbench/api/common/shared/editor';
import { CustomEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { IWebviewWorkbenchService } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class MainThreadWebviewSerializers extends Disposable {

	private readonly _proxy: extHostProtocol.ExtHostWebviewSerializerShape;

	private readonly _revivers = new Map<string, IDisposable>();

	constructor(
		private readonly mainThreadWebviews: MainThreadWebviews,
		context: extHostProtocol.IExtHostContext,
		@IExtensionService extensionService: IExtensionService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviewSerializer);

		// This reviver's only job is to activate extensions.
		// This should trigger the real reviver to be registered from the extension host side.
		this._register(_webviewWorkbenchService.registerResolver({
			canResolve: (webview: WebviewInput) => {
				if (webview instanceof CustomEditorInput) {
					extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
					return false;
				}

				const viewType = this.mainThreadWebviews.webviewPanelViewType.toExternal(webview.viewType);
				if (typeof viewType === 'string') {
					extensionService.activateByEvent(`onWebviewPanel:${viewType}`);
				}
				return false;
			},
			resolveWebview: () => { throw new Error('not implemented'); }
		}));
	}

	public $registerSerializer(viewType: string): void {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reviver for ${viewType} already registered`);
		}

		this._revivers.set(viewType, this._webviewWorkbenchService.registerResolver({
			canResolve: (webviewInput) => {
				return webviewInput.viewType === this.mainThreadWebviews.webviewPanelViewType.fromExternal(viewType);
			},
			resolveWebview: async (webviewInput): Promise<void> => {
				const viewType = this.mainThreadWebviews.webviewPanelViewType.toExternal(webviewInput.viewType);
				if (!viewType) {
					webviewInput.webview.html = this.mainThreadWebviews.getWebviewResolvedFailedContent(webviewInput.viewType);
					return;
				}


				const handle = webviewInput.id;

				this.mainThreadWebviews.addWebviewInput(handle, webviewInput);

				let state = undefined;
				if (webviewInput.webview.state) {
					try {
						state = JSON.parse(webviewInput.webview.state);
					} catch (e) {
						console.error('Could not load webview state', e, webviewInput.webview.state);
					}
				}

				try {
					await this._proxy.$deserializeWebviewPanel(handle, viewType, webviewInput.getTitle(), state, editorGroupToViewColumn(this._editorGroupService, webviewInput.group || 0), webviewInput.webview.options);
				} catch (error) {
					onUnexpectedError(error);
					webviewInput.webview.html = this.mainThreadWebviews.getWebviewResolvedFailedContent(viewType);
				}
			}
		}));
	}

	public $unregisterSerializer(viewType: string): void {
		const reviver = this._revivers.get(viewType);
		if (!reviver) {
			throw new Error(`No reviver for ${viewType} registered`);
		}

		reviver.dispose();
		this._revivers.delete(viewType);
	}
}
