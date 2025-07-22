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

	private readonly _renderers = new Map</*mime*/ string, {
		readonly renderer: vscode.ChatOutputRenderer;
		readonly extension: IExtensionDescription;
	}>();

	constructor(
		mainContext: IMainContext,
		private readonly webviews: ExtHostWebviews,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatOutputRenderer);
	}

	registerChatOutputRenderer(extension: IExtensionDescription, mime: string, renderer: vscode.ChatOutputRenderer): vscode.Disposable {
		if (this._renderers.has(mime)) {
			throw new Error(`Chat output renderer already registered for mime type: ${mime}`);
		}

		this._renderers.set(mime, { extension, renderer });
		this._proxy.$registerChatOutputRenderer(mime, extension.identifier, extension.extensionLocation);

		return new Disposable(() => {
			this._renderers.delete(mime);
			this._proxy.$unregisterChatOutputRenderer(mime);
		});
	}

	async $renderChatOutput(mime: string, valueData: VSBuffer, webviewHandle: string, token: CancellationToken): Promise<void> {
		const entry = this._renderers.get(mime);
		if (!entry) {
			throw new Error(`No chat output renderer registered for mime type: ${mime}`);
		}

		const webview = this.webviews.createNewWebview(webviewHandle, {}, entry.extension);
		return entry.renderer.renderChatOutput(valueData.buffer, webview, {}, token);
	}
}
