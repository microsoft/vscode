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
var ExtHostLanguageModels_1;
import { AsyncIterableProducer, AsyncIterableSource, RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Progress } from '../../../platform/progress/common/progress.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../contrib/chat/common/widget/input/modelPickerWidget.js';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostAuthentication } from './extHostAuthentication.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
export const IExtHostLanguageModels = createDecorator('IExtHostLanguageModels');
class LanguageModelResponse {
    constructor() {
        this._defaultStream = new AsyncIterableSource();
        this._isDone = false;
        const that = this;
        const [stream1, stream2] = AsyncIterableProducer.tee(that._defaultStream.asyncIterable);
        this.apiObject = {
            // result: promise,
            get stream() {
                return stream1;
            },
            get text() {
                return stream2.map(part => {
                    if (part instanceof extHostTypes.LanguageModelTextPart) {
                        return part.value;
                    }
                    else {
                        return undefined;
                    }
                }).coalesce();
            },
        };
    }
    handleResponsePart(parts) {
        if (this._isDone) {
            return;
        }
        const lmResponseParts = [];
        for (const part of Iterable.wrap(parts)) {
            let out;
            if (part.type === 'text') {
                out = new extHostTypes.LanguageModelTextPart(part.value, part.audience);
            }
            else if (part.type === 'thinking') {
                out = new extHostTypes.LanguageModelThinkingPart(part.value, part.id, part.metadata);
            }
            else if (part.type === 'data') {
                out = new extHostTypes.LanguageModelDataPart(part.data.buffer, part.mimeType, part.audience);
            }
            else {
                out = new extHostTypes.LanguageModelToolCallPart(part.toolCallId, part.name, part.parameters);
            }
            lmResponseParts.push(out);
        }
        this._defaultStream.emitMany(lmResponseParts);
    }
    reject(err) {
        this._isDone = true;
        this._defaultStream.reject(err);
    }
    resolve() {
        this._isDone = true;
        this._defaultStream.resolve();
    }
}
let ExtHostLanguageModels = class ExtHostLanguageModels {
    static { ExtHostLanguageModels_1 = this; }
    static { this._idPool = 1; }
    constructor(extHostRpc, _logService, _extHostAuthentication) {
        this._logService = _logService;
        this._extHostAuthentication = _extHostAuthentication;
        this._onDidChangeModelAccess = new Emitter();
        this._onDidChangeProviders = new Emitter();
        this.onDidChangeProviders = this._onDidChangeProviders.event;
        this._onDidChangeModelProxyAvailability = new Emitter();
        this.onDidChangeModelProxyAvailability = this._onDidChangeModelProxyAvailability.event;
        this._languageModelProviders = new Map();
        // TODO @lramos15 - Remove the need for both info and metadata as it's a lot of redundancy. Should just need one
        this._localModels = new Map();
        this._modelAccessList = new ExtensionIdentifierMap();
        this._pendingRequest = new Map();
        this._ignoredFileProviders = new Map();
        this._languageAccessInformationExtensions = new Set();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadLanguageModels);
    }
    dispose() {
        this._onDidChangeModelAccess.dispose();
        this._onDidChangeProviders.dispose();
        this._onDidChangeModelProxyAvailability.dispose();
    }
    registerLanguageModelChatProvider(extension, vendor, provider) {
        this._languageModelProviders.set(vendor, { extension: extension, provider });
        this._proxy.$registerLanguageModelProvider(vendor);
        let providerChangeEventDisposable;
        if (provider.onDidChangeLanguageModelChatInformation) {
            providerChangeEventDisposable = provider.onDidChangeLanguageModelChatInformation(() => {
                this._proxy.$onLMProviderChange(vendor);
            });
        }
        return toDisposable(() => {
            this._languageModelProviders.delete(vendor);
            this._localModels.forEach((value, key) => {
                if (value.metadata.vendor === vendor) {
                    this._localModels.delete(key);
                }
            });
            providerChangeEventDisposable?.dispose();
            this._proxy.$unregisterProvider(vendor);
        });
    }
    toModelIdentifier(vendor, group, modelId) {
        return group ? `${vendor}/${group}/${modelId}` : `${vendor}/${modelId}`;
    }
    getVendorFromModelIdentifier(modelIdentifier) {
        const firstSlash = modelIdentifier.indexOf('/');
        return firstSlash === -1 ? undefined : modelIdentifier.substring(0, firstSlash);
    }
    async $provideLanguageModelChatInfo(vendor, options, token) {
        const data = this._languageModelProviders.get(vendor);
        if (!data) {
            return [];
        }
        const modelInformation = await data.provider.provideLanguageModelChatInformation({ silent: options.silent, configuration: options.configuration }, token) ?? [];
        const modelMetadataAndIdentifier = modelInformation.map((m) => {
            let auth;
            if (m.requiresAuthorization && isProposedApiEnabled(data.extension, 'chatProvider')) {
                auth = {
                    providerLabel: data.extension.displayName || data.extension.name,
                    accountLabel: typeof m.requiresAuthorization === 'object' ? m.requiresAuthorization.label : undefined
                };
            }
            if (m.capabilities.editTools) {
                checkProposedApiEnabled(data.extension, 'chatProvider');
            }
            const isDefaultForLocation = {};
            if (isProposedApiEnabled(data.extension, 'chatProvider')) {
                if (m.isDefault === true) {
                    for (const key of Object.values(ChatAgentLocation)) {
                        if (typeof key === 'string') {
                            isDefaultForLocation[key] = true;
                        }
                    }
                }
                else if (typeof m.isDefault === 'object') {
                    for (const key of Object.keys(m.isDefault)) {
                        const enumKey = parseInt(key);
                        isDefaultForLocation[typeConvert.ChatLocation.from(enumKey)] = m.isDefault[enumKey];
                    }
                }
            }
            return {
                metadata: {
                    extension: data.extension.identifier,
                    id: m.id,
                    vendor,
                    name: m.name ?? '',
                    family: m.family ?? '',
                    detail: m.detail,
                    tooltip: m.tooltip,
                    version: m.version,
                    multiplier: m.multiplier,
                    multiplierNumeric: m.multiplierNumeric,
                    maxInputTokens: m.maxInputTokens,
                    maxOutputTokens: m.maxOutputTokens,
                    auth,
                    isDefaultForLocation,
                    isUserSelectable: m.isUserSelectable,
                    statusIcon: m.statusIcon,
                    targetChatSessionType: m.targetChatSessionType,
                    configurationSchema: m.configurationSchema,
                    modelPickerCategory: m.category ?? DEFAULT_MODEL_PICKER_CATEGORY,
                    capabilities: m.capabilities ? {
                        vision: m.capabilities.imageInput,
                        editTools: m.capabilities.editTools,
                        toolCalling: !!m.capabilities.toolCalling,
                        agentMode: !!m.capabilities.toolCalling
                    } : undefined,
                },
                identifier: this.toModelIdentifier(vendor, options.group, m.id)
            };
        });
        this._localModels.forEach((value, key) => {
            if (value.metadata.vendor === vendor && value.group === options.group) {
                this._localModels.delete(key);
            }
        });
        for (let i = 0; i < modelMetadataAndIdentifier.length; i++) {
            this._localModels.set(modelMetadataAndIdentifier[i].identifier, {
                group: options.group,
                metadata: modelMetadataAndIdentifier[i].metadata,
                info: modelInformation[i]
            });
        }
        return modelMetadataAndIdentifier;
    }
    async $startChatRequest(modelId, requestId, from, messages, options, token) {
        const knownModel = this._localModels.get(modelId);
        if (!knownModel) {
            throw new Error('Model not found');
        }
        const data = this._languageModelProviders.get(knownModel.metadata.vendor);
        if (!data) {
            throw new Error(`Language model provider for '${knownModel.metadata.id}' not found.`);
        }
        const queue = [];
        const sendNow = () => {
            if (queue.length > 0) {
                this._proxy.$reportResponsePart(requestId, new SerializableObjectWithBuffers(queue));
                queue.length = 0;
            }
        };
        const queueScheduler = new RunOnceScheduler(sendNow, 30);
        const sendSoon = (part) => {
            const newLen = queue.push(part);
            // flush/send if things pile up more than expected
            if (newLen > 30) {
                sendNow();
                queueScheduler.cancel();
            }
            else {
                queueScheduler.schedule();
            }
        };
        const progress = new Progress(async (fragment) => {
            if (token.isCancellationRequested) {
                this._logService.warn(`[CHAT](${data.extension.identifier.value}) CANNOT send progress because the REQUEST IS CANCELLED`);
                return;
            }
            let part;
            if (fragment instanceof extHostTypes.LanguageModelToolCallPart) {
                part = { type: 'tool_use', name: fragment.name, parameters: fragment.input, toolCallId: fragment.callId };
            }
            else if (fragment instanceof extHostTypes.LanguageModelTextPart) {
                part = { type: 'text', value: fragment.value, audience: fragment.audience };
            }
            else if (fragment instanceof extHostTypes.LanguageModelDataPart) {
                part = { type: 'data', mimeType: fragment.mimeType, data: VSBuffer.wrap(fragment.data), audience: fragment.audience };
            }
            else if (fragment instanceof extHostTypes.LanguageModelThinkingPart) {
                part = { type: 'thinking', value: fragment.value, id: fragment.id, metadata: fragment.metadata };
            }
            if (!part) {
                this._logService.warn(`[CHAT](${data.extension.identifier.value}) UNKNOWN part ${JSON.stringify(fragment)}`);
                return;
            }
            sendSoon(part);
        });
        let value;
        try {
            value = data.provider.provideLanguageModelChatResponse(knownModel.info, messages.value.map(typeConvert.LanguageModelChatMessage2.to), 
            // todo@connor4312: move `core` -> `undefined` after 1.111 Insiders is out
            { ...options, modelOptions: options.modelOptions ?? {}, modelConfiguration: options.configuration, requestInitiator: from ? ExtensionIdentifier.toKey(from) : 'core', toolMode: options.toolMode ?? extHostTypes.LanguageModelChatToolMode.Auto }, progress, token);
        }
        catch (err) {
            // synchronously failed
            throw err;
        }
        Promise.resolve(value).then(() => {
            sendNow();
            this._proxy.$reportResponseDone(requestId, undefined);
        }, err => {
            sendNow();
            this._proxy.$reportResponseDone(requestId, transformErrorForSerialization(err));
        });
    }
    //#region --- token counting
    $provideTokenLength(modelId, value, token) {
        const knownModel = this._localModels.get(modelId);
        if (!knownModel) {
            return Promise.resolve(0);
        }
        const data = this._languageModelProviders.get(knownModel.metadata.vendor);
        if (!data) {
            return Promise.resolve(0);
        }
        return Promise.resolve(data.provider.provideTokenCount(knownModel.info, value, token));
    }
    //#region --- making request
    async getDefaultLanguageModel(extension, forceResolveModels) {
        let defaultModelId;
        if (forceResolveModels) {
            await this.selectLanguageModels(extension, {});
        }
        for (const [modelIdentifier, modelData] of this._localModels) {
            if (modelData.metadata.isDefaultForLocation[ChatAgentLocation.Chat] && modelData.metadata.vendor === 'copilot') {
                defaultModelId = modelIdentifier;
                break;
            }
        }
        if (!defaultModelId && !forceResolveModels) {
            // Maybe the default wasn't cached so we will try again with resolving the models too
            return this.getDefaultLanguageModel(extension, true);
        }
        return this.getLanguageModelByIdentifier(extension, defaultModelId);
    }
    async getLanguageModelByIdentifier(extension, modelId) {
        if (!modelId) {
            return undefined;
        }
        let model = this._localModels.get(modelId);
        if (!model) {
            // model gone? is this an error on us? Try to resolve model again
            this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache. Trying to resolve model again.`);
            const vendor = this.getVendorFromModelIdentifier(modelId);
            if (!vendor) {
                this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not extract vendor from model identifier '${modelId}'.`);
                return undefined;
            }
            await this.selectLanguageModels(extension, { vendor });
            model = this._localModels.get(modelId);
            if (!model) {
                this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache after re-resolving models.`);
                return undefined;
            }
        }
        // make sure auth information is correct
        if (this._isUsingAuth(extension.identifier, model.metadata)) {
            await this._fakeAuthPopulate(model.metadata);
        }
        let apiObject;
        if (!apiObject) {
            const that = this;
            apiObject = {
                id: model.info.id,
                vendor: model.metadata.vendor,
                family: model.info.family,
                version: model.info.version,
                name: model.info.name,
                capabilities: {
                    supportsImageToText: model.metadata.capabilities?.vision ?? false,
                    supportsToolCalling: !!model.metadata.capabilities?.toolCalling,
                    editToolsHint: model.metadata.capabilities?.editTools,
                },
                maxInputTokens: model.metadata.maxInputTokens,
                countTokens(text, token) {
                    if (!that._localModels.has(modelId)) {
                        throw extHostTypes.LanguageModelError.NotFound(modelId);
                    }
                    return that._computeTokenLength(modelId, text, token ?? CancellationToken.None);
                },
                sendRequest(messages, options, token) {
                    if (!that._localModels.has(modelId)) {
                        throw extHostTypes.LanguageModelError.NotFound(modelId);
                    }
                    return that._sendChatRequest(extension, modelId, messages, options ?? {}, token ?? CancellationToken.None);
                }
            };
            Object.freeze(apiObject);
        }
        return apiObject;
    }
    async selectLanguageModels(extension, selector) {
        // this triggers extension activation
        const models = await this._proxy.$selectChatModels({ ...selector, extension: extension.identifier });
        const result = [];
        const modelPromises = models.map(identifier => this.getLanguageModelByIdentifier(extension, identifier));
        const modelResults = await Promise.all(modelPromises);
        for (const model of modelResults) {
            if (model) {
                result.push(model);
            }
        }
        return result;
    }
    async _sendChatRequest(extension, languageModelId, messages, options, token) {
        const internalMessages = this._convertMessages(extension, messages);
        const from = extension.identifier;
        const metadata = this._localModels.get(languageModelId)?.metadata;
        if (!metadata || !this._localModels.has(languageModelId)) {
            throw extHostTypes.LanguageModelError.NotFound(`Language model '${languageModelId}' is unknown.`);
        }
        if (this._isUsingAuth(from, metadata)) {
            const success = await this._getAuthAccess(extension, { identifier: metadata.extension, displayName: metadata.auth.providerLabel }, options.justification, false);
            if (!success || !this._modelAccessList.get(from)?.has(metadata.extension)) {
                throw extHostTypes.LanguageModelError.NoPermissions(`Language model '${languageModelId}' cannot be used by '${from.value}'.`);
            }
        }
        const requestId = (Math.random() * 1e6) | 0;
        const res = new LanguageModelResponse();
        this._pendingRequest.set(requestId, { languageModelId, res });
        try {
            await this._proxy.$tryStartChatRequest(from, languageModelId, requestId, new SerializableObjectWithBuffers(internalMessages), options, token);
        }
        catch (error) {
            // error'ing here means that the request could NOT be started/made, e.g. wrong model, no access, etc, but
            // later the response can fail as well. Those failures are communicated via the stream-object
            this._pendingRequest.delete(requestId);
            throw extHostTypes.LanguageModelError.tryDeserialize(error) ?? error;
        }
        return res.apiObject;
    }
    _convertMessages(extension, messages) {
        const internalMessages = [];
        for (const message of messages) {
            if (message.role === extHostTypes.LanguageModelChatMessageRole.System) {
                checkProposedApiEnabled(extension, 'languageModelSystem');
            }
            internalMessages.push(typeConvert.LanguageModelChatMessage2.from(message));
        }
        return internalMessages;
    }
    async $acceptResponsePart(requestId, chunk) {
        const data = this._pendingRequest.get(requestId);
        if (data) {
            data.res.handleResponsePart(chunk.value);
        }
    }
    async $acceptResponseDone(requestId, error) {
        const data = this._pendingRequest.get(requestId);
        if (!data) {
            return;
        }
        this._pendingRequest.delete(requestId);
        if (error) {
            // we error the stream because that's the only way to signal
            // that the request has failed
            data.res.reject(extHostTypes.LanguageModelError.tryDeserialize(error) ?? transformErrorFromSerialization(error));
        }
        else {
            data.res.resolve();
        }
    }
    // BIG HACK: Using AuthenticationProviders to check access to Language Models
    async _getAuthAccess(from, to, justification, silent) {
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
        }
        catch (err) {
            // ignore
            return false;
        }
    }
    _isUsingAuth(from, toMetadata) {
        // If the 'to' extension uses an auth check
        return !!toMetadata.auth
            // And we're asking from a different extension
            && !ExtensionIdentifier.equals(toMetadata.extension, from);
    }
    async _fakeAuthPopulate(metadata) {
        if (!metadata.auth) {
            return;
        }
        for (const from of this._languageAccessInformationExtensions) {
            try {
                await this._getAuthAccess(from, { identifier: metadata.extension, displayName: '' }, undefined, true);
            }
            catch (err) {
                this._logService.error('Fake Auth request failed');
                this._logService.error(err);
            }
        }
    }
    async _computeTokenLength(modelId, value, token) {
        const data = this._localModels.get(modelId);
        if (!data) {
            throw extHostTypes.LanguageModelError.NotFound(`Language model '${modelId}' is unknown.`);
        }
        return this._languageModelProviders.get(data.metadata.vendor)?.provider.provideTokenCount(data.info, value, token) ?? 0;
        // return this._proxy.$countTokens(languageModelId, (typeof value === 'string' ? value : typeConvert.LanguageModelChatMessage2.from(value)), token);
    }
    $updateModelAccesslist(data) {
        const updated = new Array();
        for (const { from, to, enabled } of data) {
            const set = this._modelAccessList.get(from) ?? new ExtensionIdentifierSet();
            const oldValue = set.has(to);
            if (oldValue !== enabled) {
                if (enabled) {
                    set.add(to);
                }
                else {
                    set.delete(to);
                }
                this._modelAccessList.set(from, set);
                const newItem = { from, to };
                updated.push(newItem);
                this._onDidChangeModelAccess.fire(newItem);
            }
        }
    }
    createLanguageModelAccessInformation(from) {
        this._languageAccessInformationExtensions.add(from);
        // const that = this;
        const _onDidChangeAccess = Event.signal(Event.filter(this._onDidChangeModelAccess.event, e => ExtensionIdentifier.equals(e.from, from.identifier)));
        const _onDidAddRemove = Event.signal(this._onDidChangeProviders.event);
        return {
            get onDidChange() {
                return Event.any(_onDidChangeAccess, _onDidAddRemove);
            },
            canSendRequest(chat) {
                return true;
                // TODO @lramos15 - Fix
                // let metadata: ILanguageModelChatMetadata | undefined;
                // out: for (const [_, value] of that._allLanguageModelData) {
                // 	for (const candidate of value.apiObjects.values()) {
                // 		if (candidate === chat) {
                // 			metadata = value.metadata;
                // 			break out;
                // 		}
                // 	}
                // }
                // if (!metadata) {
                // 	return undefined;
                // }
                // if (!that._isUsingAuth(from.identifier, metadata)) {
                // 	return true;
                // }
                // const list = that._modelAccessList.get(from.identifier);
                // if (!list) {
                // 	return undefined;
                // }
                // return list.has(metadata.extension);
            }
        };
    }
    fileIsIgnored(extension, uri, token = CancellationToken.None) {
        checkProposedApiEnabled(extension, 'chatParticipantAdditions');
        return this._proxy.$fileIsIgnored(uri, token);
    }
    get isModelProxyAvailable() {
        return !!this._languageModelProxyProvider;
    }
    async getModelProxy(extension) {
        checkProposedApiEnabled(extension, 'languageModelProxy');
        if (!this._languageModelProxyProvider) {
            this._logService.trace('[LanguageModelProxy] No LanguageModelProxyProvider registered');
            throw new Error('No language model proxy provider is registered.');
        }
        const requestingExtensionId = ExtensionIdentifier.toKey(extension.identifier);
        try {
            const result = await Promise.resolve(this._languageModelProxyProvider.provideModelProxy(requestingExtensionId, CancellationToken.None));
            if (!result) {
                this._logService.warn(`[LanguageModelProxy] Provider returned no proxy for ${requestingExtensionId}`);
                throw new Error('Language model proxy is not available.');
            }
            return result;
        }
        catch (err) {
            this._logService.error(`[LanguageModelProxy] Provider failed to return proxy for ${requestingExtensionId}`, err);
            throw err;
        }
    }
    async $isFileIgnored(handle, uri, token) {
        const provider = this._ignoredFileProviders.get(handle);
        if (!provider) {
            throw new Error('Unknown LanguageModelIgnoredFileProvider');
        }
        return (await provider.provideFileIgnored(URI.revive(uri), token)) ?? false;
    }
    registerIgnoredFileProvider(extension, provider) {
        checkProposedApiEnabled(extension, 'chatParticipantPrivate');
        const handle = ExtHostLanguageModels_1._idPool++;
        this._proxy.$registerFileIgnoreProvider(handle);
        this._ignoredFileProviders.set(handle, provider);
        return toDisposable(() => {
            this._proxy.$unregisterFileIgnoreProvider(handle);
            this._ignoredFileProviders.delete(handle);
        });
    }
    registerLanguageModelProxyProvider(extension, provider) {
        checkProposedApiEnabled(extension, 'chatParticipantPrivate');
        this._languageModelProxyProvider = provider;
        this._onDidChangeModelProxyAvailability.fire();
        return toDisposable(() => {
            if (this._languageModelProxyProvider === provider) {
                this._languageModelProxyProvider = undefined;
                this._onDidChangeModelProxyAvailability.fire();
            }
        });
    }
};
ExtHostLanguageModels = ExtHostLanguageModels_1 = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService),
    __param(2, IExtHostAuthentication)
], ExtHostLanguageModels);
export { ExtHostLanguageModels };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdExhbmd1YWdlTW9kZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM3RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFtQiw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsc0JBQXNCLEVBQXlCLE1BQU0sbURBQW1ELENBQUM7QUFDL0osT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFD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