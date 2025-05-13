/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ExtHostChatResponseOutputRendererShape, IMainContext, MainContext, MainThreadChatResponseOutputRendererShape } from './extHost.protocol.js';
import { ChatResponseDataPart, Disposable } from './extHostTypes.js';
import { ExtHostWebviews } from './extHostWebview.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { VSBuffer } from '../../../base/common/buffer.js';

export class ExtHostChatResponseOutputRenderer implements ExtHostChatResponseOutputRendererShape {

	private readonly _proxy: MainThreadChatResponseOutputRendererShape;

	private readonly _renderers = new Map</*mime*/ string, { renderer: vscode.ChatResponseOutputRenderer; extension: IExtensionDescription }>();

	constructor(
		mainContext: IMainContext,
		private readonly webviews: ExtHostWebviews,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatResponseOutputRenderer);
	}

	registerChatResponseOutputRenderer(extension: IExtensionDescription, mime: string, renderer: vscode.ChatResponseOutputRenderer): vscode.Disposable {
		if (this._renderers.has(mime)) {
			throw new Error(`Chat response output renderer already registered for mime type: ${mime}`);
		}

		this._renderers.set(mime, { extension, renderer });
		this._proxy.$registerChatResponseOutputRenderer(mime);

		return new Disposable(() => {
			this._renderers.delete(mime);
			this._proxy.$unregisterChatResponseOutputRenderer(mime);
		});
	}

	async $renderChatResponsePart(mime: string, valueData: VSBuffer, webviewHandle: string, token: CancellationToken): Promise<void> {
		const entry = this._renderers.get(mime);
		if (!entry) {
			throw new Error(`No chat response output renderer registered for mime type: ${mime}`);
		}

		const webview = this.webviews.createNewWebview(webviewHandle, {}, entry.extension);

		const part = new ChatResponseDataPart(mime, valueData.buffer);
		return entry.renderer.renderChatResponsePart(part, webview, token);
	}
}
