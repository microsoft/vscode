/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource, DeferredPromise } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError, SerializedError, transformErrorFromSerialization } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { equalSets } from '../../../base/common/collections.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { resizeImage } from '../../contrib/chat/browser/chatImageUtils.js';
import { ILanguageModelIgnoredFilesService } from '../../contrib/chat/common/ignoredFiles.js';
import { getLanguageModelAccessAccountName, IChatMessage, IChatResponsePart, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatResponse, ILanguageModelChatSelector, ILanguageModelsService } from '../../contrib/chat/common/languageModels.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationProviderSessionOptions, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostLanguageModelsShape, MainContext, MainThreadLanguageModelsShape } from '../common/extHost.protocol.js';
import { LanguageModelError, serializeLanguageModelError } from '../common/extHostTypes.js';

class RequestCancellationTokenSource extends Disposable {

	private readonly _source: CancellationTokenSource;

	constructor(parent: CancellationToken, onCancellationRequested?: () => void) {
		super();
		this._source = this._register(new CancellationTokenSource(parent));
		if (onCancellationRequested) {
			this._register(this._source.token.onCancellationRequested(onCancellationRequested));
		}
	}

	get token(): CancellationToken {
		return this._source.token;
	}

	cancel(): void {
		this._source.cancel();
	}
}

@extHostNamedCustomer(MainContext.MainThreadLanguageModels)
export class MainThreadLanguageModels implements MainThreadLanguageModelsShape {

