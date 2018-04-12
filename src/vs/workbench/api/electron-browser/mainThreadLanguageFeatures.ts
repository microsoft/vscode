/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { ITextModel, ISingleEditOperation } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { WorkspaceSymbolProviderRegistry, IWorkspaceSymbolProvider } from 'vs/workbench/parts/search/common/search';
import { wireCancellationToken } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Position as EditorPosition } from 'vs/editor/common/core/position';
import { Range as EditorRange, IRange } from 'vs/editor/common/core/range';
import { ExtHostContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape, MainContext, IExtHostContext, ISerializedLanguageConfiguration, ISerializedRegExp, ISerializedIndentationRule, ISerializedOnEnterRule, LocationDto, SymbolInformationDto, CodeActionDto, reviveWorkspaceEditDto, ISerializedDocumentFilter } from '../node/extHost.protocol';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LanguageConfiguration, IndentationRule, OnEnterRule } from 'vs/editor/common/modes/languageConfiguration';
import { IHeapService } from './mainThreadHeapService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { toLanguageSelector } from 'vs/workbench/api/node/extHostTypeConverters';
import URI from 'vs/base/common/uri';

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

	private static _reviveSymbolInformationDto(data: SymbolInformationDto): modes.SymbolInformation;
	private static _reviveSymbolInformationDto(data: SymbolInformationDto[]): modes.SymbolInformation[];
	private static _reviveSymbolInformationDto(data: SymbolInformationDto | SymbolInformationDto[]): modes.SymbolInformation | modes.SymbolInformation[] {
		if (!data) {
			return <modes.SymbolInformation>data;
		} else if (Array.isArray(data)) {
			data.forEach(MainThreadLanguageFeatures._reviveSymbolInformationDto);
			return <modes.SymbolInformation[]>data;
		} else {
			data.location = MainThreadLanguageFeatures._reviveLocationDto(data.location);
			return <modes.SymbolInformation>data;
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

	$registerOutlineSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentSymbolProviderRegistry.register(toLanguageSelector(selector), <modes.DocumentSymbolProvider>{
			provideDocumentSymbols: (model: ITextModel, token: CancellationToken): Thenable<modes.SymbolInformation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentSymbols(handle, model.uri)).then(MainThreadLanguageFeatures._reviveSymbolInformationDto);
			}
		});
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: ISerializedDocumentFilter[], eventHandle: number): void {

		const provider = <modes.CodeLensProvider>{
			provideCodeLenses: (model: ITextModel, token: CancellationToken): modes.ICodeLensSymbol[] | Thenable<modes.ICodeLensSymbol[]> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideCodeLenses(handle, model.uri)));
			},
			resolveCodeLens: (model: ITextModel, codeLens: modes.ICodeLensSymbol, token: CancellationToken): modes.ICodeLensSymbol | Thenable<modes.ICodeLensSymbol> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$resolveCodeLens(handle, model.uri, codeLens)));
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<modes.CodeLensProvider>();
			this._registrations[eventHandle] = emitter;
			provider.onDidChange = emitter.event;
		}

		this._registrations[handle] = modes.CodeLensProviderRegistry.register(toLanguageSelector(selector), provider);
	}

	$emitCodeLensEvent(eventHandle: number, event?: any): void {
		const obj = this._registrations[eventHandle];
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	// --- declaration

	$registerDeclaractionSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DefinitionProviderRegistry.register(toLanguageSelector(selector), <modes.DefinitionProvider>{
			provideDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideDefinition(handle, model.uri, position)).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		});
	}

	$registerImplementationSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.ImplementationProviderRegistry.register(toLanguageSelector(selector), <modes.ImplementationProvider>{
			provideImplementation: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideImplementation(handle, model.uri, position)).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		});
	}

	$registerTypeDefinitionSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.TypeDefinitionProviderRegistry.register(toLanguageSelector(selector), <modes.TypeDefinitionProvider>{
			provideTypeDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideTypeDefinition(handle, model.uri, position)).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		});
	}

	// --- extra info

	$registerHoverProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.HoverProviderRegistry.register(toLanguageSelector(selector), <modes.HoverProvider>{
			provideHover: (model: ITextModel, position: EditorPosition, token: CancellationToken): Thenable<modes.Hover> => {
				return wireCancellationToken(token, this._proxy.$provideHover(handle, model.uri, position));
			}
		});
	}

	// --- occurrences

	$registerDocumentHighlightProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentHighlightProviderRegistry.register(toLanguageSelector(selector), <modes.DocumentHighlightProvider>{
			provideDocumentHighlights: (model: ITextModel, position: EditorPosition, token: CancellationToken): Thenable<modes.DocumentHighlight[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentHighlights(handle, model.uri, position));
			}
		});
	}

	// --- references

	$registerReferenceSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.ReferenceProviderRegistry.register(toLanguageSelector(selector), <modes.ReferenceProvider>{
			provideReferences: (model: ITextModel, position: EditorPosition, context: modes.ReferenceContext, token: CancellationToken): Thenable<modes.Location[]> => {
				return wireCancellationToken(token, this._proxy.$provideReferences(handle, model.uri, position, context)).then(MainThreadLanguageFeatures._reviveLocationDto);
			}
		});
	}

	// --- quick fix

	$registerQuickFixSupport(handle: number, selector: ISerializedDocumentFilter[], providedCodeActionKinds?: string[]): void {
		this._registrations[handle] = modes.CodeActionProviderRegistry.register(toLanguageSelector(selector), <modes.CodeActionProvider>{
			provideCodeActions: (model: ITextModel, range: EditorRange, context: modes.CodeActionContext, token: CancellationToken): Thenable<modes.CodeAction[]> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideCodeActions(handle, model.uri, range, context))).then(MainThreadLanguageFeatures._reviveCodeActionDto);
			},
			providedCodeActionKinds
		});
	}

	// --- formatting

	$registerDocumentFormattingSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentFormattingEditProviderRegistry.register(toLanguageSelector(selector), <modes.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits: (model: ITextModel, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options));
			}
		});
	}

	$registerRangeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.DocumentRangeFormattingEditProviderRegistry.register(toLanguageSelector(selector), <modes.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits: (model: ITextModel, range: EditorRange, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options));
			}
		});
	}

	$registerOnTypeFormattingSupport(handle: number, selector: ISerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void {
		this._registrations[handle] = modes.OnTypeFormattingEditProviderRegistry.register(toLanguageSelector(selector), <modes.OnTypeFormattingEditProvider>{

			autoFormatTriggerCharacters,

			provideOnTypeFormattingEdits: (model: ITextModel, position: EditorPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options));
			}
		});
	}

	// --- navigate type

	$registerNavigateTypeSupport(handle: number): void {
		let lastResultId: number;
		this._registrations[handle] = WorkspaceSymbolProviderRegistry.register(<IWorkspaceSymbolProvider>{
			provideWorkspaceSymbols: (search: string): TPromise<modes.SymbolInformation[]> => {
				return this._proxy.$provideWorkspaceSymbols(handle, search).then(result => {
					if (lastResultId !== undefined) {
						this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
					}
					lastResultId = result._id;
					return MainThreadLanguageFeatures._reviveSymbolInformationDto(result.symbols);
				});
			},
			resolveWorkspaceSymbol: (item: modes.SymbolInformation): TPromise<modes.SymbolInformation> => {
				return this._proxy.$resolveWorkspaceSymbol(handle, item).then(i => MainThreadLanguageFeatures._reviveSymbolInformationDto(i));
			}
		});
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: ISerializedDocumentFilter[], supportResolveLocation: boolean): void {

		this._registrations[handle] = modes.RenameProviderRegistry.register(toLanguageSelector(selector), <modes.RenameProvider>{
			provideRenameEdits: (model: ITextModel, position: EditorPosition, newName: string, token: CancellationToken): Thenable<modes.WorkspaceEdit> => {
				return wireCancellationToken(token, this._proxy.$provideRenameEdits(handle, model.uri, position, newName)).then(reviveWorkspaceEditDto);
			},
			resolveRenameLocation: supportResolveLocation
				? (model: ITextModel, position: EditorPosition, token: CancellationToken): Thenable<IRange> => wireCancellationToken(token, this._proxy.$resolveRenameLocation(handle, model.uri, position))
				: undefined
		});
	}

	// --- suggest

	$registerSuggestSupport(handle: number, selector: ISerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void {
		this._registrations[handle] = modes.SuggestRegistry.register(toLanguageSelector(selector), <modes.ISuggestSupport>{
			triggerCharacters,
			provideCompletionItems: (model: ITextModel, position: EditorPosition, context: modes.SuggestContext, token: CancellationToken): Thenable<modes.ISuggestResult> => {
				return wireCancellationToken(token, this._proxy.$provideCompletionItems(handle, model.uri, position, context)).then(result => {
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
				? (model, position, suggestion, token) => wireCancellationToken(token, this._proxy.$resolveCompletionItem(handle, model.uri, position, suggestion))
				: undefined
		});
	}

	// --- parameter hints

	$registerSignatureHelpProvider(handle: number, selector: ISerializedDocumentFilter[], triggerCharacter: string[]): void {
		this._registrations[handle] = modes.SignatureHelpProviderRegistry.register(toLanguageSelector(selector), <modes.SignatureHelpProvider>{

			signatureHelpTriggerCharacters: triggerCharacter,

			provideSignatureHelp: (model: ITextModel, position: EditorPosition, token: CancellationToken): Thenable<modes.SignatureHelp> => {
				return wireCancellationToken(token, this._proxy.$provideSignatureHelp(handle, model.uri, position));
			}

		});
	}

	// --- links

	$registerDocumentLinkProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		this._registrations[handle] = modes.LinkProviderRegistry.register(toLanguageSelector(selector), <modes.LinkProvider>{
			provideLinks: (model, token) => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideDocumentLinks(handle, model.uri)));
			},
			resolveLink: (link, token) => {
				return wireCancellationToken(token, this._proxy.$resolveDocumentLink(handle, link));
			}
		});
	}

	// --- colors

	$registerDocumentColorProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		const proxy = this._proxy;
		this._registrations[handle] = modes.ColorProviderRegistry.register(toLanguageSelector(selector), <modes.DocumentColorProvider>{
			provideDocumentColors: (model, token) => {
				return wireCancellationToken(token, proxy.$provideDocumentColors(handle, model.uri))
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
				return wireCancellationToken(token, proxy.$provideColorPresentations(handle, model.uri, {
					color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha],
					range: colorInfo.range
				}));
			}
		});
	}

	// --- folding

	$registerFoldingProvider(handle: number, selector: ISerializedDocumentFilter[]): void {
		const proxy = this._proxy;
		this._registrations[handle] = modes.FoldingProviderRegistry.register(toLanguageSelector(selector), <modes.FoldingProvider>{
			provideFoldingRanges: (model, context, token) => {
				return wireCancellationToken(token, proxy.$provideFoldingRanges(handle, model.uri, context));
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
