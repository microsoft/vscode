/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { AsyncIterableSource, DeferredPromise } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { resizeImage } from '../../contrib/chat/browser/chatImageUtils.js';
import { ILanguageModelIgnoredFilesService } from '../../contrib/chat/common/ignoredFiles.js';
import { ILanguageModelsService } from '../../contrib/chat/common/languageModels.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { LanguageModelError } from '../common/extHostTypes.js';
let MainThreadLanguageModels = class MainThreadLanguageModels {
    constructor(extHostContext, _chatProviderService, _logService, _authenticationService, _authenticationAccessService, _extensionService, _ignoredFilesService) {
        this._chatProviderService = _chatProviderService;
        this._logService = _logService;
        this._authenticationService = _authenticationService;
        this._authenticationAccessService = _authenticationAccessService;
        this._extensionService = _extensionService;
        this._ignoredFilesService = _ignoredFilesService;
        this._store = new DisposableStore();
        this._providerRegistrations = new DisposableMap();
        this._lmProviderChange = new Emitter();
        this._pendingProgress = new Map();
        this._ignoredFileProviderRegistrations = new DisposableMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
    }
    dispose() {
        this._lmProviderChange.dispose();
        this._providerRegistrations.dispose();
        this._ignoredFileProviderRegistrations.dispose();
        this._store.dispose();
    }
    $registerLanguageModelProvider(vendor) {
        const disposables = new DisposableStore();
        try {
            disposables.add(this._chatProviderService.registerLanguageModelProvider(vendor, {
                onDidChange: Event.filter(this._lmProviderChange.event, e => e.vendor === vendor, disposables),
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
                    const defer = new DeferredPromise();
                    const stream = new AsyncIterableSource();
                    try {
                        this._pendingProgress.set(requestId, { defer, stream });
                        await Promise.all(messages.flatMap(msg => msg.content)
                            .filter(part => part.type === 'image_url')
                            .map(async (part) => {
                            part.value.data = VSBuffer.wrap(await resizeImage(part.value.data.buffer));
                        }));
                        await this._proxy.$startChatRequest(modelId, requestId, from, new SerializableObjectWithBuffers(messages), options, token);
                    }
                    catch (err) {
                        this._pendingProgress.delete(requestId);
                        throw err;
                    }
                    return {
                        result: defer.p,
                        stream: stream.asyncIterable
                    };
                },
                provideTokenCount: (modelId, str, token) => {
                    return this._proxy.$provideTokenLength(modelId, str, token);
                },
            }));
            this._providerRegistrations.set(vendor, disposables);
        }
        catch (err) {
            disposables.dispose();
            throw err;
        }
    }
    $onLMProviderChange(vendor) {
        this._lmProviderChange.fire({ vendor });
    }
    async $reportResponsePart(requestId, chunk) {
        const data = this._pendingProgress.get(requestId);
        this._logService.trace('[LM] report response PART', Boolean(data), requestId, chunk);
        if (data) {
            data.stream.emitOne(chunk.value);
        }
    }
    async $reportResponseDone(requestId, err) {
        const data = this._pendingProgress.get(requestId);
        this._logService.trace('[LM] report response DONE', Boolean(data), requestId, err);
        if (data) {
            this._pendingProgress.delete(requestId);
            if (err) {
                const error = LanguageModelError.tryDeserialize(err) ?? transformErrorFromSerialization(err);
                data.stream.reject(error);
                data.defer.error(error);
            }
            else {
                data.stream.resolve();
                data.defer.complete(undefined);
            }
        }
    }
    $unregisterProvider(vendor) {
        this._providerRegistrations.deleteAndDispose(vendor);
    }
    $selectChatModels(selector) {
        return this._chatProviderService.selectLanguageModels(selector);
    }
    async $tryStartChatRequest(extension, modelIdentifier, requestId, messages, options, token) {
        this._logService.trace('[CHAT] request STARTED', extension.value, requestId);
        let response;
        try {
            response = await this._chatProviderService.sendChatRequest(modelIdentifier, extension, messages.value, options, token);
        }
        catch (err) {
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
            }
            catch (err) {
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
    $countTokens(modelId, value, token) {
        return this._chatProviderService.computeTokenLength(modelId, value, token);
    }
    _registerAuthenticationProvider(extension, auth) {
        // This needs to be done in both MainThread & ExtHost ChatProvider
        const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;
        // Only register one auth provider per extension
        if (this._authenticationService.getProviderIds().includes(authProviderId)) {
            return Disposable.None;
        }
        const accountLabel = auth.accountLabel ?? localize('languageModelsAccountId', 'Language Models');
        const disposables = new DisposableStore();
        const provider = new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabel);
        this._authenticationService.registerAuthenticationProvider(authProviderId, provider);
        disposables.add(toDisposable(() => {
            this._authenticationService.unregisterAuthenticationProvider(authProviderId);
            provider.dispose();
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
    $fileIsIgnored(uri, token) {
        return this._ignoredFilesService.fileIsIgnored(URI.revive(uri), token);
    }
    $registerFileIgnoreProvider(handle) {
        this._ignoredFileProviderRegistrations.set(handle, this._ignoredFilesService.registerIgnoredFileProvider({
            isFileIgnored: async (uri, token) => this._proxy.$isFileIgnored(handle, uri, token)
        }));
    }
    $unregisterFileIgnoreProvider(handle) {
        this._ignoredFileProviderRegistrations.deleteAndDispose(handle);
    }
};
MainThreadLanguageModels = __decorate([
    extHostNamedCustomer(MainContext.MainThreadLanguageModels),
    __param(1, ILanguageModelsService),
    __param(2, ILogService),
    __param(3, IAuthenticationService),
    __param(4, IAuthenticationAccessService),
    __param(5, IExtensionService),
    __param(6, ILanguageModelIgnoredFilesService)
], MainThreadLanguageModels);
export { MainThreadLanguageModels };
// The fake AuthenticationProvider that will be used to gate access to the Language Model. There will be one per provider.
class LanguageModelAccessAuthProvider {
    constructor(id, label, _accountLabel) {
        this.id = id;
        this.label = label;
        this._accountLabel = _accountLabel;
        this.supportsMultipleAccounts = false;
        // Important for updating the UI
        this._onDidChangeSessions = new Emitter();
        this.onDidChangeSessions = this._onDidChangeSessions.event;
    }
    async getSessions(scopes) {
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
    async createSession(scopes) {
        this._session = this._createFakeSession(scopes);
        this._onDidChangeSessions.fire({ added: [this._session], changed: [], removed: [] });
        return this._session;
    }
    removeSession(sessionId) {
        if (this._session) {
            this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session] });
            this._session = undefined;
        }
        return Promise.resolve();
    }
    confirmation(extensionName, _recreatingSession) {
        return localize('confirmLanguageModelAccess', "The extension '{0}' wants to access the language models provided by {1}.", extensionName, this.label);
    }
    _createFakeSession(scopes) {
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
    dispose() {
        this._onDidChangeSessions.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZExhbmd1YWdlTW9kZWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRMYW5ndWFnZU1vZGVscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQW1CLDhCQUE4QixFQUFFLCtCQUErQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbEksT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUgsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFM0MsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RixPQUFPLEVBQTJGLHNCQUFzQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUssT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDcEgsT0FBTyxFQUFxRixzQkFBc0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdE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