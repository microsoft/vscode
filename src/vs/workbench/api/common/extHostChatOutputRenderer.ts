/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ExtHostChatOutputRendererShape, IMainContext, MainContext, MainThreadChatOutputRendererShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
import { ExtHostWebviews } from './extHostWebview.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { VSBuffer } from '../../../base/common/buffer.js';

export class ExtHostChatOutputRenderer implements ExtHostChatOutputRendererShape {

	private readonly _proxy: MainThreadChatOutputRendererShape;

	private readonly _renderers = new Map</*viewType*/ string, {
		readonly renderer: vscode.ChatOutputRenderer;
		readonly extension: IExtensionDescription;
	}>();

	constructor(
		mainContext: IMainContext,
		private readonly webviews: ExtHostWebviews,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatOutputRenderer);
	}

	registerChatOutputRenderer(extension: IExtensionDescription, viewType: string, renderer: vscode.ChatOutputRenderer): vscode.Disposable {
		if (this._renderers.has(viewType)) {
			throw new Error(`Chat output renderer already registered for: ${viewType}`);
		}

		this._renderers.set(viewType, { extension, renderer });
		this._proxy.$registerChatOutputRenderer(viewType, extension.identifier, extension.extensionLocation);

		return new Disposable(() => {
			this._renderers.delete(viewType);
			this._proxy.$unregisterChatOutputRenderer(viewType);
		});
	}

	async $renderChatOutput(viewType: string, mime: string, valueData: VSBuffer, webviewHandle: string, token: CancellationToken): Promise<void> {
		const entry = this._renderers.get(viewType);
		if (!entry) {
			throw new Error(`No chat output renderer registered for: ${viewType}`);
		}

		const webview = this.webviews.createNewWebview(webviewHandle, {}, entry.extension);
		return entry.renderer.renderChatOutput(Object.freeze({ mime, value: valueData.buffer }), webview, {}, token);
	}
}
