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
var MainThreadLanguageFeatures_1;
import { createStringDataTransferItem, VSDataTransfer } from '../../../base/common/dataTransfer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { HierarchicalKind } from '../../../base/common/hierarchicalKind.js';
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { mixin } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import * as languages from '../../../editor/common/languages.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../editor/common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { decodeSemanticTokensDto } from '../../../editor/common/services/semanticTokensDto.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { reviveWorkspaceEditDto } from './mainThreadBulkEdits.js';
import * as typeConvert from '../common/extHostTypeConverters.js';
import { DataTransferFileCache } from '../common/shared/dataTransferCache.js';
import * as callh from '../../contrib/callHierarchy/common/callHierarchy.js';
import * as search from '../../contrib/search/common/search.js';
import * as typeh from '../../contrib/typeHierarchy/common/typeHierarchy.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { InlineCompletionEndOfLifeReasonKind } from '../common/extHostTypes.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from '../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { IAiEditTelemetryService } from '../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { EditDeltaInfo } from '../../../editor/common/textModelEditSource.js';
import { IInlineCompletionsUnificationService } from '../../services/inlineCompletions/common/inlineCompletionsUnification.js';
import { sendInlineCompletionsEndOfLifeTelemetry } from '../../../editor/contrib/inlineCompletions/browser/telemetry.js';
let MainThreadLanguageFeatures = MainThreadLanguageFeatures_1 = class MainThreadLanguageFeatures extends Disposable {
    constructor(extHostContext, _languageService, _languageConfigurationService, _languageFeaturesService, _uriIdentService, _instantiationService, _inlineCompletionsUnificationService) {
        super();
        this._languageService = _languageService;
        this._languageConfigurationService = _languageConfigurationService;
        this._languageFeaturesService = _languageFeaturesService;
        this._uriIdentService = _uriIdentService;
        this._instantiationService = _instantiationService;
        this._inlineCompletionsUnificationService = _inlineCompletionsUnificationService;
        this._registrations = this._register(new DisposableMap());
        // --- copy paste action provider
        this._pasteEditProviders = new Map();
        // --- document drop Edits
        this._documentOnDropEditProviders = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageFeatures);
        if (this._languageService) {
            const updateAllWordDefinitions = () => {
                const wordDefinitionDtos = [];
                for (const languageId of _languageService.getRegisteredLanguageIds()) {
                    const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(languageId).getWordDefinition();
                    wordDefinitionDtos.push({
                        languageId: languageId,
                        regexSource: wordDefinition.source,
                        regexFlags: wordDefinition.flags
                    });
                }
                this._proxy.$setWordDefinitions(wordDefinitionDtos);
            };
            this._register(this._languageConfigurationService.onDidChange((e) => {
                if (!e.languageId) {
                    updateAllWordDefinitions();
                }
                else {
                    const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(e.languageId).getWordDefinition();
                    this._proxy.$setWordDefinitions([{
                            languageId: e.languageId,
                            regexSource: wordDefinition.source,
                            regexFlags: wordDefinition.flags
                        }]);
                }
            }));
            updateAllWordDefinitions();
        }
        if (this._inlineCompletionsUnificationService) {
            this._register(this._inlineCompletionsUnificationService.onDidStateChange(() => {
                this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
            }));
            this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
        }
    }
    $unregister(handle) {
        this._registrations.deleteAndDispose(handle);
    }
    static _reviveLocationDto(data) {
        if (!data) {
            return data;
        }
        else if (Array.isArray(data)) {
            data.forEach(l => MainThreadLanguageFeatures_1._reviveLocationDto(l));
            return data;
        }
        else {
            data.uri = URI.revive(data.uri);
            return data;
        }
    }
    static _reviveLocationLinkDto(data) {
        if (!data) {
            return data;
        }
        else if (Array.isArray(data)) {
            data.forEach(l => MainThreadLanguageFeatures_1._reviveLocationLinkDto(l));
            return data;
        }
        else {
            data.uri = URI.revive(data.uri);
            return data;
        }
    }
    static _reviveWorkspaceSymbolDto(data) {
        if (!data) {
            return data;
        }
        else if (Array.isArray(data)) {
            data.forEach(MainThreadLanguageFeatures_1._reviveWorkspaceSymbolDto);
            return data;
        }
        else {
            data.location = MainThreadLanguageFeatures_1._reviveLocationDto(data.location);
            return data;
        }
    }
    static _reviveCodeActionDto(data, uriIdentService) {
        data?.forEach(code => reviveWorkspaceEditDto(code.edit, uriIdentService));
        return data;
    }
    static _reviveLinkDTO(data) {
        if (data.url && typeof data.url !== 'string') {
            data.url = URI.revive(data.url);
        }
        return data;
    }
    static _reviveCallHierarchyItemDto(data) {
        if (data) {
            data.uri = URI.revive(data.uri);
        }
        return data;
    }
    static _reviveTypeHierarchyItemDto(data) {
        if (data) {
            data.uri = URI.revive(data.uri);
        }
        return data;
    }
    //#endregion
    // --- outline
    $registerDocumentSymbolProvider(handle, selector, displayName) {
        this._registrations.set(handle, this._languageFeaturesService.documentSymbolProvider.register(selector, {
            displayName,
            provideDocumentSymbols: (model, token) => {
                return this._proxy.$provideDocumentSymbols(handle, model.uri, token);
            }
        }));
    }
    // --- code lens
    $registerCodeLensSupport(handle, selector, eventHandle) {
        const provider = {
            provideCodeLenses: async (model, token) => {
                const listDto = await this._proxy.$provideCodeLenses(handle, model.uri, token);
                if (!listDto) {
                    return undefined;
                }
                return {
                    lenses: listDto.lenses,
                    dispose: () => listDto.cacheId && this._proxy.$releaseCodeLenses(handle, listDto.cacheId)
                };
            },
            resolveCodeLens: async (model, codeLens, token) => {
                const result = await this._proxy.$resolveCodeLens(handle, codeLens, token);
                if (!result || token.isCancellationRequested) {
                    return undefined;
                }
                return {
                    ...result,
                    range: model.validateRange(result.range),
                };
            }
        };
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            provider.onDidChange = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.codeLensProvider.register(selector, provider));
    }
    $emitCodeLensEvent(eventHandle, event) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }
    // --- declaration
    $registerDefinitionSupport(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.definitionProvider.register(selector, {
            provideDefinition: (model, position, token) => {
                return this._proxy.$provideDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures_1._reviveLocationLinkDto);
            }
        }));
    }
    $registerDeclarationSupport(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.declarationProvider.register(selector, {
            provideDeclaration: (model, position, token) => {
                return this._proxy.$provideDeclaration(handle, model.uri, position, token).then(MainThreadLanguageFeatures_1._reviveLocationLinkDto);
            }
        }));
    }
    $registerImplementationSupport(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.implementationProvider.register(selector, {
            provideImplementation: (model, position, token) => {
                return this._proxy.$provideImplementation(handle, model.uri, position, token).then(MainThreadLanguageFeatures_1._reviveLocationLinkDto);
            }
        }));
    }
    $registerTypeDefinitionSupport(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.typeDefinitionProvider.register(selector, {
            provideTypeDefinition: (model, position, token) => {
                return this._proxy.$provideTypeDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures_1._reviveLocationLinkDto);
            }
        }));
    }
    // --- extra info
    $registerHoverProvider(handle, selector) {
        /*
        const hoverFinalizationRegistry = new FinalizationRegistry((hoverId: number) => {
            this._proxy.$releaseHover(handle, hoverId);
        });
        */
        this._registrations.set(handle, this._languageFeaturesService.hoverProvider.register(selector, {
            provideHover: async (model, position, token, context) => {
                const serializedContext = {
                    verbosityRequest: context?.verbosityRequest ? {
                        verbosityDelta: context.verbosityRequest.verbosityDelta,
                        previousHover: { id: context.verbosityRequest.previousHover.id }
                    } : undefined,
                };
                const hover = await this._proxy.$provideHover(handle, model.uri, position, serializedContext, token);
                // hoverFinalizationRegistry.register(hover, hover.id);
                return hover;
            }
        }));
    }
    // --- debug hover
    $registerEvaluatableExpressionProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.evaluatableExpressionProvider.register(selector, {
            provideEvaluatableExpression: (model, position, token) => {
                return this._proxy.$provideEvaluatableExpression(handle, model.uri, position, token);
            }
        }));
    }
    // --- inline values
    $registerInlineValuesProvider(handle, selector, eventHandle) {
        const provider = {
            provideInlineValues: (model, viewPort, context, token) => {
                return this._proxy.$provideInlineValues(handle, model.uri, viewPort, context, token);
            }
        };
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            provider.onDidChangeInlineValues = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.inlineValuesProvider.register(selector, provider));
    }
    $emitInlineValuesEvent(eventHandle, event) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }
    // --- occurrences
    $registerDocumentHighlightProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.documentHighlightProvider.register(selector, {
            provideDocumentHighlights: (model, position, token) => {
                return this._proxy.$provideDocumentHighlights(handle, model.uri, position, token);
            }
        }));
    }
    $registerMultiDocumentHighlightProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.multiDocumentHighlightProvider.register(selector, {
            selector: selector,
            provideMultiDocumentHighlights: (model, position, otherModels, token) => {
                return this._proxy.$provideMultiDocumentHighlights(handle, model.uri, position, otherModels.map(model => model.uri), token).then(dto => {
                    // dto should be non-null + non-undefined
                    // dto length of 0 is valid, just no highlights, pass this through.
                    if (dto === undefined || dto === null) {
                        return undefined;
                    }
                    const result = new ResourceMap();
                    dto?.forEach(value => {
                        // check if the URI exists already, if so, combine the highlights, otherwise create a new entry
                        const uri = URI.revive(value.uri);
                        if (result.has(uri)) {
                            result.get(uri).push(...value.highlights);
                        }
                        else {
                            result.set(uri, value.highlights);
                        }
                    });
                    return result;
                });
            }
        }));
    }
    // --- linked editing
    $registerLinkedEditingRangeProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.linkedEditingRangeProvider.register(selector, {
            provideLinkedEditingRanges: async (model, position, token) => {
                const res = await this._proxy.$provideLinkedEditingRanges(handle, model.uri, position, token);
                if (res) {
                    return {
                        ranges: res.ranges,
                        wordPattern: res.wordPattern ? MainThreadLanguageFeatures_1._reviveRegExp(res.wordPattern) : undefined
                    };
                }
                return undefined;
            }
        }));
    }
    // --- references
    $registerReferenceSupport(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.referenceProvider.register(selector, {
            provideReferences: (model, position, context, token) => {
                return this._proxy.$provideReferences(handle, model.uri, position, context, token).then(MainThreadLanguageFeatures_1._reviveLocationDto);
            }
        }));
    }
    // --- code actions
    $registerCodeActionSupport(handle, selector, metadata, displayName, extensionId, supportsResolve) {
        const provider = {
            provideCodeActions: async (model, rangeOrSelection, context, token) => {
                const listDto = await this._proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, context, token);
                if (!listDto) {
                    return undefined;
                }
                return {
                    actions: MainThreadLanguageFeatures_1._reviveCodeActionDto(listDto.actions, this._uriIdentService),
                    dispose: () => {
                        if (typeof listDto.cacheId === 'number') {
                            this._proxy.$releaseCodeActions(handle, listDto.cacheId);
                        }
                    }
                };
            },
            providedCodeActionKinds: metadata.providedKinds,
            documentation: metadata.documentation,
            displayName,
            extensionId,
        };
        if (supportsResolve) {
            provider.resolveCodeAction = async (codeAction, token) => {
                const resolved = await this._proxy.$resolveCodeAction(handle, codeAction.cacheId, token);
                if (resolved.edit) {
                    codeAction.edit = reviveWorkspaceEditDto(resolved.edit, this._uriIdentService);
                }
                if (resolved.command) {
                    codeAction.command = resolved.command;
                }
                return codeAction;
            };
        }
        this._registrations.set(handle, this._languageFeaturesService.codeActionProvider.register(selector, provider));
    }
    $registerPasteEditProvider(handle, selector, metadata) {
        const provider = new MainThreadPasteEditProvider(handle, this._proxy, metadata, this._uriIdentService);
        this._pasteEditProviders.set(handle, provider);
        this._registrations.set(handle, combinedDisposable(this._languageFeaturesService.documentPasteEditProvider.register(selector, provider), toDisposable(() => this._pasteEditProviders.delete(handle))));
    }
    $resolvePasteFileData(handle, requestId, dataId) {
        const provider = this._pasteEditProviders.get(handle);
        if (!provider) {
            throw new Error('Could not find provider');
        }
        return provider.resolveFileData(requestId, dataId);
    }
    // --- formatting
    $registerDocumentFormattingSupport(handle, selector, extensionId, displayName) {
        this._registrations.set(handle, this._languageFeaturesService.documentFormattingEditProvider.register(selector, {
            extensionId,
            displayName,
            provideDocumentFormattingEdits: (model, options, token) => {
                return this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
            }
        }));
    }
    $registerRangeFormattingSupport(handle, selector, extensionId, displayName, supportsRanges) {
        this._registrations.set(handle, this._languageFeaturesService.documentRangeFormattingEditProvider.register(selector, {
            extensionId,
            displayName,
            provideDocumentRangeFormattingEdits: (model, range, options, token) => {
                return this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
            },
            provideDocumentRangesFormattingEdits: !supportsRanges
                ? undefined
                : (model, ranges, options, token) => {
                    return this._proxy.$provideDocumentRangesFormattingEdits(handle, model.uri, ranges, options, token);
                },
        }));
    }
    $registerOnTypeFormattingSupport(handle, selector, autoFormatTriggerCharacters, extensionId) {
        this._registrations.set(handle, this._languageFeaturesService.onTypeFormattingEditProvider.register(selector, {
            extensionId,
            autoFormatTriggerCharacters,
            provideOnTypeFormattingEdits: (model, position, ch, options, token) => {
                return this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
            }
        }));
    }
    // --- navigate type
    $registerNavigateTypeSupport(handle, supportsResolve) {
        let lastResultId;
        const provider = {
            provideWorkspaceSymbols: async (search, token) => {
                const result = await this._proxy.$provideWorkspaceSymbols(handle, search, token);
                if (lastResultId !== undefined) {
                    this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
                }
                lastResultId = result.cacheId;
                return MainThreadLanguageFeatures_1._reviveWorkspaceSymbolDto(result.symbols);
            }
        };
        if (supportsResolve) {
            provider.resolveWorkspaceSymbol = async (item, token) => {
                const resolvedItem = await this._proxy.$resolveWorkspaceSymbol(handle, item, token);
                return resolvedItem && MainThreadLanguageFeatures_1._reviveWorkspaceSymbolDto(resolvedItem);
            };
        }
        this._registrations.set(handle, search.WorkspaceSymbolProviderRegistry.register(provider));
    }
    // --- rename
    $registerRenameSupport(handle, selector, supportResolveLocation) {
        this._registrations.set(handle, this._languageFeaturesService.renameProvider.register(selector, {
            provideRenameEdits: (model, position, newName, token) => {
                return this._proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then(data => reviveWorkspaceEditDto(data, this._uriIdentService));
            },
            resolveRenameLocation: supportResolveLocation
                ? (model, position, token) => this._proxy.$resolveRenameLocation(handle, model.uri, position, token)
                : undefined
        }));
    }
    $registerNewSymbolNamesProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.newSymbolNamesProvider.register(selector, {
            supportsAutomaticNewSymbolNamesTriggerKind: this._proxy.$supportsAutomaticNewSymbolNamesTriggerKind(handle),
            provideNewSymbolNames: (model, range, triggerKind, token) => {
                return this._proxy.$provideNewSymbolNames(handle, model.uri, range, triggerKind, token);
            }
        }));
    }
    // --- semantic tokens
    $registerDocumentSemanticTokensProvider(handle, selector, legend, eventHandle) {
        let event = undefined;
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            event = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.documentSemanticTokensProvider.register(selector, new MainThreadDocumentSemanticTokensProvider(this._proxy, handle, legend, event)));
    }
    $emitDocumentSemanticTokensEvent(eventHandle) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(undefined);
        }
    }
    $emitDocumentRangeSemanticTokensEvent(eventHandle) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(undefined);
        }
    }
    $registerDocumentRangeSemanticTokensProvider(handle, selector, legend, eventHandle) {
        let event = undefined;
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            event = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.documentRangeSemanticTokensProvider.register(selector, new MainThreadDocumentRangeSemanticTokensProvider(this._proxy, handle, legend, event)));
    }
    // --- suggest
    static _inflateSuggestDto(defaultRange, data, extensionId) {
        const label = data["a" /* ISuggestDataDtoField.label */];
        const commandId = data["o" /* ISuggestDataDtoField.commandId */];
        const commandIdent = data["n" /* ISuggestDataDtoField.commandIdent */];
        const commitChars = data["k" /* ISuggestDataDtoField.commitCharacters */];
        let command;
        if (commandId) {
            command = {
                $ident: commandIdent,
                id: commandId,
                title: '',
                arguments: commandIdent ? [commandIdent] : data["p" /* ISuggestDataDtoField.commandArguments */], // Automatically fill in ident as first argument
            };
        }
        return {
            label,
            extensionId,
            kind: data["b" /* ISuggestDataDtoField.kind */] ?? 9 /* languages.CompletionItemKind.Property */,
            tags: data["m" /* ISuggestDataDtoField.kindModifier */],
            detail: data["c" /* ISuggestDataDtoField.detail */],
            documentation: data["d" /* ISuggestDataDtoField.documentation */],
            sortText: data["e" /* ISuggestDataDtoField.sortText */],
            filterText: data["f" /* ISuggestDataDtoField.filterText */],
            preselect: data["g" /* ISuggestDataDtoField.preselect */],
            insertText: data["h" /* ISuggestDataDtoField.insertText */] ?? (typeof label === 'string' ? label : label.label),
            range: data["j" /* ISuggestDataDtoField.range */] ?? defaultRange,
            insertTextRules: data["i" /* ISuggestDataDtoField.insertTextRules */],
            commitCharacters: commitChars ? Array.from(commitChars) : undefined,
            additionalTextEdits: data["l" /* ISuggestDataDtoField.additionalTextEdits */],
            command,
            // not-standard
            _id: data.x,
        };
    }
    $registerCompletionsProvider(handle, selector, triggerCharacters, supportsResolveDetails, extensionId) {
        const provider = {
            triggerCharacters,
            _debugDisplayName: `${extensionId.value}(${triggerCharacters.join('')})`,
            provideCompletionItems: async (model, position, context, token) => {
                const result = await this._proxy.$provideCompletionItems(handle, model.uri, position, context, token);
                if (!result) {
                    return result;
                }
                return {
                    suggestions: result["b" /* ISuggestResultDtoField.completions */].map(d => MainThreadLanguageFeatures_1._inflateSuggestDto(result["a" /* ISuggestResultDtoField.defaultRanges */], d, extensionId)),
                    incomplete: result["c" /* ISuggestResultDtoField.isIncomplete */] || false,
                    duration: result["d" /* ISuggestResultDtoField.duration */],
                    dispose: () => {
                        if (typeof result.x === 'number') {
                            this._proxy.$releaseCompletionItems(handle, result.x);
                        }
                    }
                };
            }
        };
        if (supportsResolveDetails) {
            provider.resolveCompletionItem = (suggestion, token) => {
                return this._proxy.$resolveCompletionItem(handle, suggestion._id, token).then(result => {
                    if (!result) {
                        return suggestion;
                    }
                    const newSuggestion = MainThreadLanguageFeatures_1._inflateSuggestDto(suggestion.range, result, extensionId);
                    return mixin(suggestion, newSuggestion, true);
                });
            };
        }
        this._registrations.set(handle, this._languageFeaturesService.completionProvider.register(selector, provider));
    }
    $registerInlineCompletionsSupport(handle, selector, supportsHandleEvents, extensionId, extensionVersion, groupId, yieldsToExtensionIds, displayName, debounceDelayMs, excludesExtensionIds, supportsOnDidChange, supportsSetModelId, initialModelInfo, supportsOnDidChangeModelInfo, supportsSetProviderOption, initialProviderOptions, supportsOnDidChangeProviderOptions) {
        const providerId = new languages.ProviderId(extensionId, extensionVersion, groupId);
        const provider = this._instantiationService.createInstance(ExtensionBackedInlineCompletionsProvider, handle, groupId ?? extensionId, providerId, yieldsToExtensionIds, excludesExtensionIds, debounceDelayMs, displayName, initialModelInfo, supportsHandleEvents, supportsSetModelId, supportsOnDidChange, supportsOnDidChangeModelInfo, initialProviderOptions, supportsSetProviderOption, supportsOnDidChangeProviderOptions, selector, this._proxy);
        this._registrations.set(handle, provider);
    }
    $emitInlineCompletionsChange(handle, changeHint) {
        const obj = this._registrations.get(handle);
        if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
            obj._emitDidChange(changeHint);
        }
    }
    $emitInlineCompletionModelInfoChange(handle, data) {
        const obj = this._registrations.get(handle);
        if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
            obj._setModelInfo(data);
        }
    }
    $emitInlineCompletionProviderOptionsChange(handle, data) {
        const obj = this._registrations.get(handle);
        if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
            obj._setProviderOptions(data);
        }
    }
    // --- parameter hints
    $registerSignatureHelpProvider(handle, selector, metadata) {
        this._registrations.set(handle, this._languageFeaturesService.signatureHelpProvider.register(selector, {
            signatureHelpTriggerCharacters: metadata.triggerCharacters,
            signatureHelpRetriggerCharacters: metadata.retriggerCharacters,
            provideSignatureHelp: async (model, position, token, context) => {
                const result = await this._proxy.$provideSignatureHelp(handle, model.uri, position, context, token);
                if (!result) {
                    return undefined;
                }
                return {
                    value: result,
                    dispose: () => {
                        this._proxy.$releaseSignatureHelp(handle, result.id);
                    }
                };
            }
        }));
    }
    // --- inline hints
    $registerInlayHintsProvider(handle, selector, supportsResolve, eventHandle, displayName) {
        const provider = {
            displayName,
            provideInlayHints: async (model, range, token) => {
                const result = await this._proxy.$provideInlayHints(handle, model.uri, range, token);
                if (!result) {
                    return;
                }
                return {
                    hints: revive(result.hints),
                    dispose: () => {
                        if (result.cacheId) {
                            this._proxy.$releaseInlayHints(handle, result.cacheId);
                        }
                    }
                };
            }
        };
        if (supportsResolve) {
            provider.resolveInlayHint = async (hint, token) => {
                const dto = hint;
                if (!dto.cacheId) {
                    return hint;
                }
                const result = await this._proxy.$resolveInlayHint(handle, dto.cacheId, token);
                if (token.isCancellationRequested) {
                    throw new CancellationError();
                }
                if (!result) {
                    return hint;
                }
                return {
                    ...hint,
                    tooltip: result.tooltip,
                    label: revive(result.label),
                    textEdits: result.textEdits
                };
            };
        }
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            provider.onDidChangeInlayHints = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.inlayHintsProvider.register(selector, provider));
    }
    $emitInlayHintsEvent(eventHandle) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(undefined);
        }
    }
    // --- links
    $registerDocumentLinkProvider(handle, selector, supportsResolve) {
        const provider = {
            provideLinks: (model, token) => {
                return this._proxy.$provideDocumentLinks(handle, model.uri, token).then(dto => {
                    if (!dto) {
                        return undefined;
                    }
                    return {
                        links: dto.links.map(MainThreadLanguageFeatures_1._reviveLinkDTO),
                        dispose: () => {
                            if (typeof dto.cacheId === 'number') {
                                this._proxy.$releaseDocumentLinks(handle, dto.cacheId);
                            }
                        }
                    };
                });
            }
        };
        if (supportsResolve) {
            provider.resolveLink = (link, token) => {
                const dto = link;
                if (!dto.cacheId) {
                    return link;
                }
                return this._proxy.$resolveDocumentLink(handle, dto.cacheId, token).then(obj => {
                    return obj && MainThreadLanguageFeatures_1._reviveLinkDTO(obj);
                });
            };
        }
        this._registrations.set(handle, this._languageFeaturesService.linkProvider.register(selector, provider));
    }
    // --- colors
    $registerDocumentColorProvider(handle, selector) {
        const proxy = this._proxy;
        this._registrations.set(handle, this._languageFeaturesService.colorProvider.register(selector, {
            provideDocumentColors: (model, token) => {
                return proxy.$provideDocumentColors(handle, model.uri, token)
                    .then(documentColors => {
                    return documentColors.map(documentColor => {
                        const [red, green, blue, alpha] = documentColor.color;
                        const color = {
                            red: red,
                            green: green,
                            blue: blue,
                            alpha
                        };
                        return {
                            color,
                            range: documentColor.range
                        };
                    });
                });
            },
            provideColorPresentations: (model, colorInfo, token) => {
                return proxy.$provideColorPresentations(handle, model.uri, {
                    color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha],
                    range: colorInfo.range
                }, token);
            }
        }));
    }
    // --- folding
    $registerFoldingRangeProvider(handle, selector, extensionId, eventHandle) {
        const provider = {
            id: extensionId.value,
            provideFoldingRanges: (model, context, token) => {
                return this._proxy.$provideFoldingRanges(handle, model.uri, context, token);
            }
        };
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter();
            this._registrations.set(eventHandle, emitter);
            provider.onDidChange = emitter.event;
        }
        this._registrations.set(handle, this._languageFeaturesService.foldingRangeProvider.register(selector, provider));
    }
    $emitFoldingRangeEvent(eventHandle, event) {
        const obj = this._registrations.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }
    // -- smart select
    $registerSelectionRangeProvider(handle, selector) {
        this._registrations.set(handle, this._languageFeaturesService.selectionRangeProvider.register(selector, {
            provideSelectionRanges: (model, positions, token) => {
                return this._proxy.$provideSelectionRanges(handle, model.uri, positions, token);
            }
        }));
    }
    // --- call hierarchy
    $registerCallHierarchyProvider(handle, selector) {
        this._registrations.set(handle, callh.CallHierarchyProviderRegistry.register(selector, {
            prepareCallHierarchy: async (document, position, token) => {
                const items = await this._proxy.$prepareCallHierarchy(handle, document.uri, position, token);
                if (!items || items.length === 0) {
                    return undefined;
                }
                return {
                    dispose: () => {
                        for (const item of items) {
                            this._proxy.$releaseCallHierarchy(handle, item._sessionId);
                        }
                    },
                    roots: items.map(MainThreadLanguageFeatures_1._reviveCallHierarchyItemDto)
                };
            },
            provideOutgoingCalls: async (item, token) => {
                const outgoing = await this._proxy.$provideCallHierarchyOutgoingCalls(handle, item._sessionId, item._itemId, token);
                if (!outgoing) {
                    return outgoing;
                }
                outgoing.forEach(value => {
                    value.to = MainThreadLanguageFeatures_1._reviveCallHierarchyItemDto(value.to);
                });
                // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                return outgoing;
            },
            provideIncomingCalls: async (item, token) => {
                const incoming = await this._proxy.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, token);
                if (!incoming) {
                    return incoming;
                }
                incoming.forEach(value => {
                    value.from = MainThreadLanguageFeatures_1._reviveCallHierarchyItemDto(value.from);
                });
                // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                return incoming;
            }
        }));
    }
    // --- configuration
    static _reviveRegExp(regExp) {
        return new RegExp(regExp.pattern, regExp.flags);
    }
    static _reviveIndentationRule(indentationRule) {
        return {
            decreaseIndentPattern: MainThreadLanguageFeatures_1._reviveRegExp(indentationRule.decreaseIndentPattern),
            increaseIndentPattern: MainThreadLanguageFeatures_1._reviveRegExp(indentationRule.increaseIndentPattern),
            indentNextLinePattern: indentationRule.indentNextLinePattern ? MainThreadLanguageFeatures_1._reviveRegExp(indentationRule.indentNextLinePattern) : undefined,
            unIndentedLinePattern: indentationRule.unIndentedLinePattern ? MainThreadLanguageFeatures_1._reviveRegExp(indentationRule.unIndentedLinePattern) : undefined,
        };
    }
    static _reviveOnEnterRule(onEnterRule) {
        return {
            beforeText: MainThreadLanguageFeatures_1._reviveRegExp(onEnterRule.beforeText),
            afterText: onEnterRule.afterText ? MainThreadLanguageFeatures_1._reviveRegExp(onEnterRule.afterText) : undefined,
            previousLineText: onEnterRule.previousLineText ? MainThreadLanguageFeatures_1._reviveRegExp(onEnterRule.previousLineText) : undefined,
            action: onEnterRule.action
        };
    }
    static _reviveOnEnterRules(onEnterRules) {
        return onEnterRules.map(MainThreadLanguageFeatures_1._reviveOnEnterRule);
    }
    $setLanguageConfiguration(handle, languageId, _configuration) {
        const configuration = {
            comments: _configuration.comments,
            brackets: _configuration.brackets,
            wordPattern: _configuration.wordPattern ? MainThreadLanguageFeatures_1._reviveRegExp(_configuration.wordPattern) : undefined,
            indentationRules: _configuration.indentationRules ? MainThreadLanguageFeatures_1._reviveIndentationRule(_configuration.indentationRules) : undefined,
            onEnterRules: _configuration.onEnterRules ? MainThreadLanguageFeatures_1._reviveOnEnterRules(_configuration.onEnterRules) : undefined,
            autoClosingPairs: undefined,
            surroundingPairs: undefined,
            __electricCharacterSupport: undefined
        };
        if (_configuration.autoClosingPairs) {
            configuration.autoClosingPairs = _configuration.autoClosingPairs;
        }
        else if (_configuration.__characterPairSupport) {
            // backwards compatibility
            configuration.autoClosingPairs = _configuration.__characterPairSupport.autoClosingPairs;
        }
        if (_configuration.__electricCharacterSupport && _configuration.__electricCharacterSupport.docComment) {
            configuration.__electricCharacterSupport = {
                docComment: {
                    open: _configuration.__electricCharacterSupport.docComment.open,
                    close: _configuration.__electricCharacterSupport.docComment.close
                }
            };
        }
        if (this._languageService.isRegisteredLanguageId(languageId)) {
            this._registrations.set(handle, this._languageConfigurationService.register(languageId, configuration, 100));
        }
    }
    // --- type hierarchy
    $registerTypeHierarchyProvider(handle, selector) {
        this._registrations.set(handle, typeh.TypeHierarchyProviderRegistry.register(selector, {
            prepareTypeHierarchy: async (document, position, token) => {
                const items = await this._proxy.$prepareTypeHierarchy(handle, document.uri, position, token);
                if (!items) {
                    return undefined;
                }
                return {
                    dispose: () => {
                        for (const item of items) {
                            this._proxy.$releaseTypeHierarchy(handle, item._sessionId);
                        }
                    },
                    roots: items.map(MainThreadLanguageFeatures_1._reviveTypeHierarchyItemDto)
                };
            },
            provideSupertypes: async (item, token) => {
                const supertypes = await this._proxy.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, token);
                if (!supertypes) {
                    return supertypes;
                }
                return supertypes.map(MainThreadLanguageFeatures_1._reviveTypeHierarchyItemDto);
            },
            provideSubtypes: async (item, token) => {
                const subtypes = await this._proxy.$provideTypeHierarchySubtypes(handle, item._sessionId, item._itemId, token);
                if (!subtypes) {
                    return subtypes;
                }
                return subtypes.map(MainThreadLanguageFeatures_1._reviveTypeHierarchyItemDto);
            }
        }));
    }
    $registerDocumentOnDropEditProvider(handle, selector, metadata) {
        const provider = new MainThreadDocumentOnDropEditProvider(handle, this._proxy, metadata, this._uriIdentService);
        this._documentOnDropEditProviders.set(handle, provider);
        this._registrations.set(handle, combinedDisposable(this._languageFeaturesService.documentDropEditProvider.register(selector, provider), toDisposable(() => this._documentOnDropEditProviders.delete(handle))));
    }
    async $resolveDocumentOnDropFileData(handle, requestId, dataId) {
        const provider = this._documentOnDropEditProviders.get(handle);
        if (!provider) {
            throw new Error('Could not find provider');
        }
        return provider.resolveDocumentOnDropFileData(requestId, dataId);
    }
};
MainThreadLanguageFeatures = MainThreadLanguageFeatures_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadLanguageFeatures),
    __param(1, ILanguageService),
    __param(2, ILanguageConfigurationService),
    __param(3, ILanguageFeaturesService),
    __param(4, IUriIdentityService),
    __param(5, IInstantiationService),
    __param(6, IInlineCompletionsUnificationService)
], MainThreadLanguageFeatures);
export { MainThreadLanguageFeatures };
let MainThreadPasteEditProvider = class MainThreadPasteEditProvider {
    constructor(_handle, _proxy, metadata, _uriIdentService) {
        this._handle = _handle;
        this._proxy = _proxy;
        this._uriIdentService = _uriIdentService;
        this.dataTransfers = new DataTransferFileCache();
        this.copyMimeTypes = metadata.copyMimeTypes ?? [];
        this.pasteMimeTypes = metadata.pasteMimeTypes ?? [];
        this.providedPasteEditKinds = metadata.providedPasteEditKinds?.map(kind => new HierarchicalKind(kind)) ?? [];
        if (metadata.supportsCopy) {
            this.prepareDocumentPaste = async (model, selections, dataTransfer, token) => {
                const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
                if (token.isCancellationRequested) {
                    return undefined;
                }
                const newDataTransfer = await this._proxy.$prepareDocumentPaste(_handle, model.uri, selections, dataTransferDto, token);
                if (!newDataTransfer) {
                    return undefined;
                }
                const dataTransferOut = new VSDataTransfer();
                for (const [type, item] of newDataTransfer.items) {
                    dataTransferOut.replace(type, createStringDataTransferItem(item.asString, item.id));
                }
                return dataTransferOut;
            };
        }
        if (metadata.supportsPaste) {
            this.provideDocumentPasteEdits = async (model, selections, dataTransfer, context, token) => {
                const request = this.dataTransfers.add(dataTransfer);
                try {
                    const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const edits = await this._proxy.$providePasteEdits(this._handle, request.id, model.uri, selections, dataTransferDto, {
                        only: context.only?.value,
                        triggerKind: context.triggerKind,
                    }, token);
                    if (!edits) {
                        return;
                    }
                    return {
                        edits: edits.map((edit) => {
                            return {
                                ...edit,
                                kind: edit.kind ? new HierarchicalKind(edit.kind.value) : new HierarchicalKind(''),
                                yieldTo: edit.yieldTo?.map(x => ({ kind: new HierarchicalKind(x) })),
                                additionalEdit: edit.additionalEdit ? reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, dataId => this.resolveFileData(request.id, dataId)) : undefined,
                            };
                        }),
                        dispose: () => {
                            this._proxy.$releasePasteEdits(this._handle, request.id);
                        },
                    };
                }
                finally {
                    request.dispose();
                }
            };
        }
        if (metadata.supportsResolve) {
            this.resolveDocumentPasteEdit = async (edit, token) => {
                const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
                if (typeof resolved.insertText !== 'undefined') {
                    edit.insertText = resolved.insertText;
                }
                if (resolved.additionalEdit) {
                    edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
                }
                return edit;
            };
        }
    }
    resolveFileData(requestId, dataId) {
        return this.dataTransfers.resolveFileData(requestId, dataId);
    }
};
MainThreadPasteEditProvider = __decorate([
    __param(3, IUriIdentityService)
], MainThreadPasteEditProvider);
let MainThreadDocumentOnDropEditProvider = class MainThreadDocumentOnDropEditProvider {
    constructor(_handle, _proxy, metadata, _uriIdentService) {
        this._handle = _handle;
        this._proxy = _proxy;
        this._uriIdentService = _uriIdentService;
        this.dataTransfers = new DataTransferFileCache();
        this.dropMimeTypes = metadata?.dropMimeTypes ?? ['*/*'];
        this.providedDropEditKinds = metadata?.providedDropKinds?.map(kind => new HierarchicalKind(kind));
        if (metadata?.supportsResolve) {
            this.resolveDocumentDropEdit = async (edit, token) => {
                const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
                if (resolved.additionalEdit) {
                    edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
                }
                return edit;
            };
        }
    }
    async provideDocumentDropEdits(model, position, dataTransfer, token) {
        const request = this.dataTransfers.add(dataTransfer);
        try {
            const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
            if (token.isCancellationRequested) {
                return;
            }
            const edits = await this._proxy.$provideDocumentOnDropEdits(this._handle, request.id, model.uri, position, dataTransferDto, token);
            if (!edits) {
                return;
            }
            return {
                edits: edits.map(edit => {
                    return {
                        ...edit,
                        yieldTo: edit.yieldTo?.map(x => ({ kind: new HierarchicalKind(x) })),
                        kind: edit.kind ? new HierarchicalKind(edit.kind) : undefined,
                        additionalEdit: reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, dataId => this.resolveDocumentOnDropFileData(request.id, dataId)),
                    };
                }),
                dispose: () => {
                    this._proxy.$releaseDocumentOnDropEdits(this._handle, request.id);
                },
            };
        }
        finally {
            request.dispose();
        }
    }
    resolveDocumentOnDropFileData(requestId, dataId) {
        return this.dataTransfers.resolveFileData(requestId, dataId);
    }
};
MainThreadDocumentOnDropEditProvider = __decorate([
    __param(3, IUriIdentityService)
], MainThreadDocumentOnDropEditProvider);
export class MainThreadDocumentSemanticTokensProvider {
    constructor(_proxy, _handle, _legend, onDidChange) {
        this._proxy = _proxy;
        this._handle = _handle;
        this._legend = _legend;
        this.onDidChange = onDidChange;
    }
    releaseDocumentSemanticTokens(resultId) {
        if (resultId) {
            this._proxy.$releaseDocumentSemanticTokens(this._handle, parseInt(resultId, 10));
        }
    }
    getLegend() {
        return this._legend;
    }
    async provideDocumentSemanticTokens(model, lastResultId, token) {
        const nLastResultId = lastResultId ? parseInt(lastResultId, 10) : 0;
        const encodedDto = await this._proxy.$provideDocumentSemanticTokens(this._handle, model.uri, nLastResultId, token);
        if (!encodedDto) {
            return null;
        }
        if (token.isCancellationRequested) {
            return null;
        }
        const dto = decodeSemanticTokensDto(encodedDto);
        if (dto.type === 'full') {
            return {
                resultId: String(dto.id),
                data: dto.data
            };
        }
        return {
            resultId: String(dto.id),
            edits: dto.deltas
        };
    }
}
export class MainThreadDocumentRangeSemanticTokensProvider {
    constructor(_proxy, _handle, _legend, onDidChange) {
        this._proxy = _proxy;
        this._handle = _handle;
        this._legend = _legend;
        this.onDidChange = onDidChange;
    }
    getLegend() {
        return this._legend;
    }
    async provideDocumentRangeSemanticTokens(model, range, token) {
        const encodedDto = await this._proxy.$provideDocumentRangeSemanticTokens(this._handle, model.uri, range, token);
        if (!encodedDto) {
            return null;
        }
        if (token.isCancellationRequested) {
            return null;
        }
        const dto = decodeSemanticTokensDto(encodedDto);
        if (dto.type === 'full') {
            return {
                resultId: String(dto.id),
                data: dto.data
            };
        }
        throw new Error(`Unexpected`);
    }
}
let ExtensionBackedInlineCompletionsProvider = class ExtensionBackedInlineCompletionsProvider extends Disposable {
    constructor(handle, groupId, providerId, yieldsToGroupIds, excludesGroupIds, debounceDelayMs, displayName, modelInfo, _supportsHandleEvents, _supportsSetModelId, _supportsOnDidChange, _supportsOnDidChangeModelInfo, providerOptions, _supportsSetProviderOption, _supportsOnDidChangeProviderOptions, _selector, _proxy, _languageFeaturesService, _aiEditTelemetryService, _instantiationService) {
        super();
        this.handle = handle;
        this.groupId = groupId;
        this.providerId = providerId;
        this.yieldsToGroupIds = yieldsToGroupIds;
        this.excludesGroupIds = excludesGroupIds;
        this.debounceDelayMs = debounceDelayMs;
        this.displayName = displayName;
        this.modelInfo = modelInfo;
        this._supportsHandleEvents = _supportsHandleEvents;
        this._supportsSetModelId = _supportsSetModelId;
        this._supportsOnDidChange = _supportsOnDidChange;
        this._supportsOnDidChangeModelInfo = _supportsOnDidChangeModelInfo;
        this.providerOptions = providerOptions;
        this._supportsSetProviderOption = _supportsSetProviderOption;
        this._supportsOnDidChangeProviderOptions = _supportsOnDidChangeProviderOptions;
        this._selector = _selector;
        this._proxy = _proxy;
        this._languageFeaturesService = _languageFeaturesService;
        this._aiEditTelemetryService = _aiEditTelemetryService;
        this._instantiationService = _instantiationService;
        this._onDidChangeEmitter = this._register(new Emitter());
        this._onDidChangeModelInfoEmitter = this._register(new Emitter());
        this._onDidProviderOptionsChangeEmitter = this._register(new Emitter());
        this.setModelId = this._supportsSetModelId ? async (modelId) => {
            await this._proxy.$handleInlineCompletionSetCurrentModelId(this.handle, modelId);
        } : undefined;
        this.setProviderOption = this._supportsSetProviderOption ? async (optionId, valueId) => {
            await this._proxy.$handleInlineCompletionSetProviderOption(this.handle, optionId, valueId);
        } : undefined;
        this.onDidChangeInlineCompletions = this._supportsOnDidChange ? this._onDidChangeEmitter.event : undefined;
        this.onDidChangeModelInfo = this._supportsOnDidChangeModelInfo ? this._onDidChangeModelInfoEmitter.event : undefined;
        this.onDidProviderOptionsChange = this._supportsOnDidChangeProviderOptions ? this._onDidProviderOptionsChangeEmitter.event : undefined;
        this._register(this._languageFeaturesService.inlineCompletionsProvider.register(this._selector, this));
    }
    _setModelInfo(newModelInfo) {
        this.modelInfo = newModelInfo;
        if (this._supportsOnDidChangeModelInfo) {
            this._onDidChangeModelInfoEmitter.fire();
        }
    }
    _setProviderOptions(newProviderOptions) {
        this.providerOptions = newProviderOptions;
        if (this._supportsOnDidChangeProviderOptions) {
            this._onDidProviderOptionsChangeEmitter.fire();
        }
    }
    _emitDidChange(changeHint) {
        if (this._supportsOnDidChange) {
            this._onDidChangeEmitter.fire(changeHint);
        }
    }
    async provideInlineCompletions(model, position, context, token) {
        const result = await this._proxy.$provideInlineCompletions(this.handle, model.uri, position, context, token);
        return result;
    }
    async handleItemDidShow(completions, item, updatedInsertText, editDeltaInfo) {
        if (item.suggestionId === undefined) {
            item.suggestionId = this._aiEditTelemetryService.createSuggestionId({
                applyCodeBlockSuggestionId: undefined,
                feature: 'inlineSuggestion',
                source: this.providerId,
                languageId: completions.languageId,
                editDeltaInfo: editDeltaInfo,
                modeId: undefined,
                modelId: undefined,
                presentation: item.isInlineEdit ? 'nextEditSuggestion' : 'inlineCompletion',
            });
        }
        if (this._supportsHandleEvents) {
            await this._proxy.$handleInlineCompletionDidShow(this.handle, completions.pid, item.idx, updatedInsertText);
        }
    }
    async handlePartialAccept(completions, item, acceptedCharacters, info) {
        if (this._supportsHandleEvents) {
            await this._proxy.$handleInlineCompletionPartialAccept(this.handle, completions.pid, item.idx, acceptedCharacters, info);
        }
    }
    async handleEndOfLifetime(completions, item, reason, lifetimeSummary) {
        function mapReason(reason, f) {
            if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
                return {
                    ...reason,
                    supersededBy: reason.supersededBy ? f(reason.supersededBy) : undefined,
                };
            }
            return reason;
        }
        if (this._supportsHandleEvents) {
            await this._proxy.$handleInlineCompletionEndOfLifetime(this.handle, completions.pid, item.idx, mapReason(reason, i => ({ pid: completions.pid, idx: i.idx })));
        }
        if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
            if (item.suggestionId !== undefined) {
                this._aiEditTelemetryService.handleCodeAccepted({
                    suggestionId: item.suggestionId,
                    feature: 'inlineSuggestion',
                    source: this.providerId,
                    languageId: completions.languageId,
                    editDeltaInfo: EditDeltaInfo.tryCreate(lifetimeSummary.lineCountModified, lifetimeSummary.lineCountOriginal, lifetimeSummary.characterCountModified, lifetimeSummary.characterCountOriginal),
                    modeId: undefined,
                    modelId: undefined,
                    presentation: item.isInlineEdit ? 'nextEditSuggestion' : 'inlineCompletion',
                    acceptanceMethod: 'accept',
                    applyCodeBlockSuggestionId: undefined,
                });
            }
        }
        const endOfLifeSummary = {
            opportunityId: lifetimeSummary.requestUuid,
            correlationId: lifetimeSummary.correlationId,
            shown: lifetimeSummary.shown,
            shownDuration: lifetimeSummary.shownDuration,
            shownDurationUncollapsed: lifetimeSummary.shownDurationUncollapsed,
            timeUntilShown: lifetimeSummary.timeUntilShown,
            timeUntilProviderRequest: lifetimeSummary.timeUntilProviderRequest,
            timeUntilProviderResponse: lifetimeSummary.timeUntilProviderResponse,
            editorType: lifetimeSummary.editorType,
            viewKind: lifetimeSummary.viewKind,
            preceeded: lifetimeSummary.preceeded,
            requestReason: lifetimeSummary.requestReason,
            typingInterval: lifetimeSummary.typingInterval,
            typingIntervalCharacterCount: lifetimeSummary.typingIntervalCharacterCount,
            languageId: lifetimeSummary.languageId,
            cursorColumnDistance: lifetimeSummary.cursorColumnDistance,
            cursorLineDistance: lifetimeSummary.cursorLineDistance,
            lineCountOriginal: lifetimeSummary.lineCountOriginal,
            lineCountModified: lifetimeSummary.lineCountModified,
            characterCountOriginal: lifetimeSummary.characterCountOriginal,
            characterCountModified: lifetimeSummary.characterCountModified,
            disjointReplacements: lifetimeSummary.disjointReplacements,
            sameShapeReplacements: lifetimeSummary.sameShapeReplacements,
            selectedSuggestionInfo: lifetimeSummary.selectedSuggestionInfo,
            extensionId: this.providerId.extensionId,
            extensionVersion: this.providerId.extensionVersion,
            groupId: extractEngineFromCorrelationId(lifetimeSummary.correlationId) ?? this.groupId,
            skuPlan: lifetimeSummary.skuPlan,
            skuType: lifetimeSummary.skuType,
            performanceMarkers: lifetimeSummary.performanceMarkers,
            availableProviders: lifetimeSummary.availableProviders,
            partiallyAccepted: lifetimeSummary.partiallyAccepted,
            partiallyAcceptedCountSinceOriginal: lifetimeSummary.partiallyAcceptedCountSinceOriginal,
            partiallyAcceptedRatioSinceOriginal: lifetimeSummary.partiallyAcceptedRatioSinceOriginal,
            partiallyAcceptedCharactersSinceOriginal: lifetimeSummary.partiallyAcceptedCharactersSinceOriginal,
            superseded: reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored && !!reason.supersededBy,
            reason: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted ? 'accepted'
                : reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected ? 'rejected'
                    : reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored ? 'ignored' : undefined,
            acceptedAlternativeAction: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted && reason.alternativeAction,
            noSuggestionReason: undefined,
            notShownReason: lifetimeSummary.notShownReason,
            renameCreated: lifetimeSummary.renameCreated,
            renameDuration: lifetimeSummary.renameDuration,
            renameTimedOut: lifetimeSummary.renameTimedOut,
            renameDroppedOtherEdits: lifetimeSummary.renameDroppedOtherEdits,
            renameDroppedRenameEdits: lifetimeSummary.renameDroppedRenameEdits,
            editKind: lifetimeSummary.editKind,
            longDistanceHintVisible: lifetimeSummary.longDistanceHintVisible,
            longDistanceHintDistance: lifetimeSummary.longDistanceHintDistance,
            ...forwardToChannelIf(isCopilotLikeExtension(this.providerId.extensionId)),
        };
        const dataChannelForwardingTelemetryService = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
        sendInlineCompletionsEndOfLifeTelemetry(dataChannelForwardingTelemetryService, endOfLifeSummary);
    }
    disposeInlineCompletions(completions, reason) {
        this._proxy.$freeInlineCompletionsList(this.handle, completions.pid, reason);
    }
    async handleRejection(completions, item) {
        if (this._supportsHandleEvents) {
            await this._proxy.$handleInlineCompletionRejection(this.handle, completions.pid, item.idx);
        }
    }
    toString() {
        return `InlineCompletionsProvider(${this.providerId.toString()})`;
    }
};
ExtensionBackedInlineCompletionsProvider = __decorate([
    __param(17, ILanguageFeaturesService),
    __param(18, IAiEditTelemetryService),
    __param(19, IInstantiationService)
], ExtensionBackedInlineCompletionsProvider);
function extractEngineFromCorrelationId(correlationId) {
    if (!correlationId) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(correlationId);
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.engine === 'string') {
            return parsed.engine;
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSw0QkFBNEIsRUFBMkIsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUlsRCxPQUFPLEtBQUssU0FBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWhGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBRWxILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRS9GLE9BQU8sRUFBRSxtQkFBbUIs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