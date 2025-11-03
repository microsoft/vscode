/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource, DeferredPromise } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { SerializedError, transformErrorForSerialization, transformErrorFromSerialization } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { resizeImage } from '../../contrib/chat/browser/imageUtils.js';
import { ILanguageModelIgnoredFilesService } from '../../contrib/chat/common/ignoredFiles.js';
import { IChatMessage, IChatResponsePart, ILanguageModelChatResponse, ILanguageModelChatSelector, ILanguageModelsService } from '../../contrib/chat/common/languageModels.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostLanguageModelsShape, MainContext, MainThreadLanguageModelsShape } from '../common/extHost.protocol.js';
import { LanguageModelError } from '../common/extHostTypes.js';

@extHostNamedCustomer(MainContext.MainThreadLanguageModels)
export class MainThreadLanguageModels implements MainThreadLanguageModelsShape {

	private readonly _proxy: ExtHostLanguageModelsShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<string>();
	private readonly _lmProviderChange = new Emitter<{ vendor: string }>();
	private readonly _pendingProgress = new Map<number, { defer: DeferredPromise<unknown>; stream: AsyncIterableSource<IChatResponsePart | IChatResponsePart[]> }>();
	private readonly _ignoredFileProviderRegistrations = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelsService private readonly _chatProviderService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILanguageModelIgnoredFilesService private readonly _ignoredFilesService: ILanguageModelIgnoredFilesService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
	}

	dispose(): void {
		this._lmProviderChange.dispose();
		this._providerRegistrations.dispose();
		this._ignoredFileProviderRegistrations.dispose();
		this._store.dispose();
	}

	$registerLanguageModelProvider(vendor: string): void {
		const disposables = new DisposableStore();
		try {
			disposables.add(this._chatProviderService.registerLanguageModelProvider(vendor, {
				onDidChange: Event.filter(this._lmProviderChange.event, e => e.vendor === vendor, disposables) as unknown as Event<void>,
				provideLanguageModelChatInfo: async (options, token) => {
					const modelsAndIdentifiers = await this._proxy.$provideLanguageModelChatInfo(vendor, options, token);
					modelsAndIdentifiers.forEach(m => {
						if (m.metadata.auth) {
							disposables.add(this._registerAuthenticationProvider(m.metadata.extension, m.metadata.auth));
						}
					});
					return modelsAndIdentifiers;
				},
				sendChatRequest: async (modelId, messages, from, options, token) => {
					const requestId = (Math.random() * 1e6) | 0;
					const defer = new DeferredPromise<unknown>();
					const stream = new AsyncIterableSource<IChatResponsePart | IChatResponsePart[]>();

					try {
						this._pendingProgress.set(requestId, { defer, stream });
						await Promise.all(
							messages.flatMap(msg => msg.content)
								.filter(part => part.type === 'image_url')
								.map(async part => {
									part.value.data = VSBuffer.wrap(await resizeImage(part.value.data.buffer));
								})
						);
						await this._proxy.$startChatRequest(modelId, requestId, from, new SerializableObjectWithBuffers(messages), options, token);
					} catch (err) {
						this._pendingProgress.delete(requestId);
						throw err;
					}

					return {
						result: defer.p,
						stream: stream.asyncIterable
					} satisfies ILanguageModelChatResponse;
				},
				provideTokenCount: (modelId, str, token) => {
					return this._proxy.$provideTokenLength(modelId, str, token);
				},
			}));
			this._providerRegistrations.set(vendor, disposables);
		} catch (err) {
			disposables.dispose();
			throw err;
		}
	}

	$onLMProviderChange(vendor: string): void {
		this._lmProviderChange.fire({ vendor });
	}

	async $reportResponsePart(requestId: number, chunk: SerializableObjectWithBuffers<IChatResponsePart | IChatResponsePart[]>): Promise<void> {
		const data = this._pendingProgress.get(requestId);
		this._logService.trace('[LM] report response PART', Boolean(data), requestId, chunk);
		if (data) {
			data.stream.emitOne(chunk.value);
		}
	}

	async $reportResponseDone(requestId: number, err: SerializedError | undefined): Promise<void> {
		const data = this._pendingProgress.get(requestId);
		this._logService.trace('[LM] report response DONE', Boolean(data), requestId, err);
		if (data) {
			this._pendingProgress.delete(requestId);
			if (err) {
				const error = LanguageModelError.tryDeserialize(err) ?? transformErrorFromSerialization(err);
				data.stream.reject(error);
				data.defer.error(error);
			} else {
				data.stream.resolve();
				data.defer.complete(undefined);
			}
		}
	}

	$unregisterProvider(vendor: string): void {
		this._providerRegistrations.deleteAndDispose(vendor);
	}

	$selectChatModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		return this._chatProviderService.selectLanguageModels(selector);
	}

	async $tryStartChatRequest(extension: ExtensionIdentifier, modelIdentifier: string, requestId: number, messages: SerializableObjectWithBuffers<IChatMessage[]>, options: {}, token: CancellationToken): Promise<void> {
		this._logService.trace('[CHAT] request STARTED', extension.value, requestId);

		let response: ILanguageModelChatResponse;
		try {
			response = await this._chatProviderService.sendChatRequest(modelIdentifier, extension, messages.value, options, token);
		} catch (err) {
			this._logService.error('[CHAT] request FAILED', extension.value, requestId, err);
			throw err;
		}

		// !!! IMPORTANT !!!
		// This method must return before the response is done (has streamed all parts)
		// and because of that we consume the stream without awaiting
		// !!! IMPORTANT !!!
		const streaming = (async () => {
			try {
				for await (const part of response.stream) {
					this._logService.trace('[CHAT] request PART', extension.value, requestId, part);
					await this._proxy.$acceptResponsePart(requestId, new SerializableObjectWithBuffers(part));
				}
				this._logService.trace('[CHAT] request DONE', extension.value, requestId);
			} catch (err) {
				this._logService.error('[CHAT] extension request ERRORED in STREAM', toErrorMessage(err, true), extension.value, requestId);
				this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
			}
		})();

		// When the response is done (signaled via its result) we tell the EH
		Promise.allSettled([response.result, streaming]).then(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
			this._proxy.$acceptResponseDone(requestId, undefined);
		}, err => {
			this._logService.error('[CHAT] extension request ERRORED', toErrorMessage(err, true), extension.value, requestId);
			this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
		});
	}


	$countTokens(modelId: string, value: string | IChatMessage, token: CancellationToken): Promise<number> {
		return this._chatProviderService.computeTokenLength(modelId, value, token);
	}

	private _registerAuthenticationProvider(extension: ExtensionIdentifier, auth: { providerLabel: string; accountLabel?: string | undefined }): IDisposable {
		// This needs to be done in both MainThread & ExtHost ChatProvider
		const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;

		// Only register one auth provider per extension
		if (this._authenticationService.getProviderIds().includes(authProviderId)) {
			return Disposable.None;
		}

		const accountLabel = auth.accountLabel ?? localize('languageModelsAccountId', 'Language Models');
		const disposables = new DisposableStore();
		this._authenticationService.registerAuthenticationProvider(authProviderId, new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabel));
		disposables.add(toDisposable(() => {
			this._authenticationService.unregisterAuthenticationProvider(authProviderId);
		}));
		disposables.add(this._authenticationAccessService.onDidChangeExtensionSessionAccess(async (e) => {
			const allowedExtensions = this._authenticationAccessService.readAllowedExtensions(authProviderId, accountLabel);
			const accessList = [];
			for (const allowedExtension of allowedExtensions) {
				const from = await this._extensionService.getExtension(allowedExtension.id);
				if (from) {
					accessList.push({
						from: from.identifier,
						to: extension,
						enabled: allowedExtension.allowed ?? true
					});
				}
			}
			this._proxy.$updateModelAccesslist(accessList);
		}));
		return disposables;
	}

	$fileIsIgnored(uri: UriComponents, token: CancellationToken): Promise<boolean> {
		return this._ignoredFilesService.fileIsIgnored(URI.revive(uri), token);
	}

	$registerFileIgnoreProvider(handle: number): void {
		this._ignoredFileProviderRegistrations.set(handle, this._ignoredFilesService.registerIgnoredFileProvider({
			isFileIgnored: async (uri: URI, token: CancellationToken) => this._proxy.$isFileIgnored(handle, uri, token)
		}));
	}

	$unregisterFileIgnoreProvider(handle: number): void {
		this._ignoredFileProviderRegistrations.deleteAndDispose(handle);
	}
}

