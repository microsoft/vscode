/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { ExtHostLanguageModelsShape, ExtHostContext, MainContext, MainThreadLanguageModelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ILanguageModelStatsService } from 'vs/workbench/contrib/chat/common/languageModelStats';
import { ILanguageModelChatMetadata, IChatResponseFragment, ILanguageModelsService, IChatMessage, ILanguageModelChatSelector } from 'vs/workbench/contrib/chat/common/languageModels';
import { IAuthenticationAccessService } from 'vs/workbench/services/authentication/browser/authenticationAccessService';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationProviderCreateSessionOptions, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadLanguageModels)
export class MainThreadLanguageModels implements MainThreadLanguageModelsShape {

	private readonly _proxy: ExtHostLanguageModelsShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<number, IProgress<IChatResponseFragment>>();

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
			provideChatResponse: async (messages, from, options, progress, token) => {
				const requestId = (Math.random() * 1e6) | 0;
				this._pendingProgress.set(requestId, progress);
				try {
					await this._proxy.$provideLanguageModelResponse(handle, requestId, from, messages, options, token);
				} finally {
					this._pendingProgress.delete(requestId);
				}
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

	async $handleProgressChunk(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(chunk);
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

	async $fetchResponse(extension: ExtensionIdentifier, providerId: string, requestId: number, messages: IChatMessage[], options: {}, token: CancellationToken): Promise<any> {
		this._logService.debug('[CHAT] extension request STARTED', extension.value, requestId);

		const task = this._chatProviderService.makeLanguageModelChatRequest(providerId, extension, messages, options, new Progress(value => {
			this._proxy.$handleResponseFragment(requestId, value);
		}), token);

		task.catch(err => {
			this._logService.error('[CHAT] extension request ERRORED', err, extension.value, requestId);
			throw err;
		}).finally(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
		});

		return task;
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
		return [await this.createSession(scopes || [], {})];
	}
	async createSession(scopes: string[], options: IAuthenticationProviderCreateSessionOptions): Promise<AuthenticationSession> {
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
