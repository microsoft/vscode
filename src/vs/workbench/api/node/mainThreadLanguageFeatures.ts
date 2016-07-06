/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import * as vscode from 'vscode';
import {IReadOnlyModel, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {NavigateTypesSupportRegistry, INavigateTypesSupport, ITypeBearing} from 'vs/workbench/parts/search/common/search';
import {wireCancellationToken} from 'vs/base/common/async';
import {CancellationToken} from 'vs/base/common/cancellation';
import {Position as EditorPosition} from 'vs/editor/common/core/position';
import {Range as EditorRange} from 'vs/editor/common/core/range';
import {ExtHostContext, ExtHostLanguageFeaturesShape} from './extHostProtocol';
import {LanguageConfigurationRegistry, LanguageConfiguration} from 'vs/editor/common/modes/languageConfigurationRegistry';

export class MainThreadLanguageFeatures {

	private _proxy: ExtHostLanguageFeaturesShape;
	private _registrations: { [handle: number]: IDisposable; } = Object.create(null);

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.get(ExtHostContext.ExtHostLanguageFeatures);
	}

	$unregister(handle: number): TPromise<any> {
		let registration = this._registrations[handle];
		if (registration) {
			registration.dispose();
			delete this._registrations[handle];
		}
		return undefined;
	}

	// --- outline

	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DocumentSymbolProviderRegistry.register(selector, <modes.DocumentSymbolProvider>{
			provideDocumentSymbols: (model:IReadOnlyModel, token: CancellationToken): Thenable<modes.SymbolInformation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentSymbols(handle, model.uri));
			}
		});
		return undefined;
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.CodeLensProviderRegistry.register(selector, <modes.CodeLensProvider>{
			provideCodeLenses: (model:IReadOnlyModel, token: CancellationToken): modes.ICodeLensSymbol[] | Thenable<modes.ICodeLensSymbol[]> => {
				return wireCancellationToken(token, this._proxy.$provideCodeLenses(handle, model.uri));
			},
			resolveCodeLens: (model:IReadOnlyModel, codeLens: modes.ICodeLensSymbol, token: CancellationToken): modes.ICodeLensSymbol | Thenable<modes.ICodeLensSymbol> => {
				return wireCancellationToken(token, this._proxy.$resolveCodeLens(handle, model.uri, codeLens));
			}
		});
		return undefined;
	}

	// --- declaration

	$registerDeclaractionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DefinitionProviderRegistry.register(selector, <modes.DefinitionProvider>{
			provideDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideDefinition(handle, model.uri, position));
			}
		});
		return undefined;
	}

	// --- extra info

	$registerHoverProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.HoverProviderRegistry.register(selector, <modes.HoverProvider>{
			provideHover: (model:IReadOnlyModel, position:EditorPosition, token:CancellationToken): Thenable<modes.Hover> => {
				return wireCancellationToken(token, this._proxy.$provideHover(handle, model.uri, position));
			}
		});
		return undefined;
	}

	// --- occurrences

	$registerDocumentHighlightProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DocumentHighlightProviderRegistry.register(selector, <modes.DocumentHighlightProvider>{
			provideDocumentHighlights: (model: IReadOnlyModel, position: EditorPosition, token: CancellationToken): Thenable<modes.DocumentHighlight[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentHighlights(handle, model.uri, position));
			}
		});
		return undefined;
	}

	// --- references

	$registerReferenceSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.ReferenceProviderRegistry.register(selector, <modes.ReferenceProvider>{
			provideReferences: (model:IReadOnlyModel, position:EditorPosition, context: modes.ReferenceContext, token: CancellationToken): Thenable<modes.Location[]> => {
				return wireCancellationToken(token, this._proxy.$provideReferences(handle, model.uri, position, context));
			}
		});
		return undefined;
	}

	// --- quick fix

	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.CodeActionProviderRegistry.register(selector, <modes.CodeActionProvider>{
			provideCodeActions: (model:IReadOnlyModel, range:EditorRange, token: CancellationToken): Thenable<modes.CodeAction[]> => {
				return wireCancellationToken(token, this._proxy.$provideCodeActions(handle, model.uri, range));
			}
		});
		return undefined;
	}

	// --- formatting

	$registerDocumentFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DocumentFormattingEditProviderRegistry.register(selector, <modes.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits: (model: IReadOnlyModel, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options));
			}
		});
		return undefined;
	}

	$registerRangeFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DocumentRangeFormattingEditProviderRegistry.register(selector, <modes.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits: (model: IReadOnlyModel, range: EditorRange, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options));
			}
		});
		return undefined;
	}

	$registerOnTypeFormattingSupport(handle: number, selector: vscode.DocumentSelector, autoFormatTriggerCharacters: string[]): TPromise<any> {
		this._registrations[handle] = modes.OnTypeFormattingEditProviderRegistry.register(selector, <modes.OnTypeFormattingEditProvider>{

			autoFormatTriggerCharacters,

			provideOnTypeFormattingEdits: (model: IReadOnlyModel, position: EditorPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options));
			}
		});
		return undefined;
	}

	// --- navigate type

	$registerNavigateTypeSupport(handle: number): TPromise<any> {
		this._registrations[handle] = NavigateTypesSupportRegistry.register(<INavigateTypesSupport>{
			getNavigateToItems: (search: string): TPromise<ITypeBearing[]> => {
				return this._proxy.$getNavigateToItems(handle, search);
			}
		});
		return undefined;
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.RenameProviderRegistry.register(selector, <modes.RenameProvider>{
			provideRenameEdits: (model:IReadOnlyModel, position:EditorPosition, newName: string, token: CancellationToken): Thenable<modes.WorkspaceEdit> => {
				return wireCancellationToken(token, this._proxy.$provideRenameEdits(handle, model.uri, position, newName));
			}
		});
		return undefined;
	}

	// --- suggest

	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[]): TPromise<any> {
		this._registrations[handle] = modes.SuggestRegistry.register(selector, <modes.ISuggestSupport>{
			triggerCharacters: triggerCharacters,
			shouldAutotriggerSuggest: true,
			provideCompletionItems: (model:IReadOnlyModel, position:EditorPosition, token:CancellationToken): Thenable<modes.ISuggestResult[]> => {
				return wireCancellationToken(token, this._proxy.$provideCompletionItems(handle, model.uri, position));
			},
			resolveCompletionItem: (model:IReadOnlyModel, position:EditorPosition, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> => {
				return wireCancellationToken(token, this._proxy.$resolveCompletionItem(handle, model.uri, position, suggestion));
			}
		});
		return undefined;
	}

	// --- parameter hints

	$registerSignatureHelpProvider(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any> {
		this._registrations[handle] = modes.SignatureHelpProviderRegistry.register(selector, <modes.SignatureHelpProvider>{

			signatureHelpTriggerCharacters: triggerCharacter,

			provideSignatureHelp: (model:IReadOnlyModel, position:EditorPosition, token:CancellationToken): Thenable<modes.SignatureHelp> => {
				return wireCancellationToken(token, this._proxy.$provideSignatureHelp(handle, model.uri, position));
			}

		});
		return undefined;
	}

	// --- configuration

	$setLanguageConfiguration(handle: number, languageId: string, configuration: vscode.LanguageConfiguration): TPromise<any> {

		if (configuration.__characterPairSupport) {
			(<LanguageConfiguration> configuration).autoClosingPairs = configuration.__characterPairSupport.autoClosingPairs;
		}

		this._registrations[handle] = LanguageConfigurationRegistry.register(languageId, configuration);
		return undefined;
	}

}