	private readonly _proxy: ExtHostLanguageModelsShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<string>();
	private readonly _authenticationProviderRegistrations = new DisposableMap<string>();
	private readonly _providerModelMetadata = new Map<string, ILanguageModelChatMetadataAndIdentifier[]>();
	private readonly _lmProviderChange = new Emitter<{ vendor: string }>();
	private readonly _pendingProgress = new Map<number, { defer: DeferredPromise<unknown>; stream: AsyncIterableSource<IChatResponsePart | IChatResponsePart[]> }>();
	private readonly _pendingCancelCTS = new DisposableMap<number, RequestCancellationTokenSource>();
	private readonly _ignoredFileProviderRegistrations = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelsService private readonly _chatProviderService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILanguageModelIgnoredFilesService private readonly _ignoredFilesService: ILanguageModelIgnoredFilesService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);

		// Bridge workbench-side language-model changes to extensions via `vscode.lm.onDidChangeChatModels`.
		// Only forward when the set of model identifiers changes. Providers (e.g. BYOK utility aliases) can
		// re-publish models with metadata-only diffs many times per second; firing on those lets listeners
		// that re-resolve models (e.g. `selectChatModels`) spin an unbounded CPU-pinning feedback loop.
		let lastModelIds = new Set(this._chatProviderService.getLanguageModelIds());
		this._store.add(this._chatProviderService.onDidChangeLanguageModels(vendor => {
			if (this._providerModelMetadata.has(vendor)) {
				const models: ILanguageModelChatMetadataAndIdentifier[] = [];
				for (const identifier of this._chatProviderService.getLanguageModelIds()) {
					const metadata = this._chatProviderService.lookupLanguageModel(identifier);
					if (metadata?.vendor === vendor) {
						models.push({ identifier, metadata });
					}
				}
				this._providerModelMetadata.set(vendor, models);
				this._updateAuthenticationProviders();
			}
			const currentModelIds = new Set(this._chatProviderService.getLanguageModelIds());
			if (equalSets(lastModelIds, currentModelIds)) {
				return;
			}
			lastModelIds = currentModelIds;
			this._proxy.$onChatModelsChange();
		}));
	}

	dispose(): void {
		this._lmProviderChange.dispose();
		this._providerRegistrations.dispose();
		this._authenticationProviderRegistrations.dispose();
		this._providerModelMetadata.clear();
		this._pendingProgress.clear();
		this._pendingCancelCTS.dispose();
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
					if (disposables.isDisposed) {
						return [];
					}
					const copilotExtensionId = this._productService.defaultChatAgent?.chatExtensionId;
					// Discovery can return one configured group at a time. Preserve other groups
					// until the service publishes the complete vendor catalogue above.
					const models = new Map((this._providerModelMetadata.get(vendor) ?? []).map(model => [model.identifier, model]));
					for (const model of modelsAndIdentifiers) {
						models.set(model.identifier, model);
					}
					this._providerModelMetadata.set(vendor, [...models.values()]);
					this._updateAuthenticationProviders();
					return modelsAndIdentifiers.map(m => {
						if (m.metadata.isBYOK !== undefined) {
							return m; // provider declared it explicitly
						}
						// Any contributed model that isn't from the built-in Copilot chat extension is BYOK.
						const isBuiltinCopilot = !!copilotExtensionId && ExtensionIdentifier.equals(m.metadata.extension, copilotExtensionId);
						return { ...m, metadata: { ...m.metadata, isBYOK: !isBuiltinCopilot } };
					});
				},
				sendChatRequest: async (modelId, messages, from, options, token) => {
					const requestId = (Math.random() * 1e6) | 0;
					const defer = new DeferredPromise<unknown>();
					// `result` mirrors the stream's terminal status and is rejected together with the
					// stream on error (see `$reportResponseDone`). Consumers that read the stream let the
					// for-await throw and never reach `await response.result`, leaving its rejection (e.g.
					// an expected `ChatQuotaExceeded`) unobserved. Attach a no-op handler so it cannot
					// surface as an unhandled rejection; real awaiters of `result` still see the error.
					defer.p.catch(() => { });
					const stream = new AsyncIterableSource<IChatResponsePart | IChatResponsePart[]>();

					try {
						this._pendingProgress.set(requestId, { defer, stream });

						const cts = new RequestCancellationTokenSource(token, () => {
							this._proxy.$cancelLanguageModelChatRequest(requestId);
						});
						this._pendingCancelCTS.set(requestId, cts);

						await Promise.all(
							messages.flatMap(msg => msg.content)
								.filter(part => part.type === 'image_url')
								.map(async part => {
									part.value.data = VSBuffer.wrap(await resizeImage(part.value.data.buffer));
								})
						);
						if (token.isCancellationRequested) {
							this._pendingProgress.delete(requestId);
							this._pendingCancelCTS.deleteAndDispose(requestId);
							const err = new CancellationError();
							stream.reject(err);
							defer.error(err);
							return {
								result: defer.p,
								stream: stream.asyncIterable
							} satisfies ILanguageModelChatResponse;
						}
						await this._proxy.$startChatRequest(modelId, requestId, from, new SerializableObjectWithBuffers(messages), options, cts.token);
					} catch (err) {
						this._pendingProgress.delete(requestId);
						this._pendingCancelCTS.deleteAndDispose(requestId);
						throw err;
					}

					return {
						result: defer.p,
						stream: stream.asyncIterable
					} satisfies ILanguageModelChatResponse;
				},
				provideTokenCount: (modelId, str, token) => {
					return this._proxy.$provideTokenLength(modelId, typeof str === 'string' ? str : new SerializableObjectWithBuffers(str), token);
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
			this._pendingCancelCTS.deleteAndDispose(requestId);
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
		this._providerModelMetadata.delete(vendor);
		this._updateAuthenticationProviders();
	}

	$cancelLanguageModelChatRequest(requestId: number): void {
		this._pendingCancelCTS.get(requestId)?.cancel();
	}

	$selectChatModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		return this._chatProviderService.selectLanguageModels(selector);
	}

	async $lookupChatModels(identifiers: string[]): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		const result: ILanguageModelChatMetadataAndIdentifier[] = [];
		for (const identifier of identifiers) {
			const metadata = this._chatProviderService.lookupLanguageModel(identifier);
			if (metadata) {
				result.push({ identifier, metadata });
			}
		}
		return result;
	}

	async $tryStartChatRequest(extension: ExtensionIdentifier, modelIdentifier: string, requestId: number, messages: SerializableObjectWithBuffers<IChatMessage[]>, options: {}, token: CancellationToken): Promise<void> {
		this._logService.trace('[CHAT] request STARTED', extension.value, requestId);
		const metadata = this._chatProviderService.lookupLanguageModel(modelIdentifier);
		if (!metadata) {
			throw LanguageModelError.NotFound(modelIdentifier);
		}
		if (metadata.auth && !ExtensionIdentifier.equals(extension, metadata.extension)) {
			const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + metadata.extension.value;
			if (this._authenticationAccessService.isAccessAllowed(providerId, getLanguageModelAccessAccountName(metadata.auth), extension.value) !== true) {
				throw LanguageModelError.NoPermissions(`Language model '${modelIdentifier}' cannot be used by '${extension.value}'.`);
			}
		}

		// Create a local CTS so cancellation can be signalled via
		// $cancelLanguageModelChatRequest even after the RPC cancel
		// handler for the original token has been removed.
		const cts = new RequestCancellationTokenSource(token);
		this._pendingCancelCTS.set(requestId, cts);

		let response: ILanguageModelChatResponse;
		try {
			response = await this._chatProviderService.sendChatRequest(modelIdentifier, extension, messages.value, options, cts.token);
		} catch (err) {
			this._logService.error('[CHAT] request FAILED', extension.value, requestId, err);
			this._pendingCancelCTS.deleteAndDispose(requestId);
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
				this._proxy.$acceptResponseDone(requestId, serializeLanguageModelError(err));
			}
		})();

		// When the response is done (signaled via its result) we tell the EH
		Promise.allSettled([response.result, streaming]).then(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
			this._pendingCancelCTS.deleteAndDispose(requestId);
			this._proxy.$acceptResponseDone(requestId, undefined);
		}, err => {
			this._logService.error('[CHAT] extension request ERRORED', toErrorMessage(err, true), extension.value, requestId);
			this._pendingCancelCTS.deleteAndDispose(requestId);
			this._proxy.$acceptResponseDone(requestId, serializeLanguageModelError(err));
		});
	}


	$countTokens(modelId: string, value: string | SerializableObjectWithBuffers<IChatMessage>, token: CancellationToken): Promise<number> {
		return this._chatProviderService.computeTokenLength(modelId, typeof value === 'string' ? value : value.value, token);
	}

	private _updateAuthenticationProviders(): void {
		const accountsByOwner = new Map<string, { extension: ExtensionIdentifier; auth: NonNullable<ILanguageModelChatMetadataAndIdentifier['metadata']['auth']>; labels: Set<string> }>();
		for (const models of this._providerModelMetadata.values()) {
			for (const { metadata } of models) {
				if (metadata.auth) {
					const key = ExtensionIdentifier.toKey(metadata.extension);
					let entry = accountsByOwner.get(key);
					if (!entry) {
						entry = { extension: metadata.extension, auth: metadata.auth, labels: new Set() };
						accountsByOwner.set(key, entry);
					}
					entry.labels.add(getLanguageModelAccessAccountName(metadata.auth));
				}
			}
		}
		for (const key of this._authenticationProviderRegistrations.keys()) {
			if (!accountsByOwner.has(key)) {
				this._authenticationProviderRegistrations.deleteAndDispose(key);
			}
		}
		for (const [key, { extension, auth, labels }] of accountsByOwner) {
			const registration = this._registerAuthenticationProvider(extension, auth, labels);
			if (registration !== Disposable.None) {
				this._authenticationProviderRegistrations.set(key, registration);
			}
		}
	}

	private _registerAuthenticationProvider(extension: ExtensionIdentifier, auth: { providerLabel: string; accountLabel?: string | undefined }, accountLabels: ReadonlySet<string>): IDisposable {
		// This needs to be done in both MainThread & ExtHost ChatProvider
		const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;

		// Only register one auth provider per extension
		if (this._authenticationService.getProviderIds().includes(authProviderId)) {
			const provider = this._authenticationService.getProvider(authProviderId);
			if (provider instanceof LanguageModelAccessAuthProvider) {
				provider.updateAccountLabels(accountLabels);
			}
			return Disposable.None;
		}

		const disposables = new DisposableStore();
		const provider = new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabels);
		this._authenticationService.registerAuthenticationProvider(authProviderId, provider);
		disposables.add(toDisposable(() => {
			this._authenticationService.unregisterAuthenticationProvider(authProviderId);
			provider.dispose();
		}));
		disposables.add(this._authenticationAccessService.onDidChangeExtensionSessionAccess(async (e) => {
			if (e.providerId !== authProviderId || !provider.accountLabels.has(e.accountName)) {
				return;
			}
			const allowedExtensions = this._authenticationAccessService.readAllowedExtensions(authProviderId, e.accountName);
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
	supportsMultipleAccounts = true;

	// Important for updating the UI
	private _onDidChangeSessions: Emitter<AuthenticationSessionsChangeEvent> = new Emitter<AuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private readonly _sessions = new Map<string, AuthenticationSession>();
	private _accountLabels: ReadonlySet<string>;

	constructor(readonly id: string, readonly label: string, accountLabels: ReadonlySet<string>) {
		this._accountLabels = new Set(accountLabels);
	}

	get accountLabels(): ReadonlySet<string> {
		return this._accountLabels;
	}

	updateAccountLabels(accountLabels: ReadonlySet<string>): void {
		this._accountLabels = new Set(accountLabels);
		const removed: AuthenticationSession[] = [];
		for (const [label, session] of this._sessions) {
			if (!accountLabels.has(label)) {
				this._sessions.delete(label);
				removed.push(session);
			}
		}
		if (removed.length) {
			this._onDidChangeSessions.fire({ added: [], changed: [], removed });
		}
	}

	async getSessions(scopes: string[] | undefined, options: IAuthenticationProviderSessionOptions = {}): Promise<readonly AuthenticationSession[]> {
		// If there are no scopes and no session that means no extension has requested a session yet
		// and the user is simply opening the Account menu. In that case, we should not return any "sessions".
		const labels = options.account ? [options.account.label].filter(label => this._accountLabels.has(label)) : [...this._accountLabels];
		const sessions: AuthenticationSession[] = [];
		for (const label of labels) {
			const session = this._sessions.get(label);
			if (session) {
				sessions.push(session);
			} else if (scopes !== undefined) {
				sessions.push(await this.createSession(scopes, { account: { id: label, label } }));
			}
		}
		return sessions;
	}
	async createSession(scopes: string[], options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession> {
		const label = options.account?.label ?? this._accountLabels.values().next().value;
		if (label === undefined || !this._accountLabels.has(label)) {
			throw LanguageModelError.NotFound('The requested language model account is unavailable.');
		}
		const session = this._createFakeSession(scopes, label);
		this._sessions.set(label, session);
		this._onDidChangeSessions.fire({ added: [session], changed: [], removed: [] });
		return session;
	}
	removeSession(sessionId: string): Promise<void> {
		for (const [label, session] of this._sessions) {
			if (session.id === sessionId) {
				this._sessions.delete(label);
				this._onDidChangeSessions.fire({ added: [], changed: [], removed: [session] });
			}
		}
		return Promise.resolve();
	}

	confirmation(extensionName: string, _recreatingSession: boolean): string {
		return localize('confirmLanguageModelAccess', "The extension '{0}' wants to access the language models provided by {1}.", extensionName, this.label);
	}

	private _createFakeSession(scopes: string[], accountLabel: string): AuthenticationSession {
		return {
			id: `fake-session:${accountLabel}`,
			account: {
				id: accountLabel,
				label: accountLabel,
			},
			accessToken: 'fake-access-token',
			scopes,
		};
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}
