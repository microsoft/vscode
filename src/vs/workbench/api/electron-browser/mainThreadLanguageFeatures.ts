/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { ITextModel, ISingleEditOperation } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import * as search from 'vs/workbench/parts/search/common/search';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Position as EditorPosition } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { ExtHostContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape, MainContext, IExtHostContext, ISerializedLanguageConfiguration, ISerializedRegExp, ISerializedIndentationRule, ISerializedOnEnterRule, LocationDto, WorkspaceSymbolDto, CodeActionDto, reviveWorkspaceEditDto, ISerializedDocumentFilter, DefinitionLinkDto, ISerializedSignatureHelpProviderMetadata } from '../node/extHost.protocol';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LanguageConfiguration, IndentationRule, OnEnterRule } from 'vs/editor/common/modes/languageConfiguration';
import { IHeapService } from './mainThreadHeapService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';

@extHostNamedCustomer(MainContext.MainThreadLanguageFeatures)
export class MainThreadLanguageFeatures implements MainThreadLanguageFeaturesShape {

	private _proxy: ExtHostLanguageFeaturesShape;
	private _heapService: IHeapService;
	private _modeService: IModeService;
	private _registrations: { [handle: number]: IDisposable; } = Object.create(null);

	constructor(
		extHostContext: IExtHostContext,
		@IHeapService heapService: IHeapService,
		@IModeService modeService: IModeService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageFeatures);
		this._heapService = heapService;
		this._modeService = modeService;
	}

	dispose(): void {
		for (const key in this._registrations) {
			this._registrations[key].dispose();
		}
	}

	$unregister(handle: number): void {
		let registration = this._registrations[handle];
		if (registration) {
			registration.dispose();
			delete this._registrations[handle];
		}
	}

	//#region --- revive functions

	private static _reviveLocationDto(data: LocationDto): modes.Location;
	private static _reviveLocationDto(data: LocationDto[]): modes.Location[];
	private static _reviveLocationDto(data: LocationDto | LocationDto[]): modes.Location | modes.Location[] {
		if (!data) {
			return <modes.Location>data;
		} else if (Array.isArray(data)) {
			data.forEach(l => MainThreadLanguageFeatures._reviveLocationDto(l));
			return <modes.Location[]>data;
		} else {
			data.uri = URI.revive(data.uri);
			return <modes.Location>data;
		}
	}

	private static _reviveDefinitionLinkDto(data: DefinitionLinkDto): modes.DefinitionLink;
	private static _reviveDefinitionLinkDto(data: DefinitionLinkDto[]): modes.DefinitionLink[];
	private static _reviveDefinitionLinkDto(data: DefinitionLinkDto | DefinitionLinkDto[]): modes.DefinitionLink | modes.DefinitionLink[] {
		if (!data) {
			return <modes.DefinitionLink>data;
		} else if (Array.isArray(data)) {
			data.forEach(l => MainThreadLanguageFeatures._reviveDefinitionLinkDto(l));
			return <modes.DefinitionLink[]>data;
		} else {
			data.uri = URI.revive(data.uri);
			return <modes.DefinitionLink>data;
		}
	}

	private static _reviveWorkspaceSymbolDto(data: WorkspaceSymbolDto): search.IWorkspaceSymbol;
	private static _reviveWorkspaceSymbolDto(data: WorkspaceSymbolDto[]): search.IWorkspaceSymbol[];
	private static _reviveWorkspaceSymbolDto(data: WorkspaceSymbolDto | WorkspaceSymbolDto[]): search.IWorkspaceSymbol | search.IWorkspaceSymbol[] {
		if (!data) {
			return <search.IWorkspaceSymbol>data;
		} else if (Array.isArray(data)) {
			data.forEach(MainThreadLanguageFeatures._reviveWorkspaceSymbolDto);
			return <search.IWorkspaceSymbol[]>data;
		} else {
			data.location = MainThreadLanguageFeatures._reviveLocationDto(data.location);
			return <search.IWorkspaceSymbol>data;
		}
	}

	private static _reviveCodeActionDto(data: CodeActionDto[]): modes.CodeAction[] {
		if (data) {
			data.forEach(code => reviveWorkspaceEditDto(code.edit));
		}
		return <modes.CodeAction[]>data;
	}

	//#endregion

	// --- outline

	$registerOutlineSupport(handle: number, selector: ISerializedDocumentFilter[], displayName: string): void {
		this._registrations[handle] = modes.DocumentSymbolProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DocumentSymbolProvider>{
			displayName,
			provideDocumentSymbols: (model: ITextModel, token: CancellationToken): Promise<modes.DocumentSymbol[]> => {
				return this._proxy.$provideDocumentSymbols(handle, model.uri, token);
			}
		});
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: ISerializedDocumentFilter[], eventHandle: number): void {

		const provider = <modes.CodeLensProvider>{
			provideCodeLenses: (model: ITextModel, token: CancellationToken): modes.ICodeLensSymbol[] | Promise<modes.ICodeLensSymbol[]> => {
				return this._heapService.trackRecursive(this._proxy.$provideCodeLenses(handle, model.uri, token));
			},
			resolveCodeLens: (model: ITextModel, codeLens: modes.ICodeLensSymbol, token: CancellationToken): modes.ICodeLensSymbol | Promise<modes.ICodeLensSymbol> => {
				return this._heapService.trackRecursive(this._proxy.$resolveCodeLens(handle, model.uri, codeLens, token));
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<modes.CodeLensProvider>();
			this._registrations[eventHandle] = emitter;
			provider.onDidChange = emitter.event;
		}

		this._registrations[handle] = modes.CodeLensProviderRegistry.register(typeConverters.LanguageSelector.from(selector), provider);
	}

	$emitCodeLensEvent(eventHandle: number, event?: any): void {
		const obj = this._registrations[eventHandle];
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	// --- declaration

	$registerDefinitionSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DefinitionProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DefinitionProvider>{
			provideDefinition: (model, position, token): Promise<modes.DefinitionLink[]> => {
				return this._proxy.$provideDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveDefinitionLinkDto);
			}
		});
	}

	$registerDeclarationSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DeclarationProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DeclarationProvider>{
			provideDeclaration: (model, position, token) => {
				return this._proxy.$provideDeclaration(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveDefinitionLinkDto);
			}
		});
	}

	$registerImplementationSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.ImplementationProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.ImplementationProvider>{
			provideImplementation: (model, position, token): Promise<modes.Definition> => {
				return this._proxy.$provideImplementation(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveDefinitionLinkDto);
			}
		});
	}

	$registerTypeDefinitionSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.TypeDefinitionProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.TypeDefinitionProvider>{
			provideTypeDefinition: (model, position, token): Promise<modes.Definition> => {
				return this._proxy.$provideTypeDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveDefinitionLinkDto);
			}
		});
	}

	// --- extra info

	$registerHoverProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.HoverProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.HoverProvider>{
			provideHover: (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<modes.Hover> => {
				return this._proxy.$provideHover(handle, model.uri, position, token);
			}
		});
	}

	// --- occurrences

	$registerDocumentHighlightProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentHighlightProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DocumentHighlightProvider>{
			provideDocumentHighlights: (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<modes.DocumentHighlight[]> => {
				return this._proxy.$provideDocumentHighlights(handle, model.uri, position, token);
			}
		});
	}

	// --- references

	$registerReferenceSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.ReferenceProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.ReferenceProvider>{
			provideReferences: (model: ITextModel, position: EditorPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<modes.Location[]> => {
				return this._proxy.$provideReferences(handle, model.uri, position, context, token).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		});
	}

	// --- quick fix

	$registerQuickFixSupport(handle: number, selector: ISerializedDocumentFilter[], providedCodeActionKinds?: string[]): void {
		this._registrations[handle] = modes.CodeActionProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.CodeActionProvider>{
			provideCodeActions: (model: ITextModel, rangeOrSelection: EditorRange | Selection, context: modes.CodeActionContext, token: CancellationToken): Promise<modes.CodeAction[]> => {
				return this._heapService.trackRecursive(this._proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, context, token)).then(MainThreadLanguageFeatures._reviveCodeActionDto);
			},
			providedCodeActionKinds
		});
	}

	// --- formatting

	$registerDocumentFormattingSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentFormattingEditProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits: (model: ITextModel, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> => {
				return this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
			}
		});
	}

	$registerRangeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentRangeFormattingEditProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits: (model: ITextModel, range: EditorRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> => {
				return this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
			}
		});
	}

	$registerOnTypeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void {
		this._registrations[handle] = modes.OnTypeFormattingEditProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.OnTypeFormattingEditProvider>{

			autoFormatTriggerCharacters,

			provideOnTypeFormattingEdits: (model: ITextModel, position: EditorPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> => {
				return this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
			}
		});
	}

	// --- navigate type

	$registerNavigateTypeSupport(handle: number): void {
		let lastResultId: number;
		this._registrations[handle] = search.WorkspaceSymbolProviderRegistry.register(<search.IWorkspaceSymbolProvider>{
			provideWorkspaceSymbols: (search: string, token: CancellationToken): Promise<search.IWorkspaceSymbol[]> => {
				return this._proxy.$provideWorkspaceSymbols(handle, search, token).then(result => {
					if (lastResultId !== undefined) {
						this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
					}
					lastResultId = result._id;
					return MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(result.symbols);
				});
			},
			resolveWorkspaceSymbol: (item: search.IWorkspaceSymbol, token: CancellationToken): Promise<search.IWorkspaceSymbol> => {
				return this._proxy.$resolveWorkspaceSymbol(handle, item, token).then(i => MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(i));
			}
		});
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: ISerializedDocumentFilter[], supportResolveLocation: boolean): void {

		this._registrations[handle] = modes.RenameProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.RenameProvider>{
			provideRenameEdits: (model: ITextModel, position: EditorPosition, newName: string, token: CancellationToken): Promise<modes.WorkspaceEdit> => {
				return this._proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then(reviveWorkspaceEditDto);
			},
			resolveRenameLocation: supportResolveLocation
				? (model: ITextModel, position: EditorPosition, token: CancellationToken): Promise<modes.RenameLocation> => this._proxy.$resolveRenameLocation(handle, model.uri, position, token)
				: undefined
		});
	}

	// --- suggest

	$registerSuggestSupport(handle: number, selector: ISerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void {
		this._registrations[handle] = modes.CompletionProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.CompletionItemProvider>{
			triggerCharacters,
			provideCompletionItems: (model: ITextModel, position: EditorPosition, context: modes.CompletionContext, token: CancellationToken): Promise<modes.CompletionList> => {
				return this._proxy.$provideCompletionItems(handle, model.uri, position, context, token).then(result => {
					if (!result) {
						return result;
					}
					return {
						suggestions: result.suggestions,
						incomplete: result.incomplete,
						dispose: () => this._proxy.$releaseCompletionItems(handle, result._id)
					};
				});
			},
			resolveCompletionItem: supportsResolveDetails
				? (model, position, suggestion, token) => this._proxy.$resolveCompletionItem(handle, model.uri, position, suggestion, token)
				: undefined
		});
	}

	// --- parameter hints

	$registerSignatureHelpProvider(handle: number, selector: ISerializedDocumentFilter[], metadata: ISerializedSignatureHelpProviderMetadata): void {
		this._registrations[handle] = modes.SignatureHelpProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.SignatureHelpProvider>{

			signatureHelpTriggerCharacters: metadata.triggerCharacters,
			signatureHelpRetriggerCharacters: metadata.retriggerCharacters,

			provideSignatureHelp: (model: ITextModel, position: EditorPosition, token: CancellationToken, context: modes.SignatureHelpContext): Promise<modes.SignatureHelp> => {
				return this._proxy.$provideSignatureHelp(handle, model.uri, position, context, token);
			}
		});
	}

	// --- links

	$registerDocumentLinkProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.LinkProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.LinkProvider>{
			provideLinks: (model, token) => {
				return this._heapService.trackRecursive(this._proxy.$provideDocumentLinks(handle, model.uri, token));
			},
			resolveLink: (link, token) => {
				return this._proxy.$resolveDocumentLink(handle, link, token);
			}
		});
	}

	// --- colors

	$registerDocumentColorProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		const proxy = this._proxy;
		this._registrations[handle] = modes.ColorProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.DocumentColorProvider>{
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
		});
	}

	// --- folding

	$registerFoldingRangeProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		const proxy = this._proxy;
		this._registrations[handle] = modes.FoldingRangeProviderRegistry.register(typeConverters.LanguageSelector.from(selector), <modes.FoldingRangeProvider>{
			provideFoldingRanges: (model, context, token) => {
				return proxy.$provideFoldingRanges(handle, model.uri, context, token);
			}
		});
	}

	// -- smart select

	$registerSelectionRangeProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.SelectionRangeRegistry.register(typeConverters.LanguageSelector.from(selector), {
			provideSelectionRanges: (model, position, token) => {
				return this._proxy.$provideSelectionRanges(handle, model.uri, position, token);
			}
		});
	}

	// --- configuration

	private static _reviveRegExp(regExp: ISerializedRegExp): RegExp {
		if (typeof regExp === 'undefined') {
			return undefined;
		}
		if (regExp === null) {
			return null;
		}
		return new RegExp(regExp.pattern, regExp.flags);
	}

	private static _reviveIndentationRule(indentationRule: ISerializedIndentationRule): IndentationRule {
		if (typeof indentationRule === 'undefined') {
			return undefined;
		}
		if (indentationRule === null) {
			return null;
		}
		return {
			decreaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.decreaseIndentPattern),
			increaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.increaseIndentPattern),
			indentNextLinePattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.indentNextLinePattern),
			unIndentedLinePattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.unIndentedLinePattern),
		};
	}

	private static _reviveOnEnterRule(onEnterRule: ISerializedOnEnterRule): OnEnterRule {
		return {
			beforeText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.beforeText),
			afterText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.afterText),
			oneLineAboveText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.oneLineAboveText),
			action: onEnterRule.action
		};
	}

	private static _reviveOnEnterRules(onEnterRules: ISerializedOnEnterRule[]): OnEnterRule[] {
		if (typeof onEnterRules === 'undefined') {
			return undefined;
		}
		if (onEnterRules === null) {
			return null;
		}
		return onEnterRules.map(MainThreadLanguageFeatures._reviveOnEnterRule);
	}

	$setLanguageConfiguration(handle: number, languageId: string, _configuration: ISerializedLanguageConfiguration): void {

		let configuration: LanguageConfiguration = {
			comments: _configuration.comments,
			brackets: _configuration.brackets,
			wordPattern: MainThreadLanguageFeatures._reviveRegExp(_configuration.wordPattern),
			indentationRules: MainThreadLanguageFeatures._reviveIndentationRule(_configuration.indentationRules),
			onEnterRules: MainThreadLanguageFeatures._reviveOnEnterRules(_configuration.onEnterRules),

			autoClosingPairs: null,
			surroundingPairs: null,
			__electricCharacterSupport: null
		};

		if (_configuration.__characterPairSupport) {
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

		let languageIdentifier = this._modeService.getLanguageIdentifier(languageId);
		if (languageIdentifier) {
			this._registrations[handle] = LanguageConfigurationRegistry.register(languageIdentifier, configuration);
		}
	}

}
