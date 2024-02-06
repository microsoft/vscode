/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatProviderShape, IMainContext, MainContext, MainThreadChatProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';
import { Progress } from 'vs/platform/progress/common/progress';
import { IChatMessage, IChatResponseFragment } from 'vs/workbench/contrib/chat/common/chatProvider';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from 'vs/platform/extensions/common/extensions';
import { AsyncIterableSource } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';

type ProviderData = {
	readonly extension: ExtensionIdentifier;
	readonly provider: vscode.ChatResponseProvider;
};

class ChatResponseStream {

	readonly apiObj: vscode.ChatResponseStream;
	readonly stream = new AsyncIterableSource<string>();

	constructor(option: number, stream?: AsyncIterableSource<string>) {
		this.stream = stream ?? new AsyncIterableSource<string>();
		const that = this;
		this.apiObj = {
			option: option,
			response: that.stream.asyncIterable
		};
	}
}

class ChatRequest {

	readonly apiObject: vscode.ChatRequest;

	private readonly _onDidStart = new Emitter<vscode.ChatResponseStream>();
	private readonly _responseStreams = new Map<number, ChatResponseStream>();
	private readonly _defaultStream = new AsyncIterableSource<string>();
	private _isDone: boolean = false;

	constructor(
		promise: Promise<any>,
		cts: CancellationTokenSource
	) {
		const that = this;
		this.apiObject = {
			result: promise,
			response: that._defaultStream.asyncIterable,
			onDidStartResponseStream: that._onDidStart.event,
			cancel() { cts.cancel(); },
		};

		promise.finally(() => {
			this._isDone = true;
			if (this._responseStreams.size > 0) {
				for (const [, value] of this._responseStreams) {
					value.stream.resolve();
				}
			} else {
				this._defaultStream.resolve();
			}
		});
	}

	handleFragment(fragment: IChatResponseFragment): void {
		if (this._isDone) {
			return;
		}
		let res = this._responseStreams.get(fragment.index);
		if (!res) {
			if (this._responseStreams.size === 0) {
				// the first response claims the default response
				res = new ChatResponseStream(fragment.index, this._defaultStream);
			} else {
				res = new ChatResponseStream(fragment.index);
			}
			this._responseStreams.set(fragment.index, res);
			this._onDidStart.fire(res.apiObj);
		}
		res.stream.emitOne(fragment.part);
	}

}

export class ExtHostChatProvider implements ExtHostChatProviderShape {

	private static _idPool = 1;

	private readonly _proxy: MainThreadChatProviderShape;
	private readonly _providers = new Map<number, ProviderData>();
	private readonly _onDidChangeAccess = new Emitter<ExtensionIdentifierSet>();
	private readonly _onDidChangeProviders = new Emitter<{ added: string[]; removed: string[] }>();

	constructor(
		mainContext: IMainContext,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatProvider);
	}

	dispose(): void {
		this._onDidChangeAccess.dispose();
		this._onDidChangeProviders.dispose();
	}

	registerProvider(extension: ExtensionIdentifier, identifier: string, provider: vscode.ChatResponseProvider, metadata: vscode.ChatResponseProviderMetadata): IDisposable {

		const handle = ExtHostChatProvider._idPool++;
		this._providers.set(handle, { extension, provider });
		this._proxy.$registerProvider(handle, identifier, { extension, model: metadata.name ?? '' });

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
			this._proxy.$handleProgressChunk(requestId, { index: fragment.index, part: fragment.part });
		});

		return data.provider.provideChatResponse(messages.map(typeConvert.ChatMessage.to), options, progress, token);
	}

	//#region --- making request


	private readonly _accessAllowlist = new ExtensionIdentifierMap<boolean>();
	private readonly _providerIds = new Set<string>();

	private readonly _pendingRequest = new Map<number, { res: ChatRequest }>();


	$updateProviderList(data: { added?: string[] | undefined; removed?: string[] | undefined }): void {
		const added: string[] = [];
		const removed: string[] = [];
		if (data.added) {
			for (const id of data.added) {
				this._providerIds.add(id);
				added.push(id);
			}
		}
		if (data.removed) {
			for (const id of data.removed) {
				this._providerIds.delete(id);
				removed.push(id);
			}
		}
		this._onDidChangeProviders.fire({ added, removed });
	}

	getProviderIds(): string[] {
		return Array.from(this._providerIds);
	}

	$updateAllowlist(data: { extension: ExtensionIdentifier; allowed: boolean }[]): void {
		const updated = new ExtensionIdentifierSet();
		for (const { extension, allowed } of data) {
			const oldValue = this._accessAllowlist.get(extension);
			if (oldValue !== allowed) {
				this._accessAllowlist.set(extension, allowed);
				updated.add(extension);
			}
		}
		this._onDidChangeAccess.fire(updated);
	}

	async requestChatResponseProvider(from: ExtensionIdentifier, identifier: string): Promise<vscode.ChatAccess> {
		// check if a UI command is running/active

		if (!this._accessAllowlist.get(from)) {
			throw new Error('Extension is NOT allowed to make chat requests');
		}

		const metadata = await this._proxy.$prepareChatAccess(identifier);
		if (!metadata) {
			throw new Error(`ChatAccess '${identifier}' NOT found`);
		}

		const that = this;

		return {
			get model() {
				return metadata.model;
			},
			get isRevoked() {
				return !that._accessAllowlist.get(from);
			},
			get onDidChangeAccess() {
				return Event.signal(Event.filter(that._onDidChangeAccess.event, set => set.has(from)));
			},
			makeRequest(messages, options, token) {

				if (!that._accessAllowlist.get(from)) {
					throw new Error('Access to chat has been revoked');
				}

				const cts = new CancellationTokenSource(token);
				const requestId = (Math.random() * 1e6) | 0;
				const requestPromise = that._proxy.$fetchResponse(from, identifier, requestId, messages.map(typeConvert.ChatMessage.from), options ?? {}, cts.token);
				const res = new ChatRequest(requestPromise, cts);
				that._pendingRequest.set(requestId, { res });

				requestPromise.finally(() => {
					that._pendingRequest.delete(requestId);
				});

				return res.apiObject;
			},
		};
	}

	async $handleResponseFragment(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		const data = this._pendingRequest.get(requestId);//.report(chunk);
		if (data) {
			data.res.handleFragment(chunk);
		}
	}
}
