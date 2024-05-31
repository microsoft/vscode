/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource, Barrier } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { Progress } from 'vs/platform/progress/common/progress';
import { ExtHostLanguageModelsShape, MainContext, MainThreadLanguageModelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostAuthentication } from 'vs/workbench/api/common/extHostAuthentication';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatMessage, IChatResponseFragment, ILanguageModelChatMetadata } from 'vs/workbench/contrib/chat/common/languageModels';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import type * as vscode from 'vscode';

export interface IExtHostLanguageModels extends ExtHostLanguageModels { }

export const IExtHostLanguageModels = createDecorator<IExtHostLanguageModels>('IExtHostLanguageModels');

type LanguageModelData = {
	readonly languageModelId: string;
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

class LanguageModelResponse {

	readonly apiObject: vscode.LanguageModelChatResponse;

	private readonly _responseStreams = new Map<number, LanguageModelResponseStream>();
	private readonly _defaultStream = new AsyncIterableSource<string>();
	private _isDone: boolean = false;
	private _isStreaming: boolean = false;

	constructor() {

		const that = this;
		this.apiObject = {
			// result: promise,
			text: that._defaultStream.asyncIterable,
			// streams: AsyncIterable<string>[] // FUTURE responses per N
		};
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
		this._isStreaming = true;
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

	get isStreaming(): boolean {
		return this._isStreaming;
	}

	reject(err: Error): void {
		this._isDone = true;
		for (const stream of this._streams()) {
			stream.reject(err);
		}
	}

	resolve(): void {
		this._isDone = true;
		for (const stream of this._streams()) {
			stream.resolve();
		}
	}
}

export class ExtHostLanguageModels implements ExtHostLanguageModelsShape {

	declare _serviceBrand: undefined;

	private static _idPool = 1;

	private readonly _proxy: MainThreadLanguageModelsShape;
	private readonly _onDidChangeModelAccess = new Emitter<{ from: ExtensionIdentifier; to: ExtensionIdentifier }>();
	private readonly _onDidChangeProviders = new Emitter<void>();
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private readonly _languageModels = new Map<number, LanguageModelData>();
	private readonly _allLanguageModelData = new Map<string, { metadata: ILanguageModelChatMetadata; apiObjects: ExtensionIdentifierMap<vscode.LanguageModelChat> }>(); // these are ALL models, not just the one in this EH
	private readonly _modelAccessList = new ExtensionIdentifierMap<ExtensionIdentifierSet>();
	private readonly _pendingRequest = new Map<number, { languageModelId: string; res: LanguageModelResponse }>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
		@IExtHostAuthentication private readonly _extHostAuthentication: IExtHostAuthentication,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadLanguageModels);
	}

	dispose(): void {
		this._onDidChangeModelAccess.dispose();
		this._onDidChangeProviders.dispose();
	}

	registerLanguageModel(extension: IExtensionDescription, identifier: string, provider: vscode.ChatResponseProvider, metadata: vscode.ChatResponseProviderMetadata): IDisposable {

		const handle = ExtHostLanguageModels._idPool++;
		this._languageModels.set(handle, { extension: extension.identifier, provider, languageModelId: identifier });
		let auth;
		if (metadata.auth) {
			auth = {
				providerLabel: extension.displayName || extension.name,
				accountLabel: typeof metadata.auth === 'object' ? metadata.auth.label : undefined
			};
		}
		this._proxy.$registerLanguageModelProvider(handle, `${ExtensionIdentifier.toKey(extension.identifier)}/${handle}/${identifier}`, {
			extension: extension.identifier,
			id: identifier,
			vendor: metadata.vendor ?? ExtensionIdentifier.toKey(extension.identifier),
			name: metadata.name ?? '',
			family: metadata.family ?? '',
			version: metadata.version,
			maxInputTokens: metadata.maxInputTokens,
			maxOutputTokens: metadata.maxOutputTokens,
			auth,
			targetExtensions: metadata.extensions
		});

		const responseReceivedListener = provider.onDidReceiveLanguageModelResponse2?.(({ extensionId, participant, tokenCount }) => {
			this._proxy.$whenLanguageModelChatRequestMade(identifier, new ExtensionIdentifier(extensionId), participant, tokenCount);
		});

		return toDisposable(() => {
			this._languageModels.delete(handle);
			this._proxy.$unregisterProvider(handle);
			responseReceivedListener?.dispose();
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

		return data.provider.provideLanguageModelResponse(
			messages.map(typeConvert.LanguageModelChatMessage.to),
			options,
			ExtensionIdentifier.toKey(from),
			progress,
			token
		);
	}


	//#region --- token counting

	$provideTokenLength(handle: number, value: string, token: CancellationToken): Promise<number> {
		const data = this._languageModels.get(handle);
		if (!data) {
			return Promise.resolve(0);
		}
		return Promise.resolve(data.provider.provideTokenCount(value, token));
	}


	//#region --- making request

	$acceptChatModelMetadata(data: { added?: { identifier: string; metadata: ILanguageModelChatMetadata }[] | undefined; removed?: string[] | undefined }): void {
		if (data.added) {
			for (const { identifier, metadata } of data.added) {
				this._allLanguageModelData.set(identifier, { metadata, apiObjects: new ExtensionIdentifierMap() });
			}
		}
		if (data.removed) {
			for (const id of data.removed) {
				// clean up
				this._allLanguageModelData.delete(id);

				// cancel pending requests for this model
				for (const [key, value] of this._pendingRequest) {
					if (value.languageModelId === id) {
						value.res.reject(new CancellationError());
						this._pendingRequest.delete(key);
					}
				}
			}
		}

		// TODO@jrieken@TylerLeonhardt - this is a temporary hack to populate the auth providers
		data.added?.forEach(added => this._fakeAuthPopulate(added.metadata));

		this._onDidChangeProviders.fire(undefined);
	}

	async selectLanguageModels(extension: IExtensionDescription, selector: vscode.LanguageModelChatSelector) {

		// this triggers extension activation
		const models = await this._proxy.$selectChatModels({ ...selector, extension: extension.identifier });

		const result: vscode.LanguageModelChat[] = [];
		const that = this;
		for (const identifier of models) {
			const data = this._allLanguageModelData.get(identifier);
			if (!data) {
				// model gone? is this an error on us?
				continue;
			}

			// make sure auth information is correct
			if (this._isUsingAuth(extension.identifier, data.metadata)) {
				await this._fakeAuthPopulate(data.metadata);
			}

			let apiObject = data.apiObjects.get(extension.identifier);

			if (!apiObject) {
				apiObject = {
					id: identifier,
					vendor: data.metadata.vendor,
					family: data.metadata.family,
					version: data.metadata.version,
					name: data.metadata.name,
					maxInputTokens: data.metadata.maxInputTokens,
					countTokens(text, token) {
						if (!that._allLanguageModelData.has(identifier)) {
							throw extHostTypes.LanguageModelError.NotFound(identifier);
						}
						return that._computeTokenLength(identifier, text, token ?? CancellationToken.None);
					},
					sendRequest(messages, options, token) {
						if (!that._allLanguageModelData.has(identifier)) {
							throw extHostTypes.LanguageModelError.NotFound(identifier);
						}
						return that._sendChatRequest(extension, identifier, messages, options ?? {}, token ?? CancellationToken.None);
					}
				};

				Object.freeze(apiObject);
				data.apiObjects.set(extension.identifier, apiObject);
			}

			result.push(apiObject);
		}

		return result;
	}

	private async _sendChatRequest(extension: IExtensionDescription, languageModelId: string, messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions, token: CancellationToken) {

		const internalMessages: IChatMessage[] = this._convertMessages(extension, messages);

		const from = extension.identifier;
		const metadata = this._allLanguageModelData.get(languageModelId)?.metadata;

		if (!metadata || !this._allLanguageModelData.has(languageModelId)) {
			throw extHostTypes.LanguageModelError.NotFound(`Language model '${languageModelId}' is unknown.`);
		}

		if (this._isUsingAuth(from, metadata)) {
			const success = await this._getAuthAccess(extension, { identifier: metadata.extension, displayName: metadata.auth.providerLabel }, options.justification, false);

			if (!success || !this._modelAccessList.get(from)?.has(metadata.extension)) {
				throw extHostTypes.LanguageModelError.NoPermissions(`Language model '${languageModelId}' cannot be used by '${from.value}'.`);
			}
		}

		const requestId = (Math.random() * 1e6) | 0;
		const requestPromise = this._proxy.$fetchResponse(from, languageModelId, requestId, internalMessages, options.modelOptions ?? {}, token);

		const barrier = new Barrier();

		const res = new LanguageModelResponse();
		this._pendingRequest.set(requestId, { languageModelId, res });

		let error: Error | undefined;

		requestPromise.catch(err => {
			if (barrier.isOpen()) {
				// we received an error while streaming. this means we need to reject the "stream"
				// because we have already returned the request object
				res.reject(err);
			} else {
				error = err;
			}
		}).finally(() => {
			this._pendingRequest.delete(requestId);
			res.resolve();
			barrier.open();
		});

		await barrier.wait();

		if (error) {
			if (error.name === extHostTypes.LanguageModelError.name) {
				throw error;
			}

			throw new extHostTypes.LanguageModelError(
				`Language model '${languageModelId}' errored, check cause for more details`,
				'Unknown',
				error
			);
		}

		return res.apiObject;
	}

	private _convertMessages(extension: IExtensionDescription, messages: vscode.LanguageModelChatMessage[]) {
		const internalMessages: IChatMessage[] = [];
		for (const message of messages) {
			if (message.role as number === extHostTypes.LanguageModelChatMessageRole.System) {
				checkProposedApiEnabled(extension, 'languageModelSystem');
			}
			internalMessages.push(typeConvert.LanguageModelChatMessage.from(message));
		}
		return internalMessages;
	}

	async $handleResponseFragment(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		const data = this._pendingRequest.get(requestId);//.report(chunk);
		if (data) {
			data.res.handleFragment(chunk);
		}
	}

	// BIG HACK: Using AuthenticationProviders to check access to Language Models
	private async _getAuthAccess(from: IExtensionDescription, to: { identifier: ExtensionIdentifier; displayName: string }, justification: string | undefined, silent: boolean | undefined): Promise<boolean> {
		// This needs to be done in both MainThread & ExtHost ChatProvider
		const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + to.identifier.value;
		const session = await this._extHostAuthentication.getSession(from, providerId, [], { silent: true });

		if (session) {
			this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
			return true;
		}

		if (silent) {
			return false;
		}

		try {
			const detail = justification
				? localize('chatAccessWithJustification', "Justification: {1}", to.displayName, justification)
				: undefined;
			await this._extHostAuthentication.getSession(from, providerId, [], { forceNewSession: { detail } });
			this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
			return true;

		} catch (err) {
			// ignore
			return false;
		}
	}

	private _isUsingAuth(from: ExtensionIdentifier, toMetadata: ILanguageModelChatMetadata): toMetadata is ILanguageModelChatMetadata & { auth: NonNullable<ILanguageModelChatMetadata['auth']> } {
		// If the 'to' extension uses an auth check
		return !!toMetadata.auth
			// And we're asking from a different extension
			&& !ExtensionIdentifier.equals(toMetadata.extension, from);
	}

	private async _fakeAuthPopulate(metadata: ILanguageModelChatMetadata): Promise<void> {

		if (!metadata.auth) {
			return;
		}

		for (const from of this._languageAccessInformationExtensions) {
			try {
				await this._getAuthAccess(from, { identifier: metadata.extension, displayName: '' }, undefined, true);
			} catch (err) {
				this._logService.error('Fake Auth request failed');
				this._logService.error(err);
			}
		}
	}

	private async _computeTokenLength(languageModelId: string, value: string | vscode.LanguageModelChatMessage, token: vscode.CancellationToken): Promise<number> {

		const data = this._allLanguageModelData.get(languageModelId);
		if (!data) {
			throw extHostTypes.LanguageModelError.NotFound(`Language model '${languageModelId}' is unknown.`);
		}

		const local = Iterable.find(this._languageModels.values(), candidate => candidate.languageModelId === languageModelId);
		if (local) {
			// stay inside the EH
			return local.provider.provideTokenCount(value, token);
		}

		return this._proxy.$countTokens(languageModelId, (typeof value === 'string' ? value : typeConvert.LanguageModelChatMessage.from(value)), token);
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

	private readonly _languageAccessInformationExtensions = new Set<Readonly<IExtensionDescription>>();

	createLanguageModelAccessInformation(from: Readonly<IExtensionDescription>): vscode.LanguageModelAccessInformation {

		this._languageAccessInformationExtensions.add(from);

		const that = this;
		const _onDidChangeAccess = Event.signal(Event.filter(this._onDidChangeModelAccess.event, e => ExtensionIdentifier.equals(e.from, from.identifier)));
		const _onDidAddRemove = Event.signal(this._onDidChangeProviders.event);

		return {
			get onDidChange() {
				return Event.any(_onDidChangeAccess, _onDidAddRemove);
			},
			canSendRequest(chat: vscode.LanguageModelChat): boolean | undefined {

				let metadata: ILanguageModelChatMetadata | undefined;

				out: for (const [_, value] of that._allLanguageModelData) {
					for (const candidate of value.apiObjects.values()) {
						if (candidate === chat) {
							metadata = value.metadata;
							break out;
						}
					}
				}
				if (!metadata) {
					return undefined;
				}
				if (!that._isUsingAuth(from.identifier, metadata)) {
					return true;
				}

				const list = that._modelAccessList.get(from.identifier);
				if (!list) {
					return undefined;
				}
				return list.has(metadata.extension);
			}
		};
	}
}
