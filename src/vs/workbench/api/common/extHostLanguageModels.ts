/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLanguageModelsShape, IMainContext, MainContext, MainThreadLanguageModelsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';
import { Progress } from 'vs/platform/progress/common/progress';
import { IChatMessage, IChatResponseFragment, ILanguageModelChatMetadata } from 'vs/workbench/contrib/chat/common/languageModels';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { AsyncIterableSource } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtHostAuthentication } from 'vs/workbench/api/common/extHostAuthentication';
import { localize } from 'vs/nls';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { toErrorMessage } from 'vs/base/common/errorMessage';

type LanguageModelData = {
	readonly extension: ExtensionIdentifier;
	readonly provider: vscode.ChatResponseProvider;
};

class LanguageModelResponseStream {

	readonly stream = new AsyncIterableSource<string>();

	constructor(
		readonly option: number,
		stream?: AsyncIterableSource<string>
	) {
		this.stream = stream ?? new AsyncIterableSource<string>();
	}
}

class LanguageModelRequest {

	readonly apiObject: vscode.LanguageModelResponse;

	private readonly _responseStreams = new Map<number, LanguageModelResponseStream>();
	private readonly _defaultStream = new AsyncIterableSource<string>();
	private _isDone: boolean = false;

	constructor(
		promise: Promise<any>,
		readonly cts: CancellationTokenSource
	) {
		const that = this;
		this.apiObject = {
			result: promise,
			stream: that._defaultStream.asyncIterable,
			// responses: AsyncIterable<string>[] // FUTURE responses per N
		};

		promise.then(() => {
			for (const stream of this._streams()) {
				stream.resolve();
			}
		}).catch(err => {
			if (!(err instanceof Error)) {
				err = new Error(toErrorMessage(err), { cause: err });
			}
			for (const stream of this._streams()) {
				stream.reject(err);
			}
		}).finally(() => {
			this._isDone = true;
		});
	}

	private * _streams() {
		if (this._responseStreams.size > 0) {
			for (const [, value] of this._responseStreams) {
				yield value.stream;
			}
		} else {
			yield this._defaultStream;
		}
	}

	handleFragment(fragment: IChatResponseFragment): void {
		if (this._isDone) {
			return;
		}
		let res = this._responseStreams.get(fragment.index);
		if (!res) {
			if (this._responseStreams.size === 0) {
				// the first response claims the default response
				res = new LanguageModelResponseStream(fragment.index, this._defaultStream);
			} else {
				res = new LanguageModelResponseStream(fragment.index);
			}
			this._responseStreams.set(fragment.index, res);
		}
		res.stream.emitOne(fragment.part);
	}

}

export class ExtHostLanguageModels implements ExtHostLanguageModelsShape {

	private static _idPool = 1;

	private readonly _proxy: MainThreadLanguageModelsShape;
	private readonly _onDidChangeModelAccess = new Emitter<{ from: ExtensionIdentifier; to: ExtensionIdentifier }>();
	private readonly _onDidChangeProviders = new Emitter<vscode.LanguageModelChangeEvent>();
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private readonly _languageModels = new Map<number, LanguageModelData>();
	private readonly _languageModelIds = new Set<string>(); // these are ALL models, not just the one in this EH
	private readonly _modelAccessList = new ExtensionIdentifierMap<ExtensionIdentifierSet>();
	private readonly _pendingRequest = new Map<number, { languageModelId: string; res: LanguageModelRequest }>();


	constructor(
		mainContext: IMainContext,
		private readonly _logService: ILogService,
		private readonly _extHostAuthentication: ExtHostAuthentication,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModels);
	}

	dispose(): void {
		this._onDidChangeModelAccess.dispose();
		this._onDidChangeProviders.dispose();
	}

	registerLanguageModel(extension: IExtensionDescription, identifier: string, provider: vscode.ChatResponseProvider, metadata: vscode.ChatResponseProviderMetadata): IDisposable {

		const handle = ExtHostLanguageModels._idPool++;
		this._languageModels.set(handle, { extension: extension.identifier, provider });
		let auth;
		if (metadata.auth) {
			auth = {
				providerLabel: extension.displayName || extension.name,
				accountLabel: typeof metadata.auth === 'object' ? metadata.auth.label : undefined
			};
		}
		this._proxy.$registerLanguageModelProvider(handle, identifier, {
			extension: extension.identifier,
			model: metadata.name ?? '',
			auth
		});

		return toDisposable(() => {
			this._languageModels.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	async $provideLanguageModelResponse(handle: number, requestId: number, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<any> {
		const data = this._languageModels.get(handle);
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

		return data.provider.provideLanguageModelResponse2(messages.map(typeConvert.LanguageModelMessage.to), options, ExtensionIdentifier.toKey(from), progress, token);
	}

	//#region --- making request

	$updateLanguageModels(data: { added?: string[] | undefined; removed?: string[] | undefined }): void {
		const added: string[] = [];
		const removed: string[] = [];
		if (data.added) {
			for (const id of data.added) {
				this._languageModelIds.add(id);
				added.push(id);
			}
		}
		if (data.removed) {
			for (const id of data.removed) {
				// clean up
				this._languageModelIds.delete(id);
				removed.push(id);

				// cancel pending requests for this model
				for (const [key, value] of this._pendingRequest) {
					if (value.languageModelId === id) {
						value.res.cts.cancel();
						this._pendingRequest.delete(key);
					}
				}
			}
		}

		this._onDidChangeProviders.fire(Object.freeze({
			added: Object.freeze(added),
			removed: Object.freeze(removed)
		}));
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._languageModelIds);
	}

	$updateModelAccesslist(data: { from: ExtensionIdentifier; to: ExtensionIdentifier; enabled: boolean }[]): void {
		const updated = new Array<{ from: ExtensionIdentifier; to: ExtensionIdentifier }>();
		for (const { from, to, enabled } of data) {
			const set = this._modelAccessList.get(from) ?? new ExtensionIdentifierSet();
			const oldValue = set.has(to);
			if (oldValue !== enabled) {
				if (enabled) {
					set.add(to);
				} else {
					set.delete(to);
				}
				this._modelAccessList.set(from, set);
				const newItem = { from, to };
				updated.push(newItem);
				this._onDidChangeModelAccess.fire(newItem);
			}
		}
	}

	async requestLanguageModelAccess(extension: IExtensionDescription, languageModelId: string, options?: vscode.LanguageModelAccessOptions): Promise<vscode.LanguageModelAccess> {
		const from = extension.identifier;
		const justification = options?.justification;
		const metadata = await this._proxy.$prepareChatAccess(from, languageModelId, justification);

		if (!metadata) {
			throw new Error(`Language model '${languageModelId}' NOT found`);
		}

		if (this._isUsingAuth(from, metadata)) {
			await this._getAuthAccess(extension, { identifier: metadata.extension, displayName: metadata.auth.providerLabel }, justification);
		}

		const that = this;

		return {
			get model() {
				return metadata.model;
			},
			get isRevoked() {
				return (that._isUsingAuth(from, metadata) && !that._modelAccessList.get(from)?.has(metadata.extension)) || !that._languageModelIds.has(languageModelId);
			},
			get onDidChangeAccess() {
				const onDidRemoveLM = Event.filter(that._onDidChangeProviders.event, e => e.removed.includes(languageModelId));
				const onDidChangeModelAccess = Event.filter(that._onDidChangeModelAccess.event, e => ExtensionIdentifier.equals(e.from, from) && ExtensionIdentifier.equals(e.to, metadata.extension));
				return Event.signal(Event.any(onDidRemoveLM, onDidChangeModelAccess));
			},
			makeChatRequest(messages, options, token) {
				if (that._isUsingAuth(from, metadata) && !that._modelAccessList.get(from)?.has(metadata.extension)) {
					throw new Error('Access to chat has been revoked');
				}
				if (!that._languageModelIds.has(languageModelId)) {
					throw new Error('Language Model has been removed');
				}
				const cts = new CancellationTokenSource(token);
				const requestId = (Math.random() * 1e6) | 0;
				const requestPromise = that._proxy.$fetchResponse(from, languageModelId, requestId, messages.map(typeConvert.LanguageModelMessage.from), options ?? {}, cts.token);
				const res = new LanguageModelRequest(requestPromise, cts);
				that._pendingRequest.set(requestId, { languageModelId, res });

				requestPromise.finally(() => {
					that._pendingRequest.delete(requestId);
					cts.dispose();
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

	// BIG HACK: Using AuthenticationProviders to check access to Language Models
	private async _getAuthAccess(from: IExtensionDescription, to: { identifier: ExtensionIdentifier; displayName: string }, justification?: string): Promise<void> {
		// This needs to be done in both MainThread & ExtHost ChatProvider
		const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + to.identifier.value;
		const session = await this._extHostAuthentication.getSession(from, providerId, [], { silent: true });
		if (!session) {
			try {
				const detail = justification
					? localize('chatAccessWithJustification', "To allow access to the language models provided by {0}. Justification:\n\n{1}", to.displayName, justification)
					: localize('chatAccess', "To allow access to the language models provided by {0}", to.displayName);
				await this._extHostAuthentication.getSession(from, providerId, [], { forceNewSession: { detail } });
			} catch (err) {
				throw new Error('Access to language models has not been granted');
			}
		}

		this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
	}

	private _isUsingAuth(from: ExtensionIdentifier, toMetadata: ILanguageModelChatMetadata): toMetadata is ILanguageModelChatMetadata & { auth: NonNullable<ILanguageModelChatMetadata['auth']> } {
		// If the 'to' extension uses an auth check
		return !!toMetadata.auth
			// And we're asking from a different extension
			&& !ExtensionIdentifier.equals(toMetadata.extension, from);
	}
}
