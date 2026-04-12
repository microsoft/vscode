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
var LanguageModelsService_1;
import { SequencerByKey, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import Severity from '../../../../base/common/severity.js';
import { format, isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { SubmenuAction } from '../../../../base/common/actions.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IQuickInputService, QuickInputHideReason } from '../../../../platform/quickinput/common/quickInput.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { ILanguageModelsConfigurationService } from './languageModelsConfiguration.js';
export var ChatMessageRole;
(function (ChatMessageRole) {
    ChatMessageRole[ChatMessageRole["System"] = 0] = "System";
    ChatMessageRole[ChatMessageRole["User"] = 1] = "User";
    ChatMessageRole[ChatMessageRole["Assistant"] = 2] = "Assistant";
})(ChatMessageRole || (ChatMessageRole = {}));
export var LanguageModelPartAudience;
(function (LanguageModelPartAudience) {
    LanguageModelPartAudience[LanguageModelPartAudience["Assistant"] = 0] = "Assistant";
    LanguageModelPartAudience[LanguageModelPartAudience["User"] = 1] = "User";
    LanguageModelPartAudience[LanguageModelPartAudience["Extension"] = 2] = "Extension";
})(LanguageModelPartAudience || (LanguageModelPartAudience = {}));
/**
 * Enum for supported image MIME types.
 */
export var ChatImageMimeType;
(function (ChatImageMimeType) {
    ChatImageMimeType["PNG"] = "image/png";
    ChatImageMimeType["JPEG"] = "image/jpeg";
    ChatImageMimeType["GIF"] = "image/gif";
    ChatImageMimeType["WEBP"] = "image/webp";
    ChatImageMimeType["BMP"] = "image/bmp";
})(ChatImageMimeType || (ChatImageMimeType = {}));
/**
 * Specifies the detail level of the image.
 */
export var ImageDetailLevel;
(function (ImageDetailLevel) {
    ImageDetailLevel["Low"] = "low";
    ImageDetailLevel["High"] = "high";
})(ImageDetailLevel || (ImageDetailLevel = {}));
export var ILanguageModelChatMetadata;
(function (ILanguageModelChatMetadata) {
    function suitableForAgentMode(metadata) {
        const supportsToolsAgent = typeof metadata.capabilities?.agentMode === 'undefined' || metadata.capabilities.agentMode;
        return supportsToolsAgent && !!metadata.capabilities?.toolCalling;
    }
    ILanguageModelChatMetadata.suitableForAgentMode = suitableForAgentMode;
    function asQualifiedName(metadata) {
        return `${metadata.name} (${metadata.vendor})`;
    }
    ILanguageModelChatMetadata.asQualifiedName = asQualifiedName;
    function matchesQualifiedName(name, metadata) {
        if (metadata.vendor === 'copilot' && name === metadata.name) {
            return true;
        }
        return name === asQualifiedName(metadata);
    }
    ILanguageModelChatMetadata.matchesQualifiedName = matchesQualifiedName;
})(ILanguageModelChatMetadata || (ILanguageModelChatMetadata = {}));
export async function getTextResponseFromStream(response) {
    let responseText = '';
    const streaming = (async () => {
        if (!response?.stream) {
            return;
        }
        for await (const part of response.stream) {
            if (Array.isArray(part)) {
                for (const item of part) {
                    if (item.type === 'text') {
                        responseText += item.value;
                    }
                }
            }
            else if (part.type === 'text') {
                responseText += part.value;
            }
        }
    })();
    try {
        await Promise.all([response.result, streaming]);
        return responseText;
    }
    catch (err) {
        if (responseText) {
            return responseText;
        }
        throw err;
    }
}
export function isILanguageModelChatSelector(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    return ((obj.name === undefined || typeof obj.name === 'string') &&
        (obj.id === undefined || typeof obj.id === 'string') &&
        (obj.vendor === undefined || typeof obj.vendor === 'string') &&
        (obj.version === undefined || typeof obj.version === 'string') &&
        (obj.family === undefined || typeof obj.family === 'string') &&
        (obj.tokens === undefined || typeof obj.tokens === 'number') &&
        (obj.extension === undefined || typeof obj.extension === 'object'));
}
export const ILanguageModelsService = createDecorator('ILanguageModelsService');
const languageModelChatProviderType = {
    type: 'object',
    required: ['vendor', 'displayName'],
    properties: {
        vendor: {
            type: 'string',
            description: localize('vscode.extension.contributes.languageModels.vendor', "A globally unique vendor of language model chat provider.")
        },
        displayName: {
            type: 'string',
            description: localize('vscode.extension.contributes.languageModels.displayName', "The display name of the language model chat provider.")
        },
        configuration: {
            type: 'object',
            description: localize('vscode.extension.contributes.languageModels.configuration', "Configuration options for the language model chat provider."),
            anyOf: [
                {
                    $ref: 'http://json-schema.org/draft-07/schema#'
                },
                {
                    properties: {
                        properties: {
                            type: 'object',
                            additionalProperties: {
                                $ref: 'http://json-schema.org/draft-07/schema#',
                                properties: {
                                    secret: {
                                        type: 'boolean',
                                        description: localize('vscode.extension.contributes.languageModels.configuration.secret', "Whether the property is a secret.")
                                    }
                                }
                            }
                        },
                        additionalProperties: {
                            $ref: 'http://json-schema.org/draft-07/schema#',
                            properties: {
                                secret: {
                                    type: 'boolean',
                                    description: localize('vscode.extension.contributes.languageModels.configuration.secret', "Whether the property is a secret.")
                                }
                            }
                        }
                    }
                }
            ]
        },
        managementCommand: {
            type: 'string',
            description: localize('vscode.extension.contributes.languageModels.managementCommand', "A command to manage the language model chat provider, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection."),
            deprecated: true,
            deprecationMessage: localize('vscode.extension.contributes.languageModels.managementCommand.deprecated', "The managementCommand property is deprecated and will be removed in a future release. Use the new configuration property instead.")
        },
        when: {
            type: 'string',
            description: localize('vscode.extension.contributes.languageModels.when', "Condition which must be true to show this language model chat provider in the Manage Models list.")
        }
    }
};
export const languageModelChatProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'languageModelChatProviders',
    jsonSchema: {
        description: localize('vscode.extension.contributes.languageModelChatProviders', "Contribute language model chat providers of a specific vendor."),
        oneOf: [
            languageModelChatProviderType,
            {
                type: 'array',
                items: languageModelChatProviderType
            }
        ]
    },
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            yield `onLanguageModelChatProvider:${contrib.vendor}`;
        }
    }
});
const CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY = 'chatModelPickerPreferences';
const CHAT_MODEL_RECENTLY_USED_STORAGE_KEY = 'chatModelRecentlyUsed';
const CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY = 'chat.participantNameRegistry';
const CHAT_MODELS_CONTROL_STORAGE_KEY = 'chat.modelsControl';
let LanguageModelsService = class LanguageModelsService {
    static { LanguageModelsService_1 = this; }
    static { this.SECRET_KEY_PREFIX = 'chat.lm.secret.'; }
    static { this.SECRET_INPUT = '${input:{0}}'; }
    constructor(_extensionService, _logService, _storageService, _contextKeyService, _languageModelsConfigurationService, _quickInputService, _secretStorageService, _productService, _requestService) {
        this._extensionService = _extensionService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._contextKeyService = _contextKeyService;
        this._languageModelsConfigurationService = _languageModelsConfigurationService;
        this._quickInputService = _quickInputService;
        this._secretStorageService = _secretStorageService;
        this._productService = _productService;
        this._requestService = _requestService;
        this._store = new DisposableStore();
        this._providers = new Map();
        this._vendors = new Map();
        this._onDidChangeLanguageModelVendors = this._store.add(new Emitter());
        this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
        this._modelsGroups = new Map();
        this._modelCache = new Map();
        this._resolveLMSequencer = new SequencerByKey();
        this._modelPickerUserPreferences = {};
        this._modelConfigurations = new Map();
        this._onLanguageModelChange = this._store.add(new Emitter());
        this.onDidChangeLanguageModels = this._onLanguageModelChange.event;
        this._recentlyUsedModelIds = [];
        this._onDidChangeModelsControlManifest = this._store.add(new Emitter());
        this.onDidChangeModelsControlManifest = this._onDidChangeModelsControlManifest.event;
        this._modelsControlManifest = { free: {}, paid: {} };
        this._chatControlDisposed = false;
        this._restrictedChatParticipants = observableValue(this, Object.create(null));
        this.restrictedChatParticipants = this._restrictedChatParticipants;
        this._hasUserSelectableModels = ChatContextKeys.languageModelsAreUserSelectable.bindTo(_contextKeyService);
        this._modelPickerUserPreferences = this._readModelPickerPreferences();
        this._recentlyUsedModelIds = this._readRecentlyUsedModels();
        this._initChatControlData();
        this._store.add(this._storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, this._store)(() => this._onDidChangeModelPickerPreferences()));
        this._store.add(this.onDidChangeLanguageModels(() => {
            this._hasUserSelectableModels.set(this._modelCache.size > 0 && Array.from(this._modelCache.values()).some(model => model.isUserSelectable));
            this._refreshModelsControlManifest();
        }));
        this._store.add(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups(changedGroups => this._onDidChangeLanguageModelGroups(changedGroups)));
        this._store.add(languageModelChatProviderExtensionPoint.setHandler((extensions, { added, removed }) => {
            const addedVendors = [];
            const removedVendors = [];
            for (const extension of added) {
                for (const item of Iterable.wrap(extension.value)) {
                    if (this._vendors.has(item.vendor)) {
                        extension.collector.error(localize('vscode.extension.contributes.languageModels.vendorAlreadyRegistered', "The vendor '{0}' is already registered and cannot be registered twice", item.vendor));
                        continue;
                    }
                    if (isFalsyOrWhitespace(item.vendor)) {
                        extension.collector.error(localize('vscode.extension.contributes.languageModels.emptyVendor', "The vendor field cannot be empty."));
                        continue;
                    }
                    if (item.vendor.trim() !== item.vendor) {
                        extension.collector.error(localize('vscode.extension.contributes.languageModels.whitespaceVendor', "The vendor field cannot start or end with whitespace."));
                        continue;
                    }
                    addedVendors.push(item);
                }
            }
            for (const extension of removed) {
                for (const item of Iterable.wrap(extension.value)) {
                    removedVendors.push(item);
                }
            }
            this.deltaLanguageModelChatProviderDescriptors(addedVendors, removedVendors);
        }));
    }
    deltaLanguageModelChatProviderDescriptors(added, removed) {
        const addedVendorIds = [];
        const removedVendorIds = [];
        for (const item of added) {
            if (this._vendors.has(item.vendor)) {
                this._logService.error(`The vendor '${item.vendor}' is already registered and cannot be registered twice`);
                continue;
            }
            if (isFalsyOrWhitespace(item.vendor)) {
                this._logService.error('The vendor field cannot be empty.');
                continue;
            }
            if (item.vendor.trim() !== item.vendor) {
                this._logService.error('The vendor field cannot start or end with whitespace.');
                continue;
            }
            const vendor = {
                vendor: item.vendor,
                displayName: item.displayName,
                configuration: item.configuration,
                managementCommand: item.managementCommand,
                when: item.when,
                isDefault: item.vendor === 'copilot'
            };
            this._vendors.set(item.vendor, vendor);
            addedVendorIds.push(item.vendor);
            // Have some models we want from this vendor, so activate the extension
            if (this._hasStoredModelForVendor(item.vendor)) {
                this._extensionService.activateByEvent(`onLanguageModelChatProvider:${item.vendor}`);
            }
        }
        for (const item of removed) {
            this._vendors.delete(item.vendor);
            this._providers.delete(item.vendor);
            this._clearModelCache(item.vendor);
            removedVendorIds.push(item.vendor);
        }
        for (const [vendor, _] of this._providers) {
            if (!this._vendors.has(vendor)) {
                this._providers.delete(vendor);
            }
        }
        if (addedVendorIds.length > 0 || removedVendorIds.length > 0) {
            this._onDidChangeLanguageModelVendors.fire([...addedVendorIds, ...removedVendorIds]);
            if (removedVendorIds.length > 0) {
                for (const vendor of removedVendorIds) {
                    this._onLanguageModelChange.fire(vendor);
                }
            }
        }
    }
    async _onDidChangeLanguageModelGroups(changedGroups) {
        const changedVendors = new Set(changedGroups.map(g => g.vendor));
        await Promise.all(Array.from(changedVendors).map(vendor => this._resolveAllLanguageModels(vendor, true)));
    }
    _readModelPickerPreferences() {
        return this._storageService.getObject(CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, 0 /* StorageScope.PROFILE */, {});
    }
    _onDidChangeModelPickerPreferences() {
        const newPreferences = this._readModelPickerPreferences();
        const oldPreferences = this._modelPickerUserPreferences;
        // Check if there are any changes by computing diff
        const affectedVendors = new Set();
        let hasChanges = false;
        // Check for added or updated keys
        for (const modelId in newPreferences) {
            if (oldPreferences[modelId] !== newPreferences[modelId]) {
                hasChanges = true;
                const model = this._modelCache.get(modelId);
                if (model) {
                    affectedVendors.add(model.vendor);
                }
            }
        }
        // Check for removed keys
        for (const modelId in oldPreferences) {
            if (!newPreferences.hasOwnProperty(modelId)) {
                hasChanges = true;
                const model = this._modelCache.get(modelId);
                if (model) {
                    affectedVendors.add(model.vendor);
                }
            }
        }
        if (hasChanges) {
            this._logService.trace('[LM] Updated model picker preferences from storage');
            this._modelPickerUserPreferences = newPreferences;
            for (const vendor of affectedVendors) {
                this._onLanguageModelChange.fire(vendor);
            }
        }
    }
    _hasStoredModelForVendor(vendor) {
        return Object.keys(this._modelPickerUserPreferences).some(modelId => {
            return modelId.startsWith(vendor);
        });
    }
    _saveModelPickerPreferences() {
        this._storageService.store(CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, this._modelPickerUserPreferences, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    updateModelPickerPreference(modelIdentifier, showInModelPicker) {
        const model = this._modelCache.get(modelIdentifier);
        if (!model) {
            this._logService.warn(`[LM] Cannot update model picker preference for unknown model ${modelIdentifier}`);
            return;
        }
        this._modelPickerUserPreferences[modelIdentifier] = showInModelPicker;
        if (showInModelPicker === model.isUserSelectable) {
            delete this._modelPickerUserPreferences[modelIdentifier];
            this._saveModelPickerPreferences();
        }
        else if (model.isUserSelectable !== showInModelPicker) {
            this._saveModelPickerPreferences();
        }
        this._onLanguageModelChange.fire(model.vendor);
        this._logService.trace(`[LM] Updated model picker preference for ${modelIdentifier} to ${showInModelPicker}`);
    }
    getVendors() {
        return Array.from(this._vendors.values())
            .filter(vendor => {
            if (!vendor.when) {
                return true; // No when clause means always visible
            }
            const whenClause = ContextKeyExpr.deserialize(vendor.when);
            return whenClause ? this._contextKeyService.contextMatchesRules(whenClause) : false;
        });
    }
    getLanguageModelIds() {
        return Array.from(this._modelCache.keys());
    }
    lookupLanguageModel(modelIdentifier) {
        const model = this._modelCache.get(modelIdentifier);
        if (model && this._modelPickerUserPreferences[modelIdentifier] !== undefined) {
            return { ...model, isUserSelectable: this._modelPickerUserPreferences[modelIdentifier] };
        }
        return model;
    }
    lookupLanguageModelByQualifiedName(referenceName) {
        for (const [identifier, model] of this._modelCache.entries()) {
            if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, model)) {
                return { metadata: model, identifier };
            }
        }
        return undefined;
    }
    async _resolveAllLanguageModels(vendorId, silent) {
        const vendor = this._vendors.get(vendorId);
        if (!vendor) {
            return;
        }
        // Activate extensions before requesting to resolve the models
        await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendorId}`);
        const provider = this._providers.get(vendorId);
        if (!provider) {
            this._logService.warn(`[LM] No provider registered for vendor ${vendorId}`);
            return;
        }
        return this._resolveLMSequencer.queue(vendorId, async () => {
            const allModels = [];
            const languageModelsGroups = [];
            try {
                const models = await provider.provideLanguageModelChatInfo({ silent }, CancellationToken.None);
                if (models.length) {
                    allModels.push(...models);
                    const modelIdentifiers = [];
                    for (const m of models) {
                        if (vendor.isDefault) {
                            // Special case for copilot models - they are all user selectable unless marked otherwise
                            if (m.metadata.isUserSelectable || this._modelPickerUserPreferences[m.identifier] === true) {
                                modelIdentifiers.push(m.identifier);
                            }
                            else {
                                this._logService.trace(`[LM] Skipping model ${m.identifier} from model picker as it is not user selectable.`);
                            }
                        }
                        else {
                            modelIdentifiers.push(m.identifier);
                        }
                    }
                    languageModelsGroups.push({ modelIdentifiers });
                }
            }
            catch (error) {
                languageModelsGroups.push({
                    modelIdentifiers: [],
                    status: {
                        message: getErrorMessage(error),
                        severity: Severity.Error
                    }
                });
            }
            const groups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
            const perModelConfigurations = new Map();
            for (const group of groups) {
                if (group.vendor !== vendorId) {
                    continue;
                }
                // For the default vendor, groups that only have per-model config
                // should not trigger a separate model resolution call.
                // Instead, apply the per-model config to the already-resolved models.
                if (vendor.isDefault && !vendor.configuration) {
                    if (group.settings) {
                        for (const model of allModels) {
                            const modelConfig = group.settings[model.metadata.id];
                            if (modelConfig) {
                                // Store raw config (without resolving secrets) to avoid leaking secrets on persist
                                perModelConfigurations.set(model.identifier, { ...modelConfig });
                            }
                        }
                    }
                    languageModelsGroups.push({ group, modelIdentifiers: [] });
                    continue;
                }
                const configuration = await this._resolveConfiguration(group, vendor.configuration);
                try {
                    const models = await provider.provideLanguageModelChatInfo({ group: group.name, silent, configuration }, CancellationToken.None);
                    if (models.length) {
                        allModels.push(...models);
                        languageModelsGroups.push({ group, modelIdentifiers: models.map(m => m.identifier) });
                    }
                    // Collect per-model configurations from the group
                    if (group.settings) {
                        for (const model of models) {
                            const modelConfig = group.settings[model.metadata.id];
                            if (modelConfig) {
                                // Store raw config (without resolving secrets) to avoid leaking secrets on persist
                                perModelConfigurations.set(model.identifier, { ...modelConfig });
                            }
                        }
                    }
                }
                catch (error) {
                    languageModelsGroups.push({
                        group,
                        modelIdentifiers: [],
                        status: {
                            message: getErrorMessage(error),
                            severity: Severity.Error
                        }
                    });
                }
            }
            this._modelsGroups.set(vendorId, languageModelsGroups);
            const oldModels = this._clearModelCache(vendorId);
            let hasChanges = false;
            for (const model of allModels) {
                if (this._modelCache.has(model.identifier)) {
                    this._logService.warn(`[LM] Model ${model.identifier} is already registered. Skipping.`);
                    continue;
                }
                this._modelCache.set(model.identifier, model.metadata);
                hasChanges = hasChanges || !equals(oldModels.get(model.identifier), model.metadata);
                oldModels.delete(model.identifier);
            }
            this._logService.trace(`[LM] Resolved language models for vendor ${vendorId}`, allModels);
            hasChanges = hasChanges || oldModels.size > 0;
            // Update per-model configurations for this vendor
            this._clearModelConfigurations(vendorId);
            for (const [identifier, config] of perModelConfigurations) {
                if (this._modelCache.has(identifier)) {
                    this._modelConfigurations.set(identifier, config);
                }
            }
            if (hasChanges) {
                this._onLanguageModelChange.fire(vendorId);
            }
            else {
                this._logService.trace(`[LM] No changes in language models for vendor ${vendorId}`);
            }
        });
    }
    getLanguageModelGroups(vendor) {
        return this._modelsGroups.get(vendor) ?? [];
    }
    async selectLanguageModels(selector) {
        if (selector.vendor) {
            await this._resolveAllLanguageModels(selector.vendor, true);
        }
        else {
            const allVendors = Array.from(this._vendors.keys());
            await Promise.all(allVendors.map(vendor => this._resolveAllLanguageModels(vendor, true)));
        }
        const result = [];
        for (const [internalModelIdentifier, model] of this._modelCache) {
            if ((selector.vendor === undefined || model.vendor === selector.vendor)
                && (selector.family === undefined || model.family === selector.family)
                && (selector.version === undefined || model.version === selector.version)
                && (selector.id === undefined || model.id === selector.id)) {
                result.push(internalModelIdentifier);
            }
        }
        this._logService.trace('[LM] selected language models', selector, result);
        return result;
    }
    registerLanguageModelProvider(vendor, provider) {
        this._logService.trace('[LM] registering language model provider', vendor, provider);
        if (!this._vendors.has(vendor)) {
            throw new Error(`Chat model provider uses UNKNOWN vendor ${vendor}.`);
        }
        if (this._providers.has(vendor)) {
            throw new Error(`Chat model provider for vendor ${vendor} is already registered.`);
        }
        this._providers.set(vendor, provider);
        if (this._hasStoredModelForVendor(vendor)) {
            this._resolveAllLanguageModels(vendor, true);
        }
        const modelChangeListener = provider.onDidChange(() => {
            this._resolveAllLanguageModels(vendor, true);
        });
        return toDisposable(() => {
            this._logService.trace('[LM] UNregistered language model provider', vendor);
            this._clearModelCache(vendor);
            this._providers.delete(vendor);
            modelChangeListener.dispose();
        });
    }
    async sendChatRequest(modelId, from, messages, options, token) {
        const metadata = this._modelCache.get(modelId);
        const provider = this._providers.get(metadata?.vendor || '');
        if (!provider) {
            throw new Error(`Chat provider for model ${modelId} is not registered.`);
        }
        const configuration = this.getModelConfiguration(modelId);
        const mergedOptions = configuration ? { ...options, configuration: { ...configuration, ...options.configuration } } : options;
        return provider.sendChatRequest(modelId, messages, from, mergedOptions, token);
    }
    _resolveModelConfigurationWithDefaults(modelId, metadata) {
        const userConfig = this._modelConfigurations.get(modelId);
        const schema = metadata?.configurationSchema;
        if (!schema?.properties && !userConfig) {
            return undefined;
        }
        // Start with schema defaults
        const defaults = {};
        if (schema?.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (propSchema.default !== undefined) {
                    defaults[key] = propSchema.default;
                }
            }
        }
        if (!userConfig && Object.keys(defaults).length === 0) {
            return undefined;
        }
        // User config overrides defaults
        return { ...defaults, ...userConfig };
    }
    computeTokenLength(modelId, message, token) {
        const model = this._modelCache.get(modelId);
        if (!model) {
            throw new Error(`Chat model ${modelId} could not be found.`);
        }
        const provider = this._providers.get(model.vendor);
        if (!provider) {
            throw new Error(`Chat provider for model ${modelId} is not registered.`);
        }
        return provider.provideTokenCount(modelId, message, token);
    }
    getModelConfiguration(modelId) {
        const metadata = this._modelCache.get(modelId);
        return this._resolveModelConfigurationWithDefaults(modelId, metadata);
    }
    async setModelConfiguration(modelId, values) {
        const metadata = this._modelCache.get(modelId);
        if (!metadata) {
            return;
        }
        // Find the group from the configuration service (source of truth)
        const allGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
        let group;
        // First try to find a group that already has config for this model
        group = allGroups.find(g => g.vendor === metadata.vendor && g.settings?.[metadata.id] !== undefined);
        // If not found, find any group for this vendor
        if (!group) {
            group = allGroups.find(g => g.vendor === metadata.vendor);
        }
        // Merge new values into existing config, removing properties set to their schema default
        const existingConfig = this._modelConfigurations.get(modelId) ?? {};
        const updatedConfig = { ...existingConfig, ...values };
        const schema = metadata.configurationSchema;
        if (schema?.properties) {
            for (const [key, value] of Object.entries(updatedConfig)) {
                const propSchema = schema.properties[key];
                if (propSchema?.default !== undefined && propSchema.default === value) {
                    delete updatedConfig[key];
                }
            }
        }
        if (group) {
            const existingSettings = group.settings ?? {};
            let updatedSettings;
            if (Object.keys(updatedConfig).length === 0) {
                updatedSettings = { ...existingSettings };
                delete updatedSettings[metadata.id];
            }
            else {
                updatedSettings = { ...existingSettings, [metadata.id]: updatedConfig };
            }
            const updatedGroup = {
                ...group,
                settings: Object.keys(updatedSettings).length > 0 ? updatedSettings : undefined
            };
            if (!updatedGroup.settings && Object.keys(updatedGroup).filter(k => k !== 'name' && k !== 'vendor' && k !== 'range' && k !== 'settings').length === 0) {
                // Remove the group entirely if it only had model config
                await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(group);
            }
            else {
                await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(group, updatedGroup);
            }
        }
        else if (Object.keys(updatedConfig).length > 0) {
            // Only create a new group if there's non-default config
            const vendor = this.getVendors().find(v => v.vendor === metadata.vendor);
            if (!vendor) {
                return;
            }
            const newGroup = {
                name: vendor.displayName,
                vendor: metadata.vendor,
                settings: { [metadata.id]: updatedConfig }
            };
            await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
        }
        // Update the in-memory cache
        if (Object.keys(updatedConfig).length > 0) {
            this._modelConfigurations.set(modelId, updatedConfig);
        }
        else {
            this._modelConfigurations.delete(modelId);
        }
        // Notify listeners so UI (e.g., model picker label) updates
        this._onLanguageModelChange.fire(metadata.vendor);
    }
    getModelConfigurationActions(modelId) {
        const metadata = this._modelCache.get(modelId);
        const schema = metadata?.configurationSchema;
        if (!schema?.properties) {
            return [];
        }
        const actions = [];
        const currentConfig = this._modelConfigurations.get(modelId) ?? {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (!propSchema.enum || !Array.isArray(propSchema.enum)) {
                continue;
            }
            const currentValue = currentConfig[key] ?? propSchema.default;
            const label = (typeof propSchema.title === 'string' ? propSchema.title : undefined)
                ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/^./, s => s.toUpperCase());
            const defaultValue = propSchema.default;
            const enumItemLabels = propSchema.enumItemLabels;
            const enumDescriptions = propSchema.enumDescriptions;
            const enumActions = propSchema.enum.map((value, index) => {
                const itemLabel = enumItemLabels?.[index] ?? String(value);
                const displayLabel = value === defaultValue ? localize('models.enumDefault', "{0} (default)", itemLabel) : itemLabel;
                const tooltip = enumDescriptions?.[index] ?? '';
                return {
                    id: `configureModel.${key}.${value}`,
                    label: displayLabel,
                    class: undefined,
                    enabled: true,
                    tooltip,
                    checked: currentValue === value,
                    run: () => this.setModelConfiguration(modelId, { [key]: value })
                };
            });
            actions.push(new SubmenuAction(`configureModel.${key}`, label, enumActions));
        }
        return actions;
    }
    async configureLanguageModelsProviderGroup(vendorId, providerGroupName) {
        const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
        if (!vendor) {
            throw new Error(`Vendor ${vendorId} not found.`);
        }
        if (vendor.managementCommand) {
            await this._resolveAllLanguageModels(vendor.vendor, false);
            return;
        }
        const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
        const existing = languageModelProviderGroups.find(g => g.vendor === vendorId && g.name === providerGroupName);
        const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
        if (!name) {
            return;
        }
        const existingConfiguration = existing ? await this._resolveConfiguration(existing, vendor.configuration) : undefined;
        try {
            const configuration = vendor.configuration ? await this.promptForConfiguration(name, vendor.configuration, existingConfiguration) : undefined;
            if (vendor.configuration && !configuration) {
                return;
            }
            const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
            const saved = existing
                ? await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, languageModelProviderGroup)
                : await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
            if (vendor.configuration && this.requireConfiguring(vendor.configuration)) {
                const snippet = this.getSnippetForFirstUnconfiguredProperty(configuration ?? {}, vendor.configuration);
                await this._languageModelsConfigurationService.configureLanguageModels({ group: saved, snippet });
            }
        }
        catch (error) {
            if (isCancellationError(error)) {
                return;
            }
            throw error;
        }
    }
    async configureModel(modelId) {
        const metadata = this._modelCache.get(modelId);
        if (!metadata || !metadata.configurationSchema) {
            return;
        }
        // Find the group that contains this model
        const vendorGroups = this._modelsGroups.get(metadata.vendor);
        let group;
        if (vendorGroups) {
            for (const vg of vendorGroups) {
                if (vg.modelIdentifiers.includes(modelId) && vg.group) {
                    group = vg.group;
                    break;
                }
            }
        }
        // If the model doesn't belong to any configured group, create one
        if (!group) {
            const vendor = this.getVendors().find(v => v.vendor === metadata.vendor);
            if (!vendor) {
                return;
            }
            const groupName = vendor.displayName;
            const newGroup = { name: groupName, vendor: metadata.vendor, settings: { [metadata.id]: {} } };
            group = await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
            await this._resolveAllLanguageModels(metadata.vendor, true);
        }
        // Generate a snippet for the model's configuration schema
        const snippet = this._getModelConfigurationSnippet(metadata.id, metadata.configurationSchema);
        await this._languageModelsConfigurationService.configureLanguageModels({ group, snippet });
    }
    _getModelConfigurationSnippet(modelId, schema) {
        const properties = [];
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (propSchema.defaultSnippets?.[0]) {
                    const snippet = propSchema.defaultSnippets[0];
                    let bodyText = snippet.bodyText ?? JSON.stringify(snippet.body, null, '\t\t\t');
                    bodyText = bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
                    properties.push(`\t\t\t"${key}": ${bodyText}`);
                }
                else if (propSchema.default !== undefined) {
                    properties.push(`\t\t\t"${key}": ${JSON.stringify(propSchema.default)}`);
                }
                else {
                    properties.push(`\t\t\t"${key}": $\{${key}\}`);
                }
            }
        }
        const modelContent = properties.length > 0
            ? `{\n${properties.join(',\n')}\n\t\t}`
            : '{\n\t\t\t$0\n\t\t}';
        return `"settings": {\n\t\t"${modelId}": ${modelContent}\n\t}`;
    }
    async addLanguageModelsProviderGroup(name, vendorId, configuration) {
        const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
        if (!vendor) {
            throw new Error(`Vendor ${vendorId} not found.`);
        }
        const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
        await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
    }
    async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
        const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
        if (!vendor) {
            throw new Error(`Vendor ${vendorId} not found.`);
        }
        const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
        const existing = languageModelProviderGroups.find(g => g.vendor === vendorId && g.name === providerGroupName);
        if (!existing) {
            throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
        }
        await this._deleteSecretsInConfiguration(existing, vendor.configuration);
        await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(existing);
    }
    requireConfiguring(schema) {
        if (schema.additionalProperties) {
            return true;
        }
        if (!schema.properties) {
            return false;
        }
        for (const property of Object.keys(schema.properties)) {
            if (!this.canPromptForProperty(schema.properties[property])) {
                return true;
            }
        }
        return false;
    }
    getSnippetForFirstUnconfiguredProperty(configuration, schema) {
        if (!schema.properties) {
            return undefined;
        }
        for (const property of Object.keys(schema.properties)) {
            if (configuration[property] === undefined) {
                const propertySchema = schema.properties[property];
                if (propertySchema && typeof propertySchema !== 'boolean' && propertySchema.defaultSnippets?.[0]) {
                    const snippet = propertySchema.defaultSnippets[0];
                    let bodyText = snippet.bodyText ?? JSON.stringify(snippet.body, null, '\t');
                    // Handle ^ prefix for raw values (numbers/booleans) - remove quotes around ^-prefixed values
                    bodyText = bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
                    return `"${property}": ${bodyText}`;
                }
            }
        }
        return undefined;
    }
    async promptForName(languageModelProviderGroups, vendor, existing) {
        let providerGroupName = existing?.name;
        if (!providerGroupName) {
            providerGroupName = vendor.displayName;
            let count = 1;
            while (languageModelProviderGroups.some(g => g.vendor === vendor.vendor && g.name === providerGroupName)) {
                count++;
                providerGroupName = `${vendor.displayName} ${count}`;
            }
        }
        let result;
        const disposables = new DisposableStore();
        try {
            await new Promise(resolve => {
                const inputBox = disposables.add(this._quickInputService.createInputBox());
                inputBox.title = localize('configureLanguageModelGroup', "Group Name");
                inputBox.placeholder = localize('languageModelGroupName', "Enter a name for the group");
                inputBox.value = providerGroupName;
                inputBox.ignoreFocusOut = true;
                disposables.add(inputBox.onDidChangeValue(value => {
                    if (!value) {
                        inputBox.validationMessage = localize('enterName', "Please enter a name");
                        inputBox.severity = Severity.Error;
                        return;
                    }
                    if (!existing && languageModelProviderGroups.some(g => g.name === value)) {
                        inputBox.validationMessage = localize('nameExists', "A language models group with this name already exists");
                        inputBox.severity = Severity.Error;
                        return;
                    }
                    inputBox.validationMessage = undefined;
                    inputBox.severity = Severity.Ignore;
                }));
                disposables.add(inputBox.onDidAccept(async () => {
                    result = inputBox.value;
                    inputBox.hide();
                }));
                disposables.add(inputBox.onDidHide(() => resolve()));
                inputBox.show();
            });
        }
        finally {
            disposables.dispose();
        }
        return result;
    }
    async promptForConfiguration(groupName, configuration, existing) {
        if (!configuration.properties) {
            return;
        }
        const result = existing ? { ...existing } : {};
        for (const property of Object.keys(configuration.properties)) {
            const propertySchema = configuration.properties[property];
            const required = !!configuration.required?.includes(property);
            const value = await this.promptForValue(groupName, property, propertySchema, required, existing);
            if (value !== undefined) {
                result[property] = value;
            }
        }
        return result;
    }
    async promptForValue(groupName, property, propertySchema, required, existing) {
        if (!propertySchema) {
            return undefined;
        }
        if (!this.canPromptForProperty(propertySchema)) {
            return undefined;
        }
        if (propertySchema.type === 'array' && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
            const selectedItems = await this.promptForArray(groupName, property, propertySchema);
            if (selectedItems === undefined) {
                return undefined;
            }
            return selectedItems;
        }
        const value = await this.promptForInput(groupName, property, propertySchema, required, existing);
        if (value === undefined) {
            return undefined;
        }
        return value;
    }
    canPromptForProperty(propertySchema) {
        if (!propertySchema || typeof propertySchema === 'boolean') {
            return false;
        }
        if (propertySchema.type === 'array' && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
            return true;
        }
        if (propertySchema.type === 'string' || propertySchema.type === 'number' || propertySchema.type === 'integer' || propertySchema.type === 'boolean') {
            return true;
        }
        return false;
    }
    async promptForArray(groupName, property, propertySchema) {
        if (!propertySchema.items || Array.isArray(propertySchema.items) || !propertySchema.items.enum) {
            return undefined;
        }
        const items = propertySchema.items.enum;
        const disposables = new DisposableStore();
        try {
            return await new Promise(resolve => {
                const quickPick = disposables.add(this._quickInputService.createQuickPick());
                quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
                quickPick.items = items.map(item => ({ label: item }));
                quickPick.placeholder = propertySchema.description ?? localize('selectValue', "Select value for {0}", property);
                quickPick.canSelectMany = true;
                quickPick.ignoreFocusOut = true;
                disposables.add(quickPick.onDidAccept(() => {
                    resolve(quickPick.selectedItems.map(item => item.label));
                    quickPick.hide();
                }));
                disposables.add(quickPick.onDidHide(() => {
                    resolve(undefined);
                }));
                quickPick.show();
            });
        }
        finally {
            disposables.dispose();
        }
    }
    async promptForInput(groupName, property, propertySchema, required, existing) {
        const disposables = new DisposableStore();
        try {
            const value = await new Promise((resolve, reject) => {
                const inputBox = disposables.add(this._quickInputService.createInputBox());
                inputBox.title = `${groupName}: ${propertySchema.title ?? property}`;
                inputBox.placeholder = localize('enterValue', "Enter value for {0}", property);
                inputBox.password = !!propertySchema.secret;
                inputBox.ignoreFocusOut = true;
                if (existing?.[property]) {
                    inputBox.value = String(existing?.[property]);
                }
                else if (propertySchema.default) {
                    inputBox.value = String(propertySchema.default);
                }
                if (propertySchema.description) {
                    inputBox.prompt = propertySchema.description;
                }
                disposables.add(inputBox.onDidChangeValue(value => {
                    if (!value && required) {
                        inputBox.validationMessage = localize('valueRequired', "Value is required");
                        inputBox.severity = Severity.Error;
                        return;
                    }
                    if (propertySchema.type === 'number' || propertySchema.type === 'integer') {
                        if (isNaN(Number(value))) {
                            inputBox.validationMessage = localize('numberRequired', "Please enter a number");
                            inputBox.severity = Severity.Error;
                            return;
                        }
                    }
                    if (propertySchema.type === 'boolean') {
                        if (value !== 'true' && value !== 'false') {
                            inputBox.validationMessage = localize('booleanRequired', "Please enter true or false");
                            inputBox.severity = Severity.Error;
                            return;
                        }
                    }
                    inputBox.validationMessage = undefined;
                    inputBox.severity = Severity.Ignore;
                }));
                disposables.add(inputBox.onDidAccept(() => {
                    if (!inputBox.value && required) {
                        inputBox.validationMessage = localize('valueRequired', "Value is required");
                        inputBox.severity = Severity.Error;
                        return;
                    }
                    resolve(inputBox.value);
                    inputBox.hide();
                }));
                disposables.add(inputBox.onDidHide((e) => {
                    if (e.reason === QuickInputHideReason.Gesture) {
                        reject(new CancellationError());
                    }
                    else {
                        resolve(undefined);
                    }
                }));
                inputBox.show();
            });
            if (!value) {
                return undefined; // User cancelled
            }
            if (propertySchema.type === 'number' || propertySchema.type === 'integer') {
                return Number(value);
            }
            else if (propertySchema.type === 'boolean') {
                return value === 'true';
            }
            else {
                return value;
            }
        }
        finally {
            disposables.dispose();
        }
    }
    encodeSecretKey(property) {
        return format(LanguageModelsService_1.SECRET_INPUT, property);
    }
    decodeSecretKey(secretInput) {
        if (!isString(secretInput)) {
            return undefined;
        }
        return secretInput.substring(secretInput.indexOf(':') + 1, secretInput.length - 1);
    }
    _clearModelCache(vendor) {
        const removed = new Map();
        for (const [id, model] of this._modelCache.entries()) {
            if (model.vendor === vendor) {
                removed.set(id, model);
                this._modelCache.delete(id);
            }
        }
        return removed;
    }
    _clearModelConfigurations(vendor) {
        for (const [id] of this._modelConfigurations) {
            if (this._modelCache.get(id)?.vendor === vendor || id.startsWith(`${vendor}/`)) {
                this._modelConfigurations.delete(id);
            }
        }
    }
    async _resolveConfiguration(group, schema) {
        if (!schema) {
            return {};
        }
        const result = {};
        for (const key in group) {
            if (key === 'vendor' || key === 'name' || key === 'range' || key === 'settings') {
                continue;
            }
            let value = group[key];
            if (schema.properties?.[key]?.secret) {
                const secretKey = this.decodeSecretKey(value);
                value = secretKey ? await this._secretStorageService.get(secretKey) : undefined;
            }
            result[key] = value;
        }
        return result;
    }
    async _resolveLanguageModelProviderGroup(name, vendor, configuration, schema) {
        if (!schema) {
            return { name, vendor };
        }
        const result = {};
        for (const key in configuration) {
            let value = configuration[key];
            if (schema.properties?.[key]?.secret && isString(value)) {
                const secretKey = `${LanguageModelsService_1.SECRET_KEY_PREFIX}${hash(generateUuid()).toString(16)}`;
                await this._secretStorageService.set(secretKey, value);
                value = this.encodeSecretKey(secretKey);
            }
            result[key] = value;
        }
        return { name, vendor, ...result };
    }
    async _deleteSecretsInConfiguration(group, schema) {
        if (!schema) {
            return;
        }
        const { vendor, name, range, ...configuration } = group;
        for (const key in configuration) {
            const value = group[key];
            if (schema.properties?.[key]?.secret) {
                const secretKey = this.decodeSecretKey(value);
                if (secretKey) {
                    await this._secretStorageService.delete(secretKey);
                }
            }
        }
    }
    async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) {
        const { vendor, name, ...configuration } = languageModelsProviderGroup;
        if (!this._vendors.get(vendor)) {
            throw new Error(`Vendor ${vendor} not found.`);
        }
        await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendor}`);
        const provider = this._providers.get(vendor);
        if (!provider) {
            throw new Error(`Chat model provider for vendor ${vendor} is not registered.`);
        }
        const models = await provider.provideLanguageModelChatInfo({ group: name, silent: false, configuration }, CancellationToken.None);
        for (const model of models) {
            const oldIdentifier = `${vendor}/${model.metadata.id}`;
            if (this._modelPickerUserPreferences[oldIdentifier] === true) {
                this._modelPickerUserPreferences[model.identifier] = true;
            }
            delete this._modelPickerUserPreferences[oldIdentifier];
        }
        this._saveModelPickerPreferences();
        await this.addLanguageModelsProviderGroup(name, vendor, configuration);
    }
    //#region Recently used models
    _readRecentlyUsedModels() {
        return this._storageService.getObject(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, 0 /* StorageScope.PROFILE */, []);
    }
    _saveRecentlyUsedModels() {
        this._storageService.store(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, this._recentlyUsedModelIds, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    getRecentlyUsedModelIds() {
        // Filter to only include models that still exist in the cache
        return this._recentlyUsedModelIds
            .filter(id => this._modelCache.has(id) && id !== 'copilot/auto')
            .slice(0, 4);
    }
    addToRecentlyUsedList(modelIdentifier) {
        if (modelIdentifier === 'copilot/auto') {
            return;
        }
        // Remove if already present (to move to front)
        const index = this._recentlyUsedModelIds.indexOf(modelIdentifier);
        if (index !== -1) {
            this._recentlyUsedModelIds.splice(index, 1);
        }
        // Add to front
        this._recentlyUsedModelIds.unshift(modelIdentifier);
        // Cap at a reasonable max to avoid unbounded growth
        if (this._recentlyUsedModelIds.length > 20) {
            this._recentlyUsedModelIds.length = 20;
        }
        this._saveRecentlyUsedModels();
    }
    clearRecentlyUsedList() {
        this._recentlyUsedModelIds = [];
        this._saveRecentlyUsedModels();
    }
    //#endregion
    //#region Models control manifest
    getModelsControlManifest() {
        return this._modelsControlManifest;
    }
    _setModelsControlManifest(response) {
        this._modelsControlRawResponse = response;
        this._refreshModelsControlManifest();
    }
    _refreshModelsControlManifest() {
        const response = this._modelsControlRawResponse;
        const free = {};
        const paid = {};
        if (response?.free) {
            const freeEntries = Array.isArray(response.free) ? response.free : Object.values(response.free);
            for (const entry of freeEntries) {
                if (!entry || !isObject(entry)) {
                    continue;
                }
                free[entry.id] = { label: entry.label, featured: entry.featured, exists: this._modelCache.has(`copilot/${entry.id}`) };
            }
        }
        if (response?.paid) {
            const paidEntries = Array.isArray(response.paid) ? response.paid : Object.values(response.paid);
            for (const entry of paidEntries) {
                if (!entry || !isObject(entry)) {
                    continue;
                }
                paid[entry.id] = { label: entry.label, featured: entry.featured, minVSCodeVersion: entry.minVSCodeVersion, exists: this._modelCache.has(`copilot/${entry.id}`) };
            }
        }
        this._modelsControlManifest = { free, paid };
        this._onDidChangeModelsControlManifest.fire(this._modelsControlManifest);
    }
    //#region Chat control data
    _initChatControlData() {
        this._chatControlUrl = this._productService.chatParticipantRegistry;
        if (!this._chatControlUrl) {
            return;
        }
        // Restore participant registry from storage
        const raw = this._storageService.get(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        try {
            this._restrictedChatParticipants.set(JSON.parse(raw ?? '{}'), undefined);
        }
        catch (err) {
            this._storageService.remove(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
        // Restore models control manifest from storage
        const rawModels = this._storageService.get(CHAT_MODELS_CONTROL_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        try {
            const models = JSON.parse(rawModels ?? '{}');
            if (isObject(models)) {
                this._setModelsControlManifest(models);
            }
        }
        catch (err) {
            this._storageService.remove(CHAT_MODELS_CONTROL_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
        this._refreshChatControlData();
    }
    _refreshChatControlData() {
        if (this._chatControlDisposed) {
            return;
        }
        this._fetchChatControlData()
            .catch(err => this._logService.warn('Failed to fetch chat control data', err))
            .then(() => timeout(5 * 60 * 1000)) // every 5 minutes
            .then(() => this._refreshChatControlData());
    }
    async _fetchChatControlData() {
        this._logService.trace('[LM] Fetching chat control data from', this._chatControlUrl);
        let context;
        try {
            context = await this._requestService.request({ type: 'GET', url: this._chatControlUrl, callSite: 'languageModels.fetchChatControlData' }, CancellationToken.None);
        }
        catch (err) {
            this._logService.warn('[LM] Failed to request chat control data', getErrorMessage(err));
            return;
        }
        if (context.res.statusCode !== 200) {
            this._logService.warn(`[LM] Chat control data request failed with status ${context.res.statusCode}`);
            return;
        }
        let result;
        try {
            result = await asJson(context);
        }
        catch (err) {
            this._logService.warn('[LM] Failed to parse chat control response', getErrorMessage(err));
            return;
        }
        this._logService.trace('[LM] Received chat control response', result ? Object.keys(result) : 'null');
        if (!result || result.version !== 1) {
            this._logService.warn('[LM] Unexpected chat control response version', result?.version);
            return;
        }
        // Update restricted chat participants
        const registry = result.restrictedChatParticipants;
        this._restrictedChatParticipants.set(registry, undefined);
        this._storageService.store(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, JSON.stringify(registry), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        // Update models control manifest
        if (result.models) {
            this._logService.trace('[LM] Updating models control manifest', { freeCount: Object.keys(result.models.free ?? {}).length, paidCount: Object.keys(result.models.paid ?? {}).length });
            this._setModelsControlManifest(result.models);
            this._storageService.store(CHAT_MODELS_CONTROL_STORAGE_KEY, JSON.stringify(result.models), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
    }
    //#endregion
    dispose() {
        this._chatControlDisposed = true;
        this._store.dispose();
        this._providers.clear();
    }
};
LanguageModelsService = LanguageModelsService_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, ILogService),
    __param(2, IStorageService),
    __param(3, IContextKeyService),
    __param(4, ILanguageModelsConfigurationService),
    __param(5, IQuickInputService),
    __param(6, ISecretStorageService),
    __param(7, IProductService),
    __param(8, IRequestService)
], LanguageModelsService);
export { LanguageModelsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFL0QsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVqRixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV2SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRS9ELE9BQU8sRUFBZ0MsbUNBQW1DLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVySCxNQUFNLENBQU4sSUFBa0IsZUFJakI7QUFKRCxXQUFrQixlQUFlO0lBQ2hDLHlEQUFNLENBQUE7SUFDTixxREFBSSxDQUFBO0lBQ0osK0RBQVMsQ0FBQTtBQUNWLENBQUMsRUFKaUIsZUFBZSxLQUFmLGVBQWUsUUFJaEM7QUFFRCxNQUFNLENBQU4sSUFBWSx5QkFJWDtBQUpELFdBQVkseUJBQXlCO0lBQ3BDLG1GQUFhLENBQUE7SUFDYix5RUFBUSxDQUFBO0lBQ1IsbUZBQWEsQ0FBQTtBQUNkLENBQUMsRUFKVyx5QkFBeUIsS0FBekIseUJBQXlCLFFBSXBDO0FBd0NEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksaUJBTVg7QUFORCxXQUFZLGlCQUFpQjtJQUM1QixzQ0FBaUIsQ0FBQTtJQUNqQix3Q0FBbUIsQ0FBQTtJQUNuQixzQ0FBaUIsQ0FBQTtJQUNqQix3Q0FBbUIsQ0FBQTtJQUNuQixzQ0FBaUIsQ0FBQTtBQUNsQixDQUFDLEVBTlcsaUJBQWlCLEtBQWpCLGlCQUFpQixRQU01QjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksZ0JBR1g7QUFIRCxXQUFZLGdCQUFnQjtJQUMzQiwrQkFBVyxDQUFBO0lBQ1gsaUNBQWEsQ0FBQTtBQUNkLENBQUMsRUFIVyxnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBRzNCO0FBc0hELE1BQU0sS0FBVywwQkFBMEIsQ0FnQjFDO0FBaEJELFdBQWlCLDBCQUEwQjtJQUMxQyxTQUFnQixvQkFBb0IsQ0FBQyxRQUFvQztRQUN4RSxNQUFNLGtCQUFrQixHQUFHLE9BQU8sUUFBUSxDQUFDLFlBQVksRUFBRSxTQUFTLEtBQUssV0FBVyxJQUFJLFFBQVEsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDO1FBQ3RILE9BQU8sa0JBQWtCLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDO0lBQ25FLENBQUM7SUFIZSwrQ0FBb0IsdUJBR25DLENBQUE7SUFFRCxTQUFnQixlQUFlLENBQUMsUUFBb0M7UUFDbkUsT0FBTyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDO0lBQ2hELENBQUM7SUFGZSwwQ0FBZSxrQkFFOUIsQ0FBQTtJQUVELFNBQWdCLG9CQUFvQixDQUFDLElBQVksRUFBRSxRQUFvQztRQUN0RixJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssU0FBUyxJQUFJLElBQUksS0FBSyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0QsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxJQUFJLEtBQUssZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFMZSwrQ0FBb0IsdUJBS25DLENBQUE7QUFDRixDQUFDLEVBaEJnQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBZ0IxQztBQVFELE1BQU0sQ0FBQyxLQUFLLFVBQVUseUJBQXlCLENBQUMsUUFBb0M7SUFDbkYsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO0lBQ3RCLE1BQU0sU0FBUyxHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDN0IsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUN2QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksS0FBSyxFQUFFLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDekIsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDekIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO3dCQUMxQixZQUFZLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztvQkFDNUIsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztpQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ2pDLFlBQVksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUVMLElBQUksQ0FBQztRQUNKLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNoRCxPQUFPLFlBQVksQ0FBQztJQUNyQixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNkLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxZQUFZLENBQUM7UUFDckIsQ0FBQztRQUNELE1BQU0sR0FBRyxDQUFDO0lBQ1gsQ0FBQztBQUNGLENBQUM7QUEwQkQsTUFBTSxVQUFVLDRCQUE0QixDQUFDLEtBQWM7SUFDMUQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ2pELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE1BQU0sR0FBRyxHQUFHLEtBQWdDLENBQUM7SUFDN0MsT0FBTyxDQUNOLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQztRQUN4RCxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssU0FBUyxJQUFJLE9BQU8sR0FBRyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUM7UUFDcEQsQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDO1FBQzVELENBQUMsR0FBRyxDQUFDLE9BQU8sS0FBSyxTQUFTLElBQUksT0FBTyxHQUFHLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQztRQUM5RCxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssU0FBUyxJQUFJLE9BQU8sR0FBRyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUM7UUFDNUQsQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDO1FBQzVELENBQUMsR0FBRyxDQUFDLFNBQVMsS0FBSyxTQUFTLElBQUksT0FBTyxHQUFHLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUNsRSxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsd0JBQXdCLENBQUMsQ0FBQztBQWlKeEcsTUFBTSw2QkFBNkIsR0FBRztJQUNyQyxJQUFJLEVBQUUsUUFBUTtJQUNkLFFBQVEsRUFBRSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUM7SUFDbkMsVUFBVSxFQUFFO1FBQ1gsTUFBTSxFQUFFO1lBQ1AsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLG9EQUFvRCxFQUFFLDJEQUEyRCxDQUFDO1NBQ3hJO1FBQ0QsV0FBVyxFQUFFO1lBQ1osSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLHlEQUF5RCxFQUFFLHVEQUF1RCxDQUFDO1NBQ3pJO1FBQ0QsYUFBYSxFQUFFO1lBQ2QsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLDJEQUEyRCxFQUFFLDZEQUE2RCxDQUFDO1lBQ2pKLEtBQUssRUFBRTtnQkFDTjtvQkFDQyxJQUFJLEVBQUUseUNBQXlDO2lCQUMvQztnQkFDRDtvQkFDQyxVQUFVLEVBQUU7d0JBQ1gsVUFBVSxFQUFFOzRCQUNYLElBQUksRUFBRSxRQUFROzRCQUNkLG9CQUFvQixFQUFFO2dDQUNyQixJQUFJLEVBQUUseUNBQXlDO2dDQUMvQyxVQUFVLEVBQUU7b0NBQ1gsTUFBTSxFQUFFO3dDQUNQLElBQUksRUFBRSxTQUFTO3dDQUNmLFdBQVcsRUFBRSxRQUFRLENBQUMsa0VBQWtFLEVBQUUsbUNBQW1DLENBQUM7cUNBQzlIO2lDQUNEOzZCQUNEO3lCQUNEO3dCQUNELG9CQUFvQixFQUFFOzRCQUNyQixJQUFJLEVBQUUseUNBQXlDOzRCQUMvQyxVQUFVLEVBQUU7Z0NBQ1gsTUFBTSxFQUFFO29DQUNQLElBQUksRUFBRSxTQUFTO29DQUNmLFdBQVcsRUFBRSxRQUFRLENBQUMsa0VBQWtFLEVBQUUsbUNBQW1DLENBQUM7aUNBQzlIOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2FBQ0Q7U0FFRDtRQUNELGlCQUFpQixFQUFFO1lBQ2xCLElBQUksRUFBRSxRQUFRO1lBQ2QsV0FBVyxFQUFFLFFBQVEsQ0FBQywrREFBK0QsRUFBRSxrTUFBa00sQ0FBQztZQUMxUixVQUFVLEVBQUUsSUFBSTtZQUNoQixrQkFBa0IsRUFBRSxRQUFRLENBQUMsMEVBQTBFLEVBQUUsbUlBQW1JLENBQUM7U0FDN087UUFDRCxJQUFJLEVBQUU7WUFDTCxJQUFJLEVBQUUsUUFBUTtZQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsa0RBQWtELEVBQUUsbUdBQW1HLENBQUM7U0FDOUs7S0FDRDtDQUM4QixDQUFDO0FBUWpDLE1BQU0sQ0FBQyxNQUFNLHVDQUF1QyxHQUFHLGtCQUFrQixDQUFDLHNCQUFzQixDQUE0RDtJQUMzSixjQUFjLEVBQUUsNEJBQTRCO0lBQzVDLFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxRQUFRLENBQUMseURBQXlELEVBQUUsZ0VBQWdFLENBQUM7UUFDbEosS0FBSyxFQUFFO1lBQ04sNkJBQTZCO1lBQzdCO2dCQUNDLElBQUksRUFBRSxPQUFPO2dCQUNiLEtBQUssRUFBRSw2QkFBNkI7YUFDcEM7U0FDRDtLQUNEO0lBQ0QseUJBQXlCLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBK0M7UUFDcEYsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNoQyxNQUFNLCtCQUErQixPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdkQsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxNQUFNLHlDQUF5QyxHQUFHLDRCQUE0QixDQUFDO0FBQy9FLE1BQU0sb0NBQW9DLEdBQUcsdUJBQXVCLENBQUM7QUFDckUsTUFBTSwwQ0FBMEMsR0FBRyw4QkFBOEIsQ0FBQztBQUNsRixNQUFNLCtCQUErQixHQUFHLG9CQUFvQixDQUFDO0FBV3RELElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCOzthQUVsQixzQkFBaUIsR0FBRyxpQkFBaUIsQUFBcEIsQ0FBcUI7YUFDdEMsaUJBQVksR0FBRyxjQUFjLEFBQWpCLENBQWtCO0lBb0M3QyxZQUNvQixpQkFBcUQsRUFDM0QsV0FBeUMsRUFDckMsZUFBaUQsRUFDOUMsa0JBQXVELEVBQ3RDLG1DQUF5RixFQUMxRyxrQkFBdUQsRUFDcEQscUJBQTZELEVBQ25FLGVBQWlELEVBQ2pELGVBQWlEO1FBUjlCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFDMUMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFDcEIsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzdCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDckIsd0NBQW1DLEdBQW5DLG1DQUFtQyxDQUFxQztRQUN6Rix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ25DLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDbEQsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQ2hDLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQXpDbEQsV0FBTSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFL0IsZUFBVSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBQzNELGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBNEMsQ0FBQztRQUUvRCxxQ0FBZ0MsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBWSxDQUFDLENBQUM7UUFDcEYsb0NBQStCLEdBQUcsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEtBQUssQ0FBQztRQUV0RSxrQkFBYSxHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO1FBQzFELGdCQUFXLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUM7UUFDNUQsd0JBQW1CLEdBQUcsSUFBSSxjQUFjLEVBQVUsQ0FBQztRQUM1RCxnQ0FBMkIsR0FBK0IsRUFBRSxDQUFDO1FBQ3BELHlCQUFvQixHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBR3JFLDJCQUFzQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFVLENBQUMsQ0FBQztRQUN4RSw4QkFBeUIsR0FBa0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQztRQUU5RSwwQkFBcUIsR0FBYSxFQUFFLENBQUM7UUFFNUIsc0NBQWlDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQTBCLENBQUMsQ0FBQztRQUNuRyxxQ0FBZ0MsR0FBRyxJQUFJLENBQUMsaUNBQWlDLENBQUMsS0FBSyxDQUFDO1FBRWpGLDJCQUFzQixHQUEyQixFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBSXhFLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUVwQixnQ0FBMkIsR0FBRyxlQUFlLENBQStCLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0csK0JBQTBCLEdBQThDLElBQUksQ0FBQywyQkFBMkIsQ0FBQztRQWFqSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsZUFBZSxDQUFDLCtCQUErQixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNHLElBQUksQ0FBQywyQkFBMkIsR0FBRyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUN0RSxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDNUQsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsK0JBQXVCLHlDQUF5QyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdEwsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsRUFBRTtZQUNuRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQzVJLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsOEJBQThCLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsK0JBQStCLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRS9KLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO1lBQ3JHLE1BQU0sWUFBWSxHQUFpQyxFQUFFLENBQUM7WUFDdEQsTUFBTSxjQUFjLEdBQWlDLEVBQUUsQ0FBQztZQUV4RCxLQUFLLE1BQU0sU0FBUyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUMvQixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ25ELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7d0JBQ3BDLFNBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxxRUFBcUUsRUFBRSx1RUFBdUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDak0sU0FBUztvQkFDVixDQUFDO29CQUNELElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7d0JBQ3RDLFNBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyx5REFBeUQsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3BJLFNBQVM7b0JBQ1YsQ0FBQztvQkFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUN4QyxTQUFTLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsOERBQThELEVBQUUsdURBQXVELENBQUMsQ0FBQyxDQUFDO3dCQUM3SixTQUFTO29CQUNWLENBQUM7b0JBQ0QsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDekIsQ0FBQztZQUNGLENBQUM7WUFFRCxLQUFLLE1BQU0sU0FBUyxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNqQyxLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ25ELGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzNCLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxDQUFDLHlDQUF5QyxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUM5RSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELHlDQUF5QyxDQUFDLEtBQW1DLEVBQUUsT0FBcUM7UUFDbkgsTUFBTSxjQUFjLEdBQWEsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sZ0JBQWdCLEdBQWEsRUFBRSxDQUFDO1FBRXRDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDMUIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsZUFBZSxJQUFJLENBQUMsTUFBTSx3REFBd0QsQ0FBQyxDQUFDO2dCQUMzRyxTQUFTO1lBQ1YsQ0FBQztZQUNELElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7Z0JBQzVELFNBQVM7WUFDVixDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztnQkFDaEYsU0FBUztZQUNWLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBcUM7Z0JBQ2hELE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtnQkFDbkIsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO2dCQUM3QixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7Z0JBQ2pDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUI7Z0JBQ3pDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtnQkFDZixTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTO2FBQ3BDLENBQUM7WUFDRixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pDLHVFQUF1RTtZQUN2RSxJQUFJLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQywrQkFBK0IsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDdEYsQ0FBQztRQUNGLENBQUM7UUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNuQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoQyxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlELElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLGNBQWMsRUFBRSxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUNyRixJQUFJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxNQUFNLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO29CQUN2QyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLCtCQUErQixDQUFDLGFBQXNEO1FBQ25HLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBRU8sMkJBQTJCO1FBQ2xDLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQTZCLHlDQUF5QyxnQ0FBd0IsRUFBRSxDQUFDLENBQUM7SUFDeEksQ0FBQztJQUVPLGtDQUFrQztRQUN6QyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUMxRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsMkJBQTJCLENBQUM7UUFFeEQsbURBQW1EO1FBQ25ELE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDMUMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBRXZCLGtDQUFrQztRQUNsQyxLQUFLLE1BQU0sT0FBTyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3RDLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxLQUFLLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN6RCxVQUFVLEdBQUcsSUFBSSxDQUFDO2dCQUNsQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDWCxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQseUJBQXlCO1FBQ3pCLEtBQUssTUFBTSxPQUFPLElBQUksY0FBYyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDN0MsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDbEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzVDLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ1gsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ25DLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksVUFBVSxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsb0RBQW9ELENBQUMsQ0FBQztZQUM3RSxJQUFJLENBQUMsMkJBQTJCLEdBQUcsY0FBYyxDQUFDO1lBQ2xELEtBQUssTUFBTSxNQUFNLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBQ3RDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sd0JBQXdCLENBQUMsTUFBYztRQUM5QyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ25FLE9BQU8sT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTywyQkFBMkI7UUFDbEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMseUNBQXlDLEVBQUUsSUFBSSxDQUFDLDJCQUEyQiwyREFBMkMsQ0FBQztJQUNuSixDQUFDO0lBRUQsMkJBQTJCLENBQUMsZUFBdUIsRUFBRSxpQkFBMEI7UUFDOUUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0VBQWdFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDekcsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsMkJBQTJCLENBQUMsZUFBZSxDQUFDLEdBQUcsaUJBQWlCLENBQUM7UUFDdEUsSUFBSSxpQkFBaUIsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUNsRCxPQUFPLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNwQyxDQUFDO2FBQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUN6RCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsNENBQTRDLGVBQWUsT0FBTyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7SUFDL0csQ0FBQztJQUVELFVBQVU7UUFDVCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQzthQUN2QyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbEIsT0FBTyxJQUFJLENBQUMsQ0FBQyxzQ0FBc0M7WUFDcEQsQ0FBQztZQUNELE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNELE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNyRixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxtQkFBbUI7UUFDbEIsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsZUFBdUI7UUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDcEQsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLDJCQUEyQixDQUFDLGVBQWUsQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzlFLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsMkJBQTJCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUMxRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsa0NBQWtDLENBQUMsYUFBcUI7UUFDdkQsS0FBSyxNQUFNLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUM5RCxJQUFJLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUN4QyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBZ0IsRUFBRSxNQUFlO1FBRXhFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTNDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU87UUFDUixDQUFDO1FBRUQsOERBQThEO1FBQzlELE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQywrQkFBK0IsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUV4RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUM1RSxPQUFPO1FBQ1IsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFFMUQsTUFBTSxTQUFTLEdBQThDLEVBQUUsQ0FBQztZQUNoRSxNQUFNLG9CQUFvQixHQUEyQixFQUFFLENBQUM7WUFFeEQsSUFBSSxDQUFDO2dCQUNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQy9GLElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUNuQixTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7b0JBQzFCLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO29CQUM1QixLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO3dCQUN4QixJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQzs0QkFDdEIseUZBQXlGOzRCQUN6RixJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQ0FDNUYsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQzs0QkFDckMsQ0FBQztpQ0FBTSxDQUFDO2dDQUNQLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUMsVUFBVSxrREFBa0QsQ0FBQyxDQUFDOzRCQUMvRyxDQUFDO3dCQUNGLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUNyQyxDQUFDO29CQUNGLENBQUM7b0JBQ0Qsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxDQUFDO1lBQ0YsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLG9CQUFvQixDQUFDLElBQUksQ0FBQztvQkFDekIsZ0JBQWdCLEVBQUUsRUFBRTtvQkFDcEIsTUFBTSxFQUFFO3dCQUNQLE9BQU8sRUFBRSxlQUFlLENBQUMsS0FBSyxDQUFDO3dCQUMvQixRQUFRLEVBQUUsUUFBUSxDQUFDLEtBQUs7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsbUNBQW1DLENBQUMsK0JBQStCLEVBQUUsQ0FBQztZQUMxRixNQUFNLHNCQUFzQixHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1lBQzdFLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQzVCLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDL0IsU0FBUztnQkFDVixDQUFDO2dCQUVELGlFQUFpRTtnQkFDakUsdURBQXVEO2dCQUN2RCxzRUFBc0U7Z0JBQ3RFLElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDL0MsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQ3BCLEtBQUssTUFBTSxLQUFLLElBQUksU0FBUyxFQUFFLENBQUM7NEJBQy9CLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQzs0QkFDdEQsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQ0FDakIsbUZBQW1GO2dDQUNuRixzQkFBc0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUMsQ0FBQzs0QkFDbEUsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7b0JBQ0Qsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQzNELFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUVwRixJQUFJLENBQUM7b0JBQ0osTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsNEJBQTRCLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2pJLElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUNuQixTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7d0JBQzFCLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDdkYsQ0FBQztvQkFFRCxrREFBa0Q7b0JBQ2xELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNwQixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDOzRCQUM1QixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7NEJBQ3RELElBQUksV0FBVyxFQUFFLENBQUM7Z0NBQ2pCLG1GQUFtRjtnQ0FDbkYsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsRUFBRSxHQUFHLFdBQVcsRUFBRSxDQUFDLENBQUM7NEJBQ2xFLENBQUM7d0JBQ0YsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsb0JBQW9CLENBQUMsSUFBSSxDQUFDO3dCQUN6QixLQUFLO3dCQUNMLGdCQUFnQixFQUFFLEVBQUU7d0JBQ3BCLE1BQU0sRUFBRTs0QkFDUCxPQUFPLEVBQUUsZUFBZSxDQUFDLEtBQUssQ0FBQzs0QkFDL0IsUUFBUSxFQUFFLFFBQVEsQ0FBQyxLQUFLO3lCQUN4QjtxQkFDRCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUN2RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEQsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLEtBQUssTUFBTSxLQUFLLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQy9CLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGNBQWMsS0FBSyxDQUFDLFVBQVUsbUNBQW1DLENBQUMsQ0FBQztvQkFDekYsU0FBUztnQkFDVixDQUFDO2dCQUNELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN2RCxVQUFVLEdBQUcsVUFBVSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDcEYsU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDcEMsQ0FBQztZQUNELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxRQUFRLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMxRixVQUFVLEdBQUcsVUFBVSxJQUFJLFNBQVMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBRTlDLGtEQUFrRDtZQUNsRCxJQUFJLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDekMsS0FBSyxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLHNCQUFzQixFQUFFLENBQUM7Z0JBQzNELElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDdEMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ25ELENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsaURBQWlELFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDckYsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELHNCQUFzQixDQUFDLE1BQWM7UUFDcEMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUVELEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxRQUFvQztRQUU5RCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDcEQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzRixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBRTVCLEtBQUssTUFBTSxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNqRSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsTUFBTSxDQUFDO21CQUNuRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssU0FBUyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sQ0FBQzttQkFDbkUsQ0FBQyxRQUFRLENBQUMsT0FBTyxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxPQUFPLENBQUM7bUJBQ3RFLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDN0QsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3RDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTFFLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELDZCQUE2QixDQUFDLE1BQWMsRUFBRSxRQUFvQztRQUNqRixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFckYsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN2RSxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLE1BQU0seUJBQXlCLENBQUMsQ0FBQztRQUNwRixDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXRDLElBQUksSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUNyRCxJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzVFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMvQixtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMvQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQWUsRUFBRSxJQUFxQyxFQUFFLFFBQXdCLEVBQUUsT0FBeUMsRUFBRSxLQUF3QjtRQUMxSyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLE9BQU8scUJBQXFCLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBQ0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLE9BQU8sRUFBRSxhQUFhLEVBQUUsRUFBRSxHQUFHLGFBQWEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDOUgsT0FBTyxRQUFRLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRU8sc0NBQXNDLENBQUMsT0FBZSxFQUFFLFFBQWdEO1FBQy9HLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxNQUFNLEdBQUcsUUFBUSxFQUFFLG1CQUFtQixDQUFDO1FBRTdDLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBVSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDeEMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixNQUFNLFFBQVEsR0FBK0IsRUFBRSxDQUFDO1FBQ2hELElBQUksTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQ3hCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxJQUFJLFVBQVUsQ0FBQyxPQUFPLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ3RDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxpQ0FBaUM7UUFDakMsT0FBTyxFQUFFLEdBQUcsUUFBUSxFQUFFLEdBQUcsVUFBVSxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVELGtCQUFrQixDQUFDLE9BQWUsRUFBRSxPQUE4QixFQUFFLEtBQXdCO1FBQzNGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxPQUFPLHNCQUFzQixDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLDJCQUEyQixPQUFPLHFCQUFxQixDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELHFCQUFxQixDQUFDLE9BQWU7UUFDcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsT0FBTyxJQUFJLENBQUMsc0NBQXNDLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCLENBQUMsT0FBZSxFQUFFLE1BQWtDO1FBQzlFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU87UUFDUixDQUFDO1FBRUQsa0VBQWtFO1FBQ2xFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1FBQzdGLElBQUksS0FBK0MsQ0FBQztRQUVwRCxtRUFBbUU7UUFDbkUsS0FBSyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQztRQUVyRywrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osS0FBSyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBRUQseUZBQXlGO1FBQ3pGLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BFLE1BQU0sYUFBYSxHQUFHLEVBQUUsR0FBRyxjQUFjLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUN2RCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsbUJBQW1CLENBQUM7UUFDNUMsSUFBSSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFDeEIsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDMUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDMUMsSUFBSSxVQUFVLEVBQUUsT0FBTyxLQUFLLFNBQVMsSUFBSSxVQUFVLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN2RSxPQUFPLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDM0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sZ0JBQWdCLEdBQUksS0FBSyxDQUFDLFFBQXNFLElBQUksRUFBRSxDQUFDO1lBQzdHLElBQUksZUFBOEQsQ0FBQztZQUNuRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM3QyxlQUFlLEdBQUcsRUFBRSxHQUFHLGdCQUFnQixFQUFFLENBQUM7Z0JBQzFDLE9BQU8sZUFBZSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNyQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsZUFBZSxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQztZQUN6RSxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQWlDO2dCQUNsRCxHQUFHLEtBQUs7Z0JBQ1IsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTO2FBQy9FLENBQUM7WUFDRixJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssT0FBTyxJQUFJLENBQUMsS0FBSyxVQUFVLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZKLHdEQUF3RDtnQkFDeEQsTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsaUNBQWlDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekYsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLGlDQUFpQyxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQztZQUN2RyxDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbEQsd0RBQXdEO1lBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6RSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2IsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLFFBQVEsR0FBaUM7Z0JBQzlDLElBQUksRUFBRSxNQUFNLENBQUMsV0FBVztnQkFDeEIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO2dCQUN2QixRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUU7YUFDMUMsQ0FBQztZQUNGLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLDhCQUE4QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMzQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN2RCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELDREQUE0RDtRQUM1RCxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsNEJBQTRCLENBQUMsT0FBZTtRQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvQyxNQUFNLE1BQU0sR0FBRyxRQUFRLEVBQUUsbUJBQW1CLENBQUM7UUFDN0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUN6QixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBYyxFQUFFLENBQUM7UUFDOUIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFbkUsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDbkUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN6RCxTQUFTO1lBQ1YsQ0FBQztZQUNELE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDO1lBQzlELE1BQU0sS0FBSyxHQUFHLENBQUMsT0FBTyxVQUFVLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO21CQUMvRSxHQUFHLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQztxQkFDeEMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUM7WUFDeEMsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLGNBQWMsQ0FBQztZQUNqRCxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNyRCxNQUFNLFdBQVcsR0FBYyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQWMsRUFBRSxLQUFhLEVBQUUsRUFBRTtnQkFDcEYsTUFBTSxTQUFTLEdBQUcsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLFlBQVksR0FBRyxLQUFLLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0JBQ3JILE1BQU0sT0FBTyxHQUFHLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNoRCxPQUFPO29CQUNOLEVBQUUsRUFBRSxrQkFBa0IsR0FBRyxJQUFJLEtBQUssRUFBRTtvQkFDcEMsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLEtBQUssRUFBRSxTQUFTO29CQUNoQixPQUFPLEVBQUUsSUFBSTtvQkFDYixPQUFPO29CQUNQLE9BQU8sRUFBRSxZQUFZLEtBQUssS0FBSztvQkFDL0IsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDO2lCQUNoRSxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFDSCxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksYUFBYSxDQUFDLGtCQUFrQixHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxRQUFnQixFQUFFLGlCQUEwQjtRQUV0RixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsVUFBVSxRQUFRLGFBQWEsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFFRCxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzlCLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0QsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1FBQy9HLE1BQU0sUUFBUSxHQUFHLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssaUJBQWlCLENBQUMsQ0FBQztRQUU5RyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsMkJBQTJCLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUV0SCxJQUFJLENBQUM7WUFDSixNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGFBQWEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDOUksSUFBSSxNQUFNLENBQUMsYUFBYSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQzVDLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSwwQkFBMEIsR0FBRyxNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDdEksTUFBTSxLQUFLLEdBQUcsUUFBUTtnQkFDckIsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLGlDQUFpQyxDQUFDLFFBQVEsRUFBRSwwQkFBMEIsQ0FBQztnQkFDeEgsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLDhCQUE4QixDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFFN0csSUFBSSxNQUFNLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDM0UsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHNDQUFzQyxDQUFDLGFBQWEsSUFBSSxFQUFFLEVBQUUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUN2RyxNQUFNLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNuRyxDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBSSxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNoQyxPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQWU7UUFDbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ2hELE9BQU87UUFDUixDQUFDO1FBRUQsMENBQTBDO1FBQzFDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3RCxJQUFJLEtBQStDLENBQUM7UUFDcEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNsQixLQUFLLE1BQU0sRUFBRSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUMvQixJQUFJLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN2RCxLQUFLLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQztvQkFDakIsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxrRUFBa0U7UUFDbEUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3pFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDYixPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUM7WUFDckMsTUFBTSxRQUFRLEdBQWlDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQzdILEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNoRyxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCwwREFBMEQ7UUFDMUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDOUYsTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsdUJBQXVCLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUM1RixDQUFDO0lBRU8sNkJBQTZCLENBQUMsT0FBZSxFQUFFLE1BQXlDO1FBQy9GLE1BQU0sVUFBVSxHQUFhLEVBQUUsQ0FBQztRQUNoQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN2QixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDbkUsSUFBSSxVQUFVLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDckMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUNoRixRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlFLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztxQkFBTSxJQUFJLFVBQVUsQ0FBQyxPQUFPLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQzdDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUNoRCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDekMsQ0FBQyxDQUFDLE1BQU0sVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUztZQUN2QyxDQUFDLENBQUMsb0JBQW9CLENBQUM7UUFDeEIsT0FBTyx1QkFBdUIsT0FBTyxNQUFNLFlBQVksT0FBTyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxLQUFLLENBQUMsOEJBQThCLENBQUMsSUFBWSxFQUFFLFFBQWdCLEVBQUUsYUFBcUQ7UUFDekgsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsUUFBUSxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBRUQsTUFBTSwwQkFBMEIsR0FBRyxNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDdEksTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsOEJBQThCLENBQUMsMEJBQTBCLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBRUQsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLFFBQWdCLEVBQUUsaUJBQXlCO1FBQ2xGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLFFBQVEsYUFBYSxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUVELE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLCtCQUErQixFQUFFLENBQUM7UUFDL0csTUFBTSxRQUFRLEdBQUcsMkJBQTJCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxpQkFBaUIsQ0FBQyxDQUFDO1FBRTlHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLGlCQUFpQixlQUFlLFFBQVEsYUFBYSxDQUFDLENBQUM7UUFDekcsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDekUsTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsaUNBQWlDLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUYsQ0FBQztJQUVPLGtCQUFrQixDQUFDLE1BQW1CO1FBQzdDLElBQUksTUFBTSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDakMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxLQUFLLE1BQU0sUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDdkQsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDN0QsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLHNDQUFzQyxDQUFDLGFBQXlDLEVBQUUsTUFBbUI7UUFDNUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsS0FBSyxNQUFNLFFBQVEsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ3ZELElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMzQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNuRCxJQUFJLGNBQWMsSUFBSSxPQUFPLGNBQWMsS0FBSyxTQUFTLElBQUksY0FBYyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xHLE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xELElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDNUUsNkZBQTZGO29CQUM3RixRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlFLE9BQU8sSUFBSSxRQUFRLE1BQU0sUUFBUSxFQUFFLENBQUM7Z0JBQ3JDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLDJCQUFvRSxFQUFFLE1BQWtDLEVBQUUsUUFBa0Q7UUFDdkwsSUFBSSxpQkFBaUIsR0FBRyxRQUFRLEVBQUUsSUFBSSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hCLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUM7WUFDdkMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsT0FBTywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7Z0JBQzFHLEtBQUssRUFBRSxDQUFDO2dCQUNSLGlCQUFpQixHQUFHLEdBQUcsTUFBTSxDQUFDLFdBQVcsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN0RCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBMEIsQ0FBQztRQUMvQixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxPQUFPLENBQU8sT0FBTyxDQUFDLEVBQUU7Z0JBQ2pDLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7Z0JBQzNFLFFBQVEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLDZCQUE2QixFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUN2RSxRQUFRLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO2dCQUN4RixRQUFRLENBQUMsS0FBSyxHQUFHLGlCQUFpQixDQUFDO2dCQUNuQyxRQUFRLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztnQkFFL0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQ2pELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzt3QkFDWixRQUFRLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO3dCQUMxRSxRQUFRLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7d0JBQ25DLE9BQU87b0JBQ1IsQ0FBQztvQkFDRCxJQUFJLENBQUMsUUFBUSxJQUFJLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQzt3QkFDMUUsUUFBUSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsdURBQXVELENBQUMsQ0FBQzt3QkFDN0csUUFBUSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO3dCQUNuQyxPQUFPO29CQUNSLENBQUM7b0JBQ0QsUUFBUSxDQUFDLGlCQUFpQixHQUFHLFNBQVMsQ0FBQztvQkFDdkMsUUFBUSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNKLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxLQUFLLElBQUksRUFBRTtvQkFDL0MsTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7b0JBQ3hCLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDakIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNyRCxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO2dCQUFTLENBQUM7WUFDVixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdkIsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxTQUFpQixFQUFFLGFBQTBCLEVBQUUsUUFBZ0Q7UUFDbkksSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUMvQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUErQixRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRTNFLEtBQUssTUFBTSxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUM5RCxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzFELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM5RCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2pHLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUN6QixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFpQixFQUFFLFFBQWdCLEVBQUUsY0FBdUMsRUFBRSxRQUFpQixFQUFFLFFBQWdEO1FBQzdLLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ2hELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLGNBQWMsQ0FBQyxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xJLE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3JGLElBQUksYUFBYSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNqQyxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsT0FBTyxhQUFhLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDakcsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDekIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLG9CQUFvQixDQUFDLGNBQXVDO1FBQ25FLElBQUksQ0FBQyxjQUFjLElBQUksT0FBTyxjQUFjLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDNUQsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxjQUFjLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNsSSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssU0FBUyxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDcEosT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFpQixFQUFFLFFBQWdCLEVBQUUsY0FBMkI7UUFDNUYsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hHLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4QyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQztZQUNKLE9BQU8sTUFBTSxJQUFJLE9BQU8sQ0FBdUIsT0FBTyxDQUFDLEVBQUU7Z0JBQ3hELE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzdFLFNBQVMsQ0FBQyxLQUFLLEdBQUcsR0FBRyxTQUFTLEtBQUssY0FBYyxDQUFDLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDdEUsU0FBUyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELFNBQVMsQ0FBQyxXQUFXLEdBQUcsY0FBYyxDQUFDLFdBQVcsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLHNCQUFzQixFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUNoSCxTQUFTLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztnQkFDL0IsU0FBUyxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7Z0JBRWhDLFdBQVcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUU7b0JBQzFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osV0FBVyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRTtvQkFDeEMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNKLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNsQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7Z0JBQVMsQ0FBQztZQUNWLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN2QixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjLENBQUMsU0FBaUIsRUFBRSxRQUFnQixFQUFFLGNBQTJCLEVBQUUsUUFBaUIsRUFBRSxRQUFnRDtRQUNqSyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQztZQUNKLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQXFCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUN2RSxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRSxRQUFRLENBQUMsS0FBSyxHQUFHLEdBQUcsU0FBUyxLQUFLLGNBQWMsQ0FBQyxLQUFLLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ3JFLFFBQVEsQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDL0UsUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztnQkFDNUMsUUFBUSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7Z0JBQy9CLElBQUksUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDMUIsUUFBUSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDL0MsQ0FBQztxQkFBTSxJQUFJLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDbkMsUUFBUSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNqRCxDQUFDO2dCQUNELElBQUksY0FBYyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUNoQyxRQUFRLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUM7Z0JBQzlDLENBQUM7Z0JBRUQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQ2pELElBQUksQ0FBQyxLQUFLLElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ3hCLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLG1CQUFtQixDQUFDLENBQUM7d0JBQzVFLFFBQVEsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQzt3QkFDbkMsT0FBTztvQkFDUixDQUFDO29CQUNELElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDM0UsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQzs0QkFDMUIsUUFBUSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDOzRCQUNqRixRQUFRLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7NEJBQ25DLE9BQU87d0JBQ1IsQ0FBQztvQkFDRixDQUFDO29CQUNELElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDdkMsSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJLEtBQUssS0FBSyxPQUFPLEVBQUUsQ0FBQzs0QkFDM0MsUUFBUSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDOzRCQUN2RixRQUFRLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7NEJBQ25DLE9BQU87d0JBQ1IsQ0FBQztvQkFDRixDQUFDO29CQUNELFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7b0JBQ3ZDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztnQkFDckMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFSixXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFO29CQUN6QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQzt3QkFDakMsUUFBUSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxlQUFlLEVBQUUsbUJBQW1CLENBQUMsQ0FBQzt3QkFDNUUsUUFBUSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO3dCQUNuQyxPQUFPO29CQUNSLENBQUM7b0JBQ0QsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDeEIsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNqQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVKLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO29CQUN4QyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssb0JBQW9CLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQy9DLE1BQU0sQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztvQkFDakMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDcEIsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVKLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixPQUFPLFNBQVMsQ0FBQyxDQUFDLGlCQUFpQjtZQUNwQyxDQUFDO1lBRUQsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMzRSxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QixDQUFDO2lCQUFNLElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDOUMsT0FBTyxLQUFLLEtBQUssTUFBTSxDQUFDO1lBQ3pCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7UUFFRixDQUFDO2dCQUFTLENBQUM7WUFDVixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdkIsQ0FBQztJQUNGLENBQUM7SUFFTyxlQUFlLENBQUMsUUFBZ0I7UUFDdkMsT0FBTyxNQUFNLENBQUMsdUJBQXFCLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTyxlQUFlLENBQUMsV0FBb0I7UUFDM0MsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQzVCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLFdBQVcsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRU8sZ0JBQWdCLENBQUMsTUFBYztRQUN0QyxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBc0MsQ0FBQztRQUM5RCxLQUFLLE1BQU0sQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1lBQ3RELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVPLHlCQUF5QixDQUFDLE1BQWM7UUFDL0MsS0FBSyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDOUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEtBQUssTUFBTSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLHFCQUFxQixDQUFDLEtBQW1DLEVBQUUsTUFBK0I7UUFDdkcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQStCLEVBQUUsQ0FBQztRQUM5QyxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3pCLElBQUksR0FBRyxLQUFLLFFBQVEsSUFBSSxHQUFHLEtBQUssTUFBTSxJQUFJLEdBQUcsS0FBSyxPQUFPLElBQUksR0FBRyxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUNqRixTQUFTO1lBQ1YsQ0FBQztZQUNELElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN2QixJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUMsS0FBSyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDakYsQ0FBQztZQUNELE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDckIsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFZLEVBQUUsTUFBYyxFQUFFLGFBQXFELEVBQUUsTUFBK0I7UUFDcEssSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUN6QixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQStCLEVBQUUsQ0FBQztRQUM5QyxLQUFLLE1BQU0sR0FBRyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2pDLElBQUksS0FBSyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMvQixJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELE1BQU0sU0FBUyxHQUFHLEdBQUcsdUJBQXFCLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ25HLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3ZELEtBQUssR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFFTyxLQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBbUMsRUFBRSxNQUErQjtRQUMvRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLGFBQWEsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUN4RCxLQUFLLE1BQU0sR0FBRyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN6QixJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3BELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsa0NBQWtDLENBQUMsMkJBQXlEO1FBQ2pHLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsYUFBYSxFQUFFLEdBQUcsMkJBQTJCLENBQUM7UUFDdkUsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLE1BQU0sYUFBYSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQywrQkFBK0IsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxNQUFNLHFCQUFxQixDQUFDLENBQUM7UUFDaEYsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xJLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7WUFDNUIsTUFBTSxhQUFhLEdBQUcsR0FBRyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2RCxJQUFJLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxhQUFhLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDM0QsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFDRCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUVuQyxNQUFNLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRCw4QkFBOEI7SUFFdEIsdUJBQXVCO1FBQzlCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQVcsb0NBQW9DLGdDQUF3QixFQUFFLENBQUMsQ0FBQztJQUNqSCxDQUFDO0lBRU8sdUJBQXVCO1FBQzlCLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLElBQUksQ0FBQyxxQkFBcUIsMkRBQTJDLENBQUM7SUFDeEksQ0FBQztJQUVELHVCQUF1QjtRQUN0Qiw4REFBOEQ7UUFDOUQsT0FBTyxJQUFJLENBQUMscUJBQXFCO2FBQy9CLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxjQUFjLENBQUM7YUFDL0QsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNmLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxlQUF1QjtRQUM1QyxJQUFJLGVBQWUsS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUN4QyxPQUFPO1FBQ1IsQ0FBQztRQUVELCtDQUErQztRQUMvQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELGVBQWU7UUFDZixJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3BELG9EQUFvRDtRQUNwRCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDNUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDeEMsQ0FBQztRQUNELElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxxQkFBcUI7UUFDcEIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLEVBQUUsQ0FBQztRQUNoQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsWUFBWTtJQUVaLGlDQUFpQztJQUVqQyx3QkFBd0I7UUFDdkIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUM7SUFDcEMsQ0FBQztJQUVPLHlCQUF5QixDQUFDLFFBQXdDO1FBQ3pFLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxRQUFRLENBQUM7UUFDMUMsSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUVPLDZCQUE2QjtRQUNwQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUM7UUFDaEQsTUFBTSxJQUFJLEdBQTBDLEVBQUUsQ0FBQztRQUN2RCxNQUFNLElBQUksR0FBMEMsRUFBRSxDQUFDO1FBRXZELElBQUksUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3BCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRyxLQUFLLE1BQU0sS0FBSyxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN4SCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3BCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRyxLQUFLLE1BQU0sS0FBSyxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDbEssQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDN0MsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRUQsMkJBQTJCO0lBQ25CLG9CQUFvQjtRQUMzQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQUM7UUFDcEUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMzQixPQUFPO1FBQ1IsQ0FBQztRQUVELDRDQUE0QztRQUM1QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsb0NBQTJCLENBQUM7UUFDM0csSUFBSSxDQUFDO1lBQ0osSUFBSSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLDBDQUEwQyxvQ0FBMkIsQ0FBQztRQUNuRyxDQUFDO1FBRUQsK0NBQStDO1FBQy9DLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLCtCQUErQixvQ0FBMkIsQ0FBQztRQUN0RyxJQUFJLENBQUM7WUFDSixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsQ0FBQztZQUM3QyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEMsQ0FBQztRQUNGLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsK0JBQStCLG9DQUEyQixDQUFDO1FBQ3hGLENBQUM7UUFFRCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRU8sdUJBQXVCO1FBQzlCLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMscUJBQXFCLEVBQUU7YUFDMUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDN0UsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsa0JBQWtCO2FBQ3JELElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCO1FBQ2xDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVyRixJQUFJLE9BQU8sQ0FBQztRQUNaLElBQUksQ0FBQztZQUNKLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLGVBQWdCLEVBQUUsUUFBUSxFQUFFLHFDQUFxQyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEssQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsRUFBRSxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN4RixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMscURBQXFELE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUNyRyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksTUFBbUMsQ0FBQztRQUN4QyxJQUFJLENBQUM7WUFDSixNQUFNLEdBQUcsTUFBTSxNQUFNLENBQXVCLE9BQU8sQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUUsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDMUYsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJHLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEYsT0FBTztRQUNSLENBQUM7UUFFRCxzQ0FBc0M7UUFDdEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLDBCQUEwQixDQUFDO1FBQ25ELElBQUksQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLG1FQUFrRCxDQUFDO1FBRWxKLGlDQUFpQztRQUNqQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQ3RMLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLG1FQUFrRCxDQUFDO1FBQzdJLENBQUM7SUFDRixDQUFDO0lBRUQsWUFBWTtJQUVaLE9BQU87UUFDTixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN6QixDQUFDOztBQXZ3Q1cscUJBQXFCO0lBd0MvQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUNBQW1DLENBQUE7SUFDbkMsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxlQUFlLENBQUE7R0FoREwscUJBQXFCLENBeXdDakMifQ==