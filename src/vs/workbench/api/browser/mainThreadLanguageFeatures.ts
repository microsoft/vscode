/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../base/common/dataTransfer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { HierarchicalKind } from '../../../base/common/hierarchicalKind.js';
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { mixin } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { Position as EditorPosition, IPosition } from '../../../editor/common/core/position.js';
import { Range as EditorRange, IRange } from '../../../editor/common/core/range.js';
import { Selection } from '../../../editor/common/core/selection.js';
import * as languages from '../../../editor/common/languages.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IndentationRule, LanguageConfiguration, OnEnterRule } from '../../../editor/common/languages/languageConfiguration.js';
import { ILanguageConfigurationService } from '../../../editor/common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { decodeSemanticTokensDto } from '../../../editor/common/services/semanticTokensDto.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { reviveWorkspaceEditDto } from './mainThreadBulkEdits.js';
import * as typeConvert from '../common/extHostTypeConverters.js';
import { DataTransferFileCache } from '../common/shared/dataTransferCache.js';
import * as callh from '../../contrib/callHierarchy/common/callHierarchy.js';
import * as search from '../../contrib/search/common/search.js';
import * as typeh from '../../contrib/typeHierarchy/common/typeHierarchy.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostLanguageFeaturesShape, HoverWithId, ICallHierarchyItemDto, ICodeActionDto, ICodeActionProviderMetadataDto, IdentifiableInlineCompletion, IdentifiableInlineCompletions, IdentifiableInlineEdit, IDocumentDropEditDto, IDocumentDropEditProviderMetadata, IDocumentFilterDto, IIndentationRuleDto, IInlayHintDto, ILanguageConfigurationDto, ILanguageWordDefinitionDto, ILinkDto, ILocationDto, ILocationLinkDto, IOnEnterRuleDto, IPasteEditDto, IPasteEditProviderMetadataDto, IRegExpDto, ISignatureHelpProviderMetadataDto, ISuggestDataDto, ISuggestDataDtoField, ISuggestResultDtoField, ITypeHierarchyItemDto, IWorkspaceSymbolDto, MainContext, MainThreadLanguageFeaturesShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadLanguageFeatures)
export class MainThreadLanguageFeatures extends Disposable implements MainThreadLanguageFeaturesShape {

	private readonly _proxy: ExtHostLanguageFeaturesShape;
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageFeatures);

		if (this._languageService) {
			const updateAllWordDefinitions = () => {
				const wordDefinitionDtos: ILanguageWordDefinitionDto[] = [];
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
				} else {
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
	}

	$unregister(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}

	//#region --- revive functions

	private static _reviveLocationDto(data?: ILocationDto): languages.Location;
	private static _reviveLocationDto(data?: ILocationDto[]): languages.Location[];
	private static _reviveLocationDto(data: ILocationDto | ILocationDto[] | undefined): languages.Location | languages.Location[] | undefined {
		if (!data) {
			return data;
		} else if (Array.isArray(data)) {
			data.forEach(l => MainThreadLanguageFeatures._reviveLocationDto(l));
			return <languages.Location[]>data;
		} else {
			data.uri = URI.revive(data.uri);
			return <languages.Location>data;
		}
	}

	private static _reviveLocationLinkDto(data: ILocationLinkDto): languages.LocationLink;
	private static _reviveLocationLinkDto(data: ILocationLinkDto[]): languages.LocationLink[];
	private static _reviveLocationLinkDto(data: ILocationLinkDto | ILocationLinkDto[]): languages.LocationLink | languages.LocationLink[] {
		if (!data) {
			return <languages.LocationLink>data;
		} else if (Array.isArray(data)) {
			data.forEach(l => MainThreadLanguageFeatures._reviveLocationLinkDto(l));
			return <languages.LocationLink[]>data;
		} else {
			data.uri = URI.revive(data.uri);
			return <languages.LocationLink>data;
		}
	}

	private static _reviveWorkspaceSymbolDto(data: IWorkspaceSymbolDto): search.IWorkspaceSymbol;
	private static _reviveWorkspaceSymbolDto(data: IWorkspaceSymbolDto[]): search.IWorkspaceSymbol[];
	private static _reviveWorkspaceSymbolDto(data: undefined): undefined;
	private static _reviveWorkspaceSymbolDto(data: IWorkspaceSymbolDto | IWorkspaceSymbolDto[] | undefined): search.IWorkspaceSymbol | search.IWorkspaceSymbol[] | undefined {
		if (!data) {
			return <undefined>data;
		} else if (Array.isArray(data)) {
			data.forEach(MainThreadLanguageFeatures._reviveWorkspaceSymbolDto);
			return <search.IWorkspaceSymbol[]>data;
		} else {
			data.location = MainThreadLanguageFeatures._reviveLocationDto(data.location);
			return <search.IWorkspaceSymbol>data;
		}
	}

	private static _reviveCodeActionDto(data: ReadonlyArray<ICodeActionDto>, uriIdentService: IUriIdentityService): languages.CodeAction[] {
		data?.forEach(code => reviveWorkspaceEditDto(code.edit, uriIdentService));
		return <languages.CodeAction[]>data;
	}

	private static _reviveLinkDTO(data: ILinkDto): languages.ILink {
		if (data.url && typeof data.url !== 'string') {
			data.url = URI.revive(data.url);
		}
		return <languages.ILink>data;
	}

	private static _reviveCallHierarchyItemDto(data: ICallHierarchyItemDto | undefined): callh.CallHierarchyItem {
		if (data) {
			data.uri = URI.revive(data.uri);
		}
		return data as callh.CallHierarchyItem;
	}

	private static _reviveTypeHierarchyItemDto(data: ITypeHierarchyItemDto | undefined): typeh.TypeHierarchyItem {
		if (data) {
			data.uri = URI.revive(data.uri);
		}
		return data as typeh.TypeHierarchyItem;
	}

	//#endregion

	// --- outline

	$registerDocumentSymbolProvider(handle: number, selector: IDocumentFilterDto[], displayName: string): void {
		this._registrations.set(handle, this._languageFeaturesService.documentSymbolProvider.register(selector, {
			displayName,
			provideDocumentSymbols: (model: ITextModel, token: CancellationToken): Promise<languages.DocumentSymbol[] | undefined> => {
				return this._proxy.$provideDocumentSymbols(handle, model.uri, token);
			}
		}));
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: IDocumentFilterDto[], eventHandle: number | undefined): void {

		const provider: languages.CodeLensProvider = {
			provideCodeLenses: async (model: ITextModel, token: CancellationToken): Promise<languages.CodeLensList | undefined> => {
				const listDto = await this._proxy.$provideCodeLenses(handle, model.uri, token);
				if (!listDto) {
					return undefined;
				}
				return {
					lenses: listDto.lenses,
					dispose: () => listDto.cacheId && this._proxy.$releaseCodeLenses(handle, listDto.cacheId)
				};
			},
			resolveCodeLens: async (model: ITextModel, codeLens: languages.CodeLens, token: CancellationToken): Promise<languages.CodeLens | undefined> => {
				const result = await this._proxy.$resolveCodeLens(handle, codeLens, token);
				if (!result) {
					return undefined;
				}
				return {
					...result,
					range: model.validateRange(result.range),
				};
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<languages.CodeLensProvider>();
			this._registrations.set(eventHandle, emitter);
			provider.onDidChange = emitter.event;
		}

		this._registrations.set(handle, this._languageFeaturesService.codeLensProvider.register(selector, provider));
	}

	$emitCodeLensEvent(eventHandle: number, event?: any): void {
		const obj = this._registrations.get(eventHandle);
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	// --- declaration

	$registerDefinitionSupport(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.definitionProvider.register(selector, {
			provideDefinition: (model, position, token): Promise<languages.LocationLink[]> => {
				return this._proxy.$provideDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
			}
		}));
	}

	$registerDeclarationSupport(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.declarationProvider.register(selector, {
			provideDeclaration: (model, position, token) => {
				return this._proxy.$provideDeclaration(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
			}
		}));
	}

	$registerImplementationSupport(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.implementationProvider.register(selector, {
			provideImplementation: (model, position, token): Promise<languages.LocationLink[]> => {
				return this._proxy.$provideImplementation(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
			}
		}));
	}

	$registerTypeDefinitionSupport(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.typeDefinitionProvider.register(selector, {
			provideTypeDefinition: (model, position, token): Promise<languages.LocationLink[]> => {
				return this._proxy.$provideTypeDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
			}
		}));
	}

	// --- extra info

	$registerHoverProvider(handle: number, selector: IDocumentFilterDto[]): void {
		/*
		const hoverFinalizationRegistry = new FinalizationRegistry((hoverId: number) => {
			this._proxy.$releaseHover(handle, hoverId);
		});
		*/
		this._registrations.set(handle, this._languageFeaturesService.hoverProvider.register(selector, {
			provideHover: async (model: ITextModel, position: EditorPosition, token: CancellationToken, context?: languages.HoverContext<HoverWithId>): Promise<HoverWithId | undefined> => {
				const serializedContext: languages.HoverContext<{ id: number }> = {
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

	$registerEvaluatableExpressionProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.evaluatableExpressionProvider.register(selector, {
			provideEvaluatableExpression: (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<languages.EvaluatableExpression | undefined> => {
				return this._proxy.$provideEvaluatableExpression(handle, model.uri, position, token);
			}
		}));
	}

	// --- inline values

	$registerInlineValuesProvider(handle: number, selector: IDocumentFilterDto[], eventHandle: number | undefined): void {
		const provider: languages.InlineValuesProvider = {
			provideInlineValues: (model: ITextModel, viewPort: EditorRange, context: languages.InlineValueContext, token: CancellationToken): Promise<languages.InlineValue[] | undefined> => {
				return this._proxy.$provideInlineValues(handle, model.uri, viewPort, context, token);
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<void>();
			this._registrations.set(eventHandle, emitter);
			provider.onDidChangeInlineValues = emitter.event;
		}

		this._registrations.set(handle, this._languageFeaturesService.inlineValuesProvider.register(selector, provider));
	}

	$emitInlineValuesEvent(eventHandle: number, event?: any): void {
		const obj = this._registrations.get(eventHandle);
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	// --- occurrences

	$registerDocumentHighlightProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.documentHighlightProvider.register(selector, {
			provideDocumentHighlights: (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<languages.DocumentHighlight[] | undefined> => {
				return this._proxy.$provideDocumentHighlights(handle, model.uri, position, token);
			}
		}));
	}

	$registerMultiDocumentHighlightProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.multiDocumentHighlightProvider.register(selector, {
			selector: selector,
			provideMultiDocumentHighlights: (model: ITextModel, position: EditorPosition, otherModels: ITextModel[], token: CancellationToken): Promise<Map<URI, languages.DocumentHighlight[]> | undefined> => {
				return this._proxy.$provideMultiDocumentHighlights(handle, model.uri, position, otherModels.map(model => model.uri), token).then(dto => {
					// dto should be non-null + non-undefined
					// dto length of 0 is valid, just no highlights, pass this through.
					if (dto === undefined || dto === null) {
						return undefined;
					}
					const result = new ResourceMap<languages.DocumentHighlight[]>();
					dto?.forEach(value => {
						// check if the URI exists already, if so, combine the highlights, otherwise create a new entry
						const uri = URI.revive(value.uri);
						if (result.has(uri)) {
							result.get(uri)!.push(...value.highlights);
						} else {
							result.set(uri, value.highlights);
						}
					});
					return result;
				});
			}
		}));
	}

	// --- linked editing

	$registerLinkedEditingRangeProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.linkedEditingRangeProvider.register(selector, {
			provideLinkedEditingRanges: async (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<languages.LinkedEditingRanges | undefined> => {
				const res = await this._proxy.$provideLinkedEditingRanges(handle, model.uri, position, token);
				if (res) {
					return {
						ranges: res.ranges,
						wordPattern: res.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(res.wordPattern) : undefined
					};
				}
				return undefined;
			}
		}));
	}

	// --- references

	$registerReferenceSupport(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.referenceProvider.register(selector, {
			provideReferences: (model: ITextModel, position: EditorPosition, context: languages.ReferenceContext, token: CancellationToken): Promise<languages.Location[]> => {
				return this._proxy.$provideReferences(handle, model.uri, position, context, token).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		}));
	}

	// --- code actions

	$registerCodeActionSupport(handle: number, selector: IDocumentFilterDto[], metadata: ICodeActionProviderMetadataDto, displayName: string, extensionId: string, supportsResolve: boolean): void {
		const provider: languages.CodeActionProvider = {
			provideCodeActions: async (model: ITextModel, rangeOrSelection: EditorRange | Selection, context: languages.CodeActionContext, token: CancellationToken): Promise<languages.CodeActionList | undefined> => {
				const listDto = await this._proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, context, token);
				if (!listDto) {
					return undefined;
				}
				return {
					actions: MainThreadLanguageFeatures._reviveCodeActionDto(listDto.actions, this._uriIdentService),
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
			provider.resolveCodeAction = async (codeAction: languages.CodeAction, token: CancellationToken): Promise<languages.CodeAction> => {
				const resolved = await this._proxy.$resolveCodeAction(handle, (<ICodeActionDto>codeAction).cacheId!, token);
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

	// --- copy paste action provider

	private readonly _pasteEditProviders = new Map<number, MainThreadPasteEditProvider>();

	$registerPasteEditProvider(handle: number, selector: IDocumentFilterDto[], metadata: IPasteEditProviderMetadataDto): void {
		const provider = new MainThreadPasteEditProvider(handle, this._proxy, metadata, this._uriIdentService);
		this._pasteEditProviders.set(handle, provider);
		this._registrations.set(handle, combinedDisposable(
			this._languageFeaturesService.documentPasteEditProvider.register(selector, provider),
			toDisposable(() => this._pasteEditProviders.delete(handle)),
		));
	}

	$resolvePasteFileData(handle: number, requestId: number, dataId: string): Promise<VSBuffer> {
		const provider = this._pasteEditProviders.get(handle);
		if (!provider) {
			throw new Error('Could not find provider');
		}
		return provider.resolveFileData(requestId, dataId);
	}

	// --- formatting

	$registerDocumentFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void {
		this._registrations.set(handle, this._languageFeaturesService.documentFormattingEditProvider.register(selector, {
			extensionId,
			displayName,
			provideDocumentFormattingEdits: (model: ITextModel, options: languages.FormattingOptions, token: CancellationToken): Promise<languages.TextEdit[] | undefined> => {
				return this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
			}
		}));
	}

	$registerRangeFormattingSupport(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string, supportsRanges: boolean): void {
		this._registrations.set(handle, this._languageFeaturesService.documentRangeFormattingEditProvider.register(selector, {
			extensionId,
			displayName,
			provideDocumentRangeFormattingEdits: (model: ITextModel, range: EditorRange, options: languages.FormattingOptions, token: CancellationToken): Promise<languages.TextEdit[] | undefined> => {
				return this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
			},
			provideDocumentRangesFormattingEdits: !supportsRanges
				? undefined
				: (model, ranges, options, token) => {
					return this._proxy.$provideDocumentRangesFormattingEdits(handle, model.uri, ranges, options, token);
				},
		}));
	}

	$registerOnTypeFormattingSupport(handle: number, selector: IDocumentFilterDto[], autoFormatTriggerCharacters: string[], extensionId: ExtensionIdentifier): void {
		this._registrations.set(handle, this._languageFeaturesService.onTypeFormattingEditProvider.register(selector, {
			extensionId,
			autoFormatTriggerCharacters,
			provideOnTypeFormattingEdits: (model: ITextModel, position: EditorPosition, ch: string, options: languages.FormattingOptions, token: CancellationToken): Promise<languages.TextEdit[] | undefined> => {
				return this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
			}
		}));
	}

	// --- navigate type

	$registerNavigateTypeSupport(handle: number, supportsResolve: boolean): void {
		let lastResultId: number | undefined;

		const provider: search.IWorkspaceSymbolProvider = {
			provideWorkspaceSymbols: async (search: string, token: CancellationToken): Promise<search.IWorkspaceSymbol[]> => {
				const result = await this._proxy.$provideWorkspaceSymbols(handle, search, token);
				if (lastResultId !== undefined) {
					this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
				}
				lastResultId = result.cacheId;
				return MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(result.symbols);
			}
		};
		if (supportsResolve) {
			provider.resolveWorkspaceSymbol = async (item: search.IWorkspaceSymbol, token: CancellationToken): Promise<search.IWorkspaceSymbol | undefined> => {
				const resolvedItem = await this._proxy.$resolveWorkspaceSymbol(handle, item, token);
				return resolvedItem && MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(resolvedItem);
			};
		}
		this._registrations.set(handle, search.WorkspaceSymbolProviderRegistry.register(provider));
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: IDocumentFilterDto[], supportResolveLocation: boolean): void {
		this._registrations.set(handle, this._languageFeaturesService.renameProvider.register(selector, {
			provideRenameEdits: (model: ITextModel, position: EditorPosition, newName: string, token: CancellationToken) => {
				return this._proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then(data => reviveWorkspaceEditDto(data, this._uriIdentService));
			},
			resolveRenameLocation: supportResolveLocation
				? (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<languages.RenameLocation | undefined> => this._proxy.$resolveRenameLocation(handle, model.uri, position, token)
				: undefined
		}));
	}

	$registerNewSymbolNamesProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.newSymbolNamesProvider.register(selector, {
			supportsAutomaticNewSymbolNamesTriggerKind: this._proxy.$supportsAutomaticNewSymbolNamesTriggerKind(handle),
			provideNewSymbolNames: (model: ITextModel, range: IRange, triggerKind: languages.NewSymbolNameTriggerKind, token: CancellationToken): Promise<languages.NewSymbolName[] | undefined> => {
				return this._proxy.$provideNewSymbolNames(handle, model.uri, range, triggerKind, token);
			}
		} satisfies languages.NewSymbolNamesProvider));
	}

	// --- semantic tokens

	$registerDocumentSemanticTokensProvider(handle: number, selector: IDocumentFilterDto[], legend: languages.SemanticTokensLegend, eventHandle: number | undefined): void {
		let event: Event<void> | undefined = undefined;
		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<void>();
			this._registrations.set(eventHandle, emitter);
			event = emitter.event;
		}
		this._registrations.set(handle, this._languageFeaturesService.documentSemanticTokensProvider.register(selector, new MainThreadDocumentSemanticTokensProvider(this._proxy, handle, legend, event)));
	}

	$emitDocumentSemanticTokensEvent(eventHandle: number): void {
		const obj = this._registrations.get(eventHandle);
		if (obj instanceof Emitter) {
			obj.fire(undefined);
		}
	}

	$registerDocumentRangeSemanticTokensProvider(handle: number, selector: IDocumentFilterDto[], legend: languages.SemanticTokensLegend): void {
		this._registrations.set(handle, this._languageFeaturesService.documentRangeSemanticTokensProvider.register(selector, new MainThreadDocumentRangeSemanticTokensProvider(this._proxy, handle, legend)));
	}

	// --- suggest

	private static _inflateSuggestDto(defaultRange: IRange | { insert: IRange; replace: IRange }, data: ISuggestDataDto, extensionId: ExtensionIdentifier): languages.CompletionItem {

		const label = data[ISuggestDataDtoField.label];
		const commandId = data[ISuggestDataDtoField.commandId];
		const commandIdent = data[ISuggestDataDtoField.commandIdent];
		const commitChars = data[ISuggestDataDtoField.commitCharacters];

		type IdentCommand = languages.Command & { $ident: string | undefined };

		let command: IdentCommand | undefined;
		if (commandId) {
			command = {
				$ident: commandIdent,
				id: commandId,
				title: '',
				arguments: commandIdent ? [commandIdent] : data[ISuggestDataDtoField.commandArguments], // Automatically fill in ident as first argument
			};
		}

		return {
			label,
			extensionId,
			kind: data[ISuggestDataDtoField.kind] ?? languages.CompletionItemKind.Property,
			tags: data[ISuggestDataDtoField.kindModifier],
			detail: data[ISuggestDataDtoField.detail],
			documentation: data[ISuggestDataDtoField.documentation],
			sortText: data[ISuggestDataDtoField.sortText],
			filterText: data[ISuggestDataDtoField.filterText],
			preselect: data[ISuggestDataDtoField.preselect],
			insertText: data[ISuggestDataDtoField.insertText] ?? (typeof label === 'string' ? label : label.label),
			range: data[ISuggestDataDtoField.range] ?? defaultRange,
			insertTextRules: data[ISuggestDataDtoField.insertTextRules],
			commitCharacters: commitChars ? Array.from(commitChars) : undefined,
			additionalTextEdits: data[ISuggestDataDtoField.additionalTextEdits],
			command,
			// not-standard
			_id: data.x,
		};
	}

	$registerCompletionsProvider(handle: number, selector: IDocumentFilterDto[], triggerCharacters: string[], supportsResolveDetails: boolean, extensionId: ExtensionIdentifier): void {
		const provider: languages.CompletionItemProvider = {
			triggerCharacters,
			_debugDisplayName: `${extensionId.value}(${triggerCharacters.join('')})`,
			provideCompletionItems: async (model: ITextModel, position: EditorPosition, context: languages.CompletionContext, token: CancellationToken): Promise<languages.CompletionList | undefined> => {
				const result = await this._proxy.$provideCompletionItems(handle, model.uri, position, context, token);
				if (!result) {
					return result;
				}
				return {
					suggestions: result[ISuggestResultDtoField.completions].map(d => MainThreadLanguageFeatures._inflateSuggestDto(result[ISuggestResultDtoField.defaultRanges], d, extensionId)),
					incomplete: result[ISuggestResultDtoField.isIncomplete] || false,
					duration: result[ISuggestResultDtoField.duration],
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
				return this._proxy.$resolveCompletionItem(handle, suggestion._id!, token).then(result => {
					if (!result) {
						return suggestion;
					}

					const newSuggestion = MainThreadLanguageFeatures._inflateSuggestDto(suggestion.range, result, extensionId);
					return mixin(suggestion, newSuggestion, true);
				});
			};
		}
		this._registrations.set(handle, this._languageFeaturesService.completionProvider.register(selector, provider));
	}

	$registerInlineCompletionsSupport(handle: number, selector: IDocumentFilterDto[], supportsHandleEvents: boolean, extensionId: string, yieldsToExtensionIds: string[], displayName: string | undefined, debounceDelayMs: number | undefined): void {
		const provider: languages.InlineCompletionsProvider<IdentifiableInlineCompletions> = {
			provideInlineCompletions: async (model: ITextModel, position: EditorPosition, context: languages.InlineCompletionContext, token: CancellationToken): Promise<IdentifiableInlineCompletions | undefined> => {
				return this._proxy.$provideInlineCompletions(handle, model.uri, position, context, token);
			},
			provideInlineEditsForRange: async (model: ITextModel, range: EditorRange, context: languages.InlineCompletionContext, token: CancellationToken): Promise<IdentifiableInlineCompletions | undefined> => {
				return this._proxy.$provideInlineEditsForRange(handle, model.uri, range, context, token);
			},
			handleItemDidShow: async (completions: IdentifiableInlineCompletions, item: IdentifiableInlineCompletion, updatedInsertText: string): Promise<void> => {
				if (supportsHandleEvents) {
					await this._proxy.$handleInlineCompletionDidShow(handle, completions.pid, item.idx, updatedInsertText);
				}
			},
			handlePartialAccept: async (completions, item, acceptedCharacters, info: languages.PartialAcceptInfo): Promise<void> => {
				if (supportsHandleEvents) {
					await this._proxy.$handleInlineCompletionPartialAccept(handle, completions.pid, item.idx, acceptedCharacters, info);
				}
			},
			freeInlineCompletions: (completions: IdentifiableInlineCompletions): void => {
				this._proxy.$freeInlineCompletionsList(handle, completions.pid);
			},
			handleRejection: async (completions, item): Promise<void> => {
				if (supportsHandleEvents) {
					await this._proxy.$handleInlineCompletionRejection(handle, completions.pid, item.idx);
				}
			},
			groupId: extensionId,
			yieldsToGroupIds: yieldsToExtensionIds,
			debounceDelayMs,
			displayName,
			toString() {
				return `InlineCompletionsProvider(${extensionId})`;
			},
		};
		this._registrations.set(handle, this._languageFeaturesService.inlineCompletionsProvider.register(selector, provider));
	}

	$registerInlineEditProvider(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, displayName: string): void {
		const provider: languages.InlineEditProvider<IdentifiableInlineEdit> = {
			displayName,
			provideInlineEdit: async (model: ITextModel, context: languages.IInlineEditContext, token: CancellationToken): Promise<IdentifiableInlineEdit | undefined> => {
				return this._proxy.$provideInlineEdit(handle, model.uri, context, token);
			},
			freeInlineEdit: (edit: IdentifiableInlineEdit): void => {
				this._proxy.$freeInlineEdit(handle, edit.pid);
			}

		};
		this._registrations.set(handle, this._languageFeaturesService.inlineEditProvider.register(selector, provider));
	}

	// --- parameter hints

	$registerSignatureHelpProvider(handle: number, selector: IDocumentFilterDto[], metadata: ISignatureHelpProviderMetadataDto): void {
		this._registrations.set(handle, this._languageFeaturesService.signatureHelpProvider.register(selector, {

			signatureHelpTriggerCharacters: metadata.triggerCharacters,
			signatureHelpRetriggerCharacters: metadata.retriggerCharacters,

			provideSignatureHelp: async (model: ITextModel, position: EditorPosition, token: CancellationToken, context: languages.SignatureHelpContext): Promise<languages.SignatureHelpResult | undefined> => {
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

	$registerInlayHintsProvider(handle: number, selector: IDocumentFilterDto[], supportsResolve: boolean, eventHandle: number | undefined, displayName: string | undefined): void {
		const provider: languages.InlayHintsProvider = {
			displayName,
			provideInlayHints: async (model: ITextModel, range: EditorRange, token: CancellationToken): Promise<languages.InlayHintList | undefined> => {
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
				const dto: IInlayHintDto = hint;
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
					label: revive<string | languages.InlayHintLabelPart[]>(result.label),
					textEdits: result.textEdits
				};
			};
		}
		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<void>();
			this._registrations.set(eventHandle, emitter);
			provider.onDidChangeInlayHints = emitter.event;
		}

		this._registrations.set(handle, this._languageFeaturesService.inlayHintsProvider.register(selector, provider));
	}

	$emitInlayHintsEvent(eventHandle: number): void {
		const obj = this._registrations.get(eventHandle);
		if (obj instanceof Emitter) {
			obj.fire(undefined);
		}
	}

	// --- links

	$registerDocumentLinkProvider(handle: number, selector: IDocumentFilterDto[], supportsResolve: boolean): void {
		const provider: languages.LinkProvider = {
			provideLinks: (model, token) => {
				return this._proxy.$provideDocumentLinks(handle, model.uri, token).then(dto => {
					if (!dto) {
						return undefined;
					}
					return {
						links: dto.links.map(MainThreadLanguageFeatures._reviveLinkDTO),
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
				const dto: ILinkDto = link;
				if (!dto.cacheId) {
					return link;
				}
				return this._proxy.$resolveDocumentLink(handle, dto.cacheId, token).then(obj => {
					return obj && MainThreadLanguageFeatures._reviveLinkDTO(obj);
				});
			};
		}
		this._registrations.set(handle, this._languageFeaturesService.linkProvider.register(selector, provider));
	}

	// --- colors

	$registerDocumentColorProvider(handle: number, selector: IDocumentFilterDto[]): void {
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

	$registerFoldingRangeProvider(handle: number, selector: IDocumentFilterDto[], extensionId: ExtensionIdentifier, eventHandle: number | undefined): void {
		const provider: languages.FoldingRangeProvider = {
			id: extensionId.value,
			provideFoldingRanges: (model, context, token) => {
				return this._proxy.$provideFoldingRanges(handle, model.uri, context, token);
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<languages.FoldingRangeProvider>();
			this._registrations.set(eventHandle, emitter);
			provider.onDidChange = emitter.event;
		}

		this._registrations.set(handle, this._languageFeaturesService.foldingRangeProvider.register(selector, provider));
	}

	$emitFoldingRangeEvent(eventHandle: number, event?: any): void {
		const obj = this._registrations.get(eventHandle);
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	// -- smart select

	$registerSelectionRangeProvider(handle: number, selector: IDocumentFilterDto[]): void {
		this._registrations.set(handle, this._languageFeaturesService.selectionRangeProvider.register(selector, {
			provideSelectionRanges: (model, positions, token) => {
				return this._proxy.$provideSelectionRanges(handle, model.uri, positions, token);
			}
		}));
	}

	// --- call hierarchy

	$registerCallHierarchyProvider(handle: number, selector: IDocumentFilterDto[]): void {
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
					roots: items.map(MainThreadLanguageFeatures._reviveCallHierarchyItemDto)
				};
			},

			provideOutgoingCalls: async (item, token) => {
				const outgoing = await this._proxy.$provideCallHierarchyOutgoingCalls(handle, item._sessionId, item._itemId, token);
				if (!outgoing) {
					return outgoing;
				}
				outgoing.forEach(value => {
					value.to = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.to);
				});
				return <any>outgoing;
			},
			provideIncomingCalls: async (item, token) => {
				const incoming = await this._proxy.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, token);
				if (!incoming) {
					return incoming;
				}
				incoming.forEach(value => {
					value.from = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.from);
				});
				return <any>incoming;
			}
		}));
	}

	// --- configuration

	private static _reviveRegExp(regExp: IRegExpDto): RegExp {
		return new RegExp(regExp.pattern, regExp.flags);
	}

	private static _reviveIndentationRule(indentationRule: IIndentationRuleDto): IndentationRule {
		return {
			decreaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.decreaseIndentPattern),
			increaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.increaseIndentPattern),
			indentNextLinePattern: indentationRule.indentNextLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.indentNextLinePattern) : undefined,
			unIndentedLinePattern: indentationRule.unIndentedLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.unIndentedLinePattern) : undefined,
		};
	}

	private static _reviveOnEnterRule(onEnterRule: IOnEnterRuleDto): OnEnterRule {
		return {
			beforeText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.beforeText),
			afterText: onEnterRule.afterText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.afterText) : undefined,
			previousLineText: onEnterRule.previousLineText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.previousLineText) : undefined,
			action: onEnterRule.action
		};
	}

	private static _reviveOnEnterRules(onEnterRules: IOnEnterRuleDto[]): OnEnterRule[] {
		return onEnterRules.map(MainThreadLanguageFeatures._reviveOnEnterRule);
	}

	$setLanguageConfiguration(handle: number, languageId: string, _configuration: ILanguageConfigurationDto): void {

		const configuration: LanguageConfiguration = {
			comments: _configuration.comments,
			brackets: _configuration.brackets,
			wordPattern: _configuration.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(_configuration.wordPattern) : undefined,
			indentationRules: _configuration.indentationRules ? MainThreadLanguageFeatures._reviveIndentationRule(_configuration.indentationRules) : undefined,
			onEnterRules: _configuration.onEnterRules ? MainThreadLanguageFeatures._reviveOnEnterRules(_configuration.onEnterRules) : undefined,

			autoClosingPairs: undefined,
			surroundingPairs: undefined,
			__electricCharacterSupport: undefined
		};

		if (_configuration.autoClosingPairs) {
			configuration.autoClosingPairs = _configuration.autoClosingPairs;
		} else if (_configuration.__characterPairSupport) {
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

	$registerTypeHierarchyProvider(handle: number, selector: IDocumentFilterDto[]): void {
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
					roots: items.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto)
				};
			},

			provideSupertypes: async (item, token) => {
				const supertypes = await this._proxy.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, token);
				if (!supertypes) {
					return supertypes;
				}
				return supertypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
			},
			provideSubtypes: async (item, token) => {
				const subtypes = await this._proxy.$provideTypeHierarchySubtypes(handle, item._sessionId, item._itemId, token);
				if (!subtypes) {
					return subtypes;
				}
				return subtypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
			}
		}));
	}


	// --- document drop Edits

	private readonly _documentOnDropEditProviders = new Map<number, MainThreadDocumentOnDropEditProvider>();

	$registerDocumentOnDropEditProvider(handle: number, selector: IDocumentFilterDto[], metadata: IDocumentDropEditProviderMetadata): void {
		const provider = new MainThreadDocumentOnDropEditProvider(handle, this._proxy, metadata, this._uriIdentService);
		this._documentOnDropEditProviders.set(handle, provider);
		this._registrations.set(handle, combinedDisposable(
			this._languageFeaturesService.documentDropEditProvider.register(selector, provider),
			toDisposable(() => this._documentOnDropEditProviders.delete(handle)),
		));
	}

	async $resolveDocumentOnDropFileData(handle: number, requestId: number, dataId: string): Promise<VSBuffer> {
		const provider = this._documentOnDropEditProviders.get(handle);
		if (!provider) {
			throw new Error('Could not find provider');
		}
		return provider.resolveDocumentOnDropFileData(requestId, dataId);
	}
}

class MainThreadPasteEditProvider implements languages.DocumentPasteEditProvider {

	private readonly dataTransfers = new DataTransferFileCache();

	public readonly copyMimeTypes: readonly string[];
	public readonly pasteMimeTypes: readonly string[];
	public readonly providedPasteEditKinds: readonly HierarchicalKind[];

	readonly prepareDocumentPaste?: languages.DocumentPasteEditProvider['prepareDocumentPaste'];
	readonly provideDocumentPasteEdits?: languages.DocumentPasteEditProvider['provideDocumentPasteEdits'];
	readonly resolveDocumentPasteEdit?: languages.DocumentPasteEditProvider['resolveDocumentPasteEdit'];

	constructor(
		private readonly _handle: number,
		private readonly _proxy: ExtHostLanguageFeaturesShape,
		metadata: IPasteEditProviderMetadataDto,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService
	) {
		this.copyMimeTypes = metadata.copyMimeTypes ?? [];
		this.pasteMimeTypes = metadata.pasteMimeTypes ?? [];
		this.providedPasteEditKinds = metadata.providedPasteEditKinds?.map(kind => new HierarchicalKind(kind)) ?? [];

		if (metadata.supportsCopy) {
			this.prepareDocumentPaste = async (model: ITextModel, selections: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<IReadonlyVSDataTransfer | undefined> => {
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
			this.provideDocumentPasteEdits = async (model: ITextModel, selections: Selection[], dataTransfer: IReadonlyVSDataTransfer, context: languages.DocumentPasteContext, token: CancellationToken) => {
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
						edits: edits.map((edit): languages.DocumentPasteEdit => {
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
				} finally {
					request.dispose();
				}
			};
		}
		if (metadata.supportsResolve) {
			this.resolveDocumentPasteEdit = async (edit: languages.DocumentPasteEdit, token: CancellationToken) => {
				const resolved = await this._proxy.$resolvePasteEdit(this._handle, (<IPasteEditDto>edit)._cacheId!, token);
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

	resolveFileData(requestId: number, dataId: string): Promise<VSBuffer> {
		return this.dataTransfers.resolveFileData(requestId, dataId);
	}
}

class MainThreadDocumentOnDropEditProvider implements languages.DocumentDropEditProvider {

	private readonly dataTransfers = new DataTransferFileCache();

	readonly dropMimeTypes?: readonly string[];

	readonly providedDropEditKinds: readonly HierarchicalKind[] | undefined;

	readonly resolveDocumentDropEdit?: languages.DocumentDropEditProvider['resolveDocumentDropEdit'];

	constructor(
		private readonly _handle: number,
		private readonly _proxy: ExtHostLanguageFeaturesShape,
		metadata: IDocumentDropEditProviderMetadata | undefined,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService
	) {
		this.dropMimeTypes = metadata?.dropMimeTypes ?? ['*/*'];
		this.providedDropEditKinds = metadata?.providedDropKinds?.map(kind => new HierarchicalKind(kind));

		if (metadata?.supportsResolve) {
			this.resolveDocumentDropEdit = async (edit, token) => {
				const resolved = await this._proxy.$resolvePasteEdit(this._handle, (<IDocumentDropEditDto>edit)._cacheId!, token);
				if (resolved.additionalEdit) {
					edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
				}
				return edit;
			};
		}
	}

	async provideDocumentDropEdits(model: ITextModel, position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<languages.DocumentDropEditsSession | undefined> {
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
		} finally {
			request.dispose();
		}
	}

	public resolveDocumentOnDropFileData(requestId: number, dataId: string): Promise<VSBuffer> {
		return this.dataTransfers.resolveFileData(requestId, dataId);
	}
}

export class MainThreadDocumentSemanticTokensProvider implements languages.DocumentSemanticTokensProvider {

	constructor(
		private readonly _proxy: ExtHostLanguageFeaturesShape,
		private readonly _handle: number,
		private readonly _legend: languages.SemanticTokensLegend,
		public readonly onDidChange: Event<void> | undefined,
	) {
	}

	public releaseDocumentSemanticTokens(resultId: string | undefined): void {
		if (resultId) {
			this._proxy.$releaseDocumentSemanticTokens(this._handle, parseInt(resultId, 10));
		}
	}

	public getLegend(): languages.SemanticTokensLegend {
		return this._legend;
	}

	async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<languages.SemanticTokens | languages.SemanticTokensEdits | null> {
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

export class MainThreadDocumentRangeSemanticTokensProvider implements languages.DocumentRangeSemanticTokensProvider {

	constructor(
		private readonly _proxy: ExtHostLanguageFeaturesShape,
		private readonly _handle: number,
		private readonly _legend: languages.SemanticTokensLegend,
	) {
	}

	public getLegend(): languages.SemanticTokensLegend {
		return this._legend;
	}

	async provideDocumentRangeSemanticTokens(model: ITextModel, range: EditorRange, token: CancellationToken): Promise<languages.SemanticTokens | null> {
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

