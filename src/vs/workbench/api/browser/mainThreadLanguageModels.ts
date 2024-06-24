/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource, DeferredPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { SerializedError, transformErrorForSerialization, transformErrorFromSerialization } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLanguageModelsShape, ExtHostContext, MainContext, MainThreadLanguageModelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ILanguageModelStatsService } from 'vs/workbench/contrib/chat/common/languageModelStats';
import { ILanguageModelChatMetadata, IChatResponseFragment, ILanguageModelsService, IChatMessage, ILanguageModelChatSelector, ILanguageModelChatResponse } from 'vs/workbench/contrib/chat/common/languageModels';
import { IAuthenticationAccessService } from 'vs/workbench/services/authentication/browser/authenticationAccessService';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadLanguageModels)
export class MainThreadLanguageModels implements MainThreadLanguageModelsShape {

	private readonly _proxy: ExtHostLanguageModelsShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<number, { defer: DeferredPromise<any>; stream: AsyncIterableSource<IChatResponseFragment> }>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelsService private readonly _chatProviderService: ILanguageModelsService,
		@ILanguageModelStatsService private readonly _languageModelStatsService: ILanguageModelStatsService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
		this._proxy.$acceptChatModelMetadata({ added: _chatProviderService.getLanguageModelIds().map(id => ({ identifier: id, metadata: _chatProviderService.lookupLanguageModel(id)! })) });
		this._store.add(_chatProviderService.onDidChangeLanguageModels(this._proxy.$acceptChatModelMetadata, this._proxy));
	}

	dispose(): void {
		this._providerRegistrations.dispose();
		this._store.dispose();
	}

	$registerLanguageModelProvider(handle: number, identifier: string, metadata: ILanguageModelChatMetadata): void {
		const dipsosables = new DisposableStore();
		dipsosables.add(this._chatProviderService.registerLanguageModelChat(identifier, {
			metadata,
			sendChatRequest: async (messages, from, options, token) => {
				const requestId = (Math.random() * 1e6) | 0;
				const defer = new DeferredPromise<any>();
				const stream = new AsyncIterableSource<IChatResponseFragment>();

				try {
					this._pendingProgress.set(requestId, { defer, stream });
					await this._proxy.$startChatRequest(handle, requestId, from, messages, options, token);
				} catch (err) {
					this._pendingProgress.delete(requestId);
					throw err;
				}

				return {
					result: defer.p,
					stream: stream.asyncIterable
				} satisfies ILanguageModelChatResponse;
			},
			provideTokenCount: (str, token) => {
				return this._proxy.$provideTokenLength(handle, str, token);
			},
		}));
		if (metadata.auth) {
			dipsosables.add(this._registerAuthenticationProvider(metadata.extension, metadata.auth));
		}
		this._providerRegistrations.set(handle, dipsosables);
	}

	async $reportResponsePart(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		const data = this._pendingProgress.get(requestId);
		this._logService.trace('[LM] report response PART', Boolean(data), requestId, chunk);
		if (data) {
			data.stream.emitOne(chunk);
		}
	}

	async $reportResponseDone(requestId: number, err: SerializedError | undefined): Promise<void> {
		const data = this._pendingProgress.get(requestId);
		this._logService.trace('[LM] report response DONE', Boolean(data), requestId, err);
		if (data) {
			this._pendingProgress.delete(requestId);
			if (err) {
				const error = transformErrorFromSerialization(err);
				data.stream.reject(error);
				data.defer.error(error);
			} else {
				data.stream.resolve();
				data.defer.complete(undefined);
			}
		}
	}

	$unregisterProvider(handle: number): void {
		this._providerRegistrations.deleteAndDispose(handle);
	}

	$selectChatModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		return this._chatProviderService.selectLanguageModels(selector);
	}

	$whenLanguageModelChatRequestMade(identifier: string, extensionId: ExtensionIdentifier, participant?: string | undefined, tokenCount?: number | undefined): void {
		this._languageModelStatsService.update(identifier, extensionId, participant, tokenCount);
	}

	async $tryStartChatRequest(extension: ExtensionIdentifier, providerId: string, requestId: number, messages: IChatMessage[], options: {}, token: CancellationToken): Promise<any> {
		this._logService.trace('[CHAT] request STARTED', extension.value, requestId);

		const response = await this._chatProviderService.sendChatRequest(providerId, extension, messages, options, token);

		// !!! IMPORTANT !!!
		// This method must return before the response is done (has streamed all parts)
		// and because of that we consume the stream without awaiting
		// !!! IMPORTANT !!!
		const streaming = (async () => {
			try {
				for await (const part of response.stream) {
					this._logService.trace('[CHAT] request PART', extension.value, requestId, part);
					await this._proxy.$acceptResponsePart(requestId, part);
				}
				this._logService.trace('[CHAT] request DONE', extension.value, requestId);
			} catch (err) {
				this._logService.error('[CHAT] extension request ERRORED in STREAM', err, extension.value, requestId);
				this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
			}
		})();

		// When the response is done (signaled via its result) we tell the EH
		Promise.allSettled([response.result, streaming]).then(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
			this._proxy.$acceptResponseDone(requestId, undefined);
		}, err => {
			this._logService.error('[CHAT] extension request ERRORED', err, extension.value, requestId);
			this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
		});
	}


	$countTokens(provider: string, value: string | IChatMessage, token: CancellationToken): Promise<number> {
		return this._chatProviderService.computeTokenLength(provider, value, token);
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
}

// The fake AuthenticationProvider that will be used to gate access to the Language Model. There will be one per provider.
class LanguageModelAccessAuthProvider implements IAuthenticationProvider {
	supportsMultipleAccounts = false;

	// Important for updating the UI
	private _onDidChangeSessions: Emitter<AuthenticationSessionsChangeEvent> = new Emitter<AuthenticationSessionsChangeEvent>();
	onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

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
			this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session!] });
			this._session = undefined;
		}
		return Promise.resolve();
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