// The fake AuthenticationProvider that will be used to gate access to the Language Model. There will be one per provider.
class LanguageModelAccessAuthProvider implements IAuthenticationProvider {
	supportsMultipleAccounts = false;

	// Important for updating the UI
	private _onDidChangeSessions: Emitter<AuthenticationSessionsChangeEvent> = new Emitter<AuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private _session: AuthenticationSession | undefined;

	constructor(readonly id: string, readonly label: string, private readonly _accountLabel: string) { }

	async getSessions(scopes?: string[] | undefined): Promise<readonly AuthenticationSession[]> {
		// If there are no scopes and no session that means no extension has requested a session yet
		// and the user is simply opening the Account menu. In that case, we should not return any "sessions".
		if (scopes === undefined && !this._session) {
			return [];
		}
		if (this._session) {
			return [this._session];
		}
		return [await this.createSession(scopes || [])];
	}
	async createSession(scopes: string[]): Promise<AuthenticationSession> {
		this._session = this._createFakeSession(scopes);
		this._onDidChangeSessions.fire({ added: [this._session], changed: [], removed: [] });
		return this._session;
	}
	removeSession(sessionId: string): Promise<void> {
		if (this._session) {
			this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session] });
			this._session = undefined;
		}
		return Promise.resolve();
	}

	confirmation(extensionName: string, _recreatingSession: boolean): string {
		return localize('confirmLanguageModelAccess', "The extension '{0}' wants to access the language models provided by {1}.", extensionName, this.label);
	}

	private _createFakeSession(scopes: string[]): AuthenticationSession {
		return {
			id: 'fake-session',
			account: {
				id: this.id,
				label: this._accountLabel,
			},
			accessToken: 'fake-access-token',
			scopes,
		};
	}
}
