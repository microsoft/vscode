/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatProviderShape, IMainContext, MainContext, MainThreadChatProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';
import { Progress } from 'vs/platform/progress/common/progress';
import { IChatMessage, IChatResponseFragment } from 'vs/workbench/contrib/chat/common/chatProvider';
import { ExtensionIdentifier, ExtensionIdentifierMap } from 'vs/platform/extensions/common/extensions';

type ProviderData = {
	readonly extension: ExtensionIdentifier;
	readonly provider: vscode.ChatResponseProvider;
};

export class ExtHostChatProvider implements ExtHostChatProviderShape {

	private static _idPool = 1;

	private readonly _proxy: MainThreadChatProviderShape;
	private readonly _providers = new Map<number, ProviderData>();

	constructor(
		mainContext: IMainContext,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatProvider);
	}

	registerProvider(extension: ExtensionIdentifier, identifier: string, provider: vscode.ChatResponseProvider, metadata: vscode.ChatResponseProviderMetadata): IDisposable {

		const handle = ExtHostChatProvider._idPool++;
		this._providers.set(handle, { extension, provider });
		this._proxy.$registerProvider(handle, identifier, { extension, displayName: metadata.name ?? extension.value });

		return toDisposable(() => {
			this._proxy.$unregisterProvider(handle);
			this._providers.delete(handle);
		});
	}

	async $provideChatResponse(handle: number, requestId: number, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<any> {
		const data = this._providers.get(handle);
		if (!data) {
			return;
		}
		const progress = new Progress<vscode.ChatResponseFragment>(async fragment => {
			if (token.isCancellationRequested) {
				this._logService.warn(`[CHAT](${data.extension.value}) CANNOT send progress because the REQUEST IS CANCELLED`);
				return;
			}
			await this._proxy.$handleProgressChunk(requestId, { index: fragment.index, part: fragment.part });
		}, { async: true });

		return data.provider.provideChatResponse(messages.map(typeConvert.ChatMessage.to), options, progress, token);
	}

	//#region --- making request

	private readonly _pendingRequest = new Map<number, vscode.Progress<vscode.ChatResponseFragment>>();

	private readonly _chatAccessAllowList = new ExtensionIdentifierMap<Promise<unknown>>();

	allowListExtensionWhile(extension: ExtensionIdentifier, promise: Promise<unknown>): void {
		this._chatAccessAllowList.set(extension, promise);
		promise.finally(() => this._chatAccessAllowList.delete(extension));
	}

	async requestChatResponseProvider(from: ExtensionIdentifier, identifier: string): Promise<vscode.ChatAccess> {
		// check if a UI command is running/active

		if (!this._chatAccessAllowList.has(from)) {
			throw new Error('Extension is NOT allowed to make chat requests');
		}

		const that = this;

		return {
			get isRevoked() {
				return !that._chatAccessAllowList.has(from);
			},
			async makeRequest(messages, options, progress, token) {

				if (!that._chatAccessAllowList.has(from)) {
					throw new Error('Access to chat has been revoked');
				}

				const requestId = (Math.random() * 1e6) | 0;
				that._pendingRequest.set(requestId, progress);
				try {
					await that._proxy.$fetchResponse(from, identifier, requestId, messages.map(typeConvert.ChatMessage.from), options, token);
				} finally {
					that._pendingRequest.delete(requestId);
				}
			},
		};
	}

	async $handleResponseFragment(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		this._pendingRequest.get(requestId)?.report(chunk);
	}
}
