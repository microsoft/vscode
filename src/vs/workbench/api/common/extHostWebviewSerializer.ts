/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as modes from 'vs/editor/common/modes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostWebviews } from 'vs/workbench/api/common/extHostWebview';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol';
import * as extHostTypes from './extHostTypes';

export class ExtHostWebviewSerializer implements extHostProtocol.ExtHostWebviewSerializerShape {

	private readonly _proxy: extHostProtocol.MainThreadWebviewsShape;

	private readonly _serializers = new Map<string, {
		readonly serializer: vscode.WebviewPanelSerializer;
		readonly extension: IExtensionDescription;
	}>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly _webviewService: ExtHostWebviews,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadWebviews);
	}

	public registerWebviewPanelSerializer(
		extension: IExtensionDescription,
		viewType: string,
		serializer: vscode.WebviewPanelSerializer
	): vscode.Disposable {
		if (this._serializers.has(viewType)) {
			throw new Error(`Serializer for '${viewType}' already registered`);
		}

		this._serializers.set(viewType, { serializer, extension });
		this._proxy.$registerSerializer(viewType);

		return new extHostTypes.Disposable(() => {
			this._serializers.delete(viewType);
			this._proxy.$unregisterSerializer(viewType);
		});
	}

	async $deserializeWebviewPanel(
		webviewHandle: extHostProtocol.WebviewPanelHandle,
		viewType: string,
		title: string,
		state: any,
		position: EditorViewColumn,
		options: modes.IWebviewOptions & modes.IWebviewPanelOptions
	): Promise<void> {
		const entry = this._serializers.get(viewType);
		if (!entry) {
			throw new Error(`No serializer found for '${viewType}'`);
		}
		const { serializer, extension } = entry;

		const webview = this._webviewService.createNewWebview(webviewHandle, options, extension);
		const revivedPanel = this._webviewService.createNewWebviewPanel(webviewHandle, viewType, title, position, options, webview);
		await serializer.deserializeWebviewPanel(revivedPanel, state);
	}
}
