/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import * as vscode from 'vscode';
import { IReadOnlyModel, ISingleEditOperation } from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import { WorkspaceSymbolProviderRegistry, IWorkspaceSymbolProvider, IWorkspaceSymbol } from 'vs/workbench/parts/search/common/search';
import { always, wireCancellationToken } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Position as EditorPosition } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { ExtHostContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape } from './extHost.protocol';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LanguageConfiguration } from 'vs/editor/common/modes/languageConfiguration';
import { IHeapService } from './mainThreadHeapService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MainThreadHandlerRegistry } from 'vs/workbench/api/node/mainThreadHandlerRegistry';

export class MainThreadLanguageFeatures extends MainThreadLanguageFeaturesShape {

	private _proxy: ExtHostLanguageFeaturesShape;
	private _heapService: IHeapService;
	private _modeService: IModeService;
	private _registrations: { [handle: number]: IDisposable; } = Object.create(null);

	/**
	 * Maintains a collection of callbacks for ongoing requests.
	 * Currently, provideReferences is the only call that saves a callback for reporting progress,
	 * but other methods may use this to register callbacks as well.
	 */
	private _callbackRegistrations = new MainThreadHandlerRegistry<(value: any) => void>();

	constructor(
		@IThreadService threadService: IThreadService,
		@IHeapService heapService: IHeapService,
		@IModeService modeService: IModeService,
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostLanguageFeatures);
		this._heapService = heapService;
		this._modeService = modeService;
	}

	$unregister(handle: number): TPromise<any> {
		let registration = this._registrations[handle];
		if (registration) {
			registration.dispose();
			delete this._registrations[handle];
			this._callbackRegistrations.unregister(handle);
		}
		return undefined;
	}

	// --- outline

	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.DocumentSymbolProviderRegistry.register(selector, <modes.DocumentSymbolProvider>{
			provideDocumentSymbols: (model: IReadOnlyModel, token: CancellationToken): Thenable<modes.SymbolInformation[]> => {
				return wireCancellationToken(token, this._proxy.$provideDocumentSymbols(handle, model.uri));
			}
		});
		return undefined;
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector, eventHandle: number): TPromise<any> {

		const provider = <modes.CodeLensProvider>{
			provideCodeLenses: (model: IReadOnlyModel, token: CancellationToken): modes.ICodeLensSymbol[] | Thenable<modes.ICodeLensSymbol[]> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideCodeLenses(handle, model.uri)));
			},
			resolveCodeLens: (model: IReadOnlyModel, codeLens: modes.ICodeLensSymbol, token: CancellationToken): modes.ICodeLensSymbol | Thenable<modes.ICodeLensSymbol> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$resolveCodeLens(handle, model.uri, codeLens)));
			}
		};

		if (typeof eventHandle === 'number') {
			const emitter = new Emitter<modes.CodeLensProvider>();
			this._registrations[eventHandle] = emitter;
			provider.onDidChange = emitter.event;
		}

		this._registrations[handle] = modes.CodeLensProviderRegistry.register(selector, provider);
		return undefined;
	}

	$emitCodeLensEvent(eventHandle: number, event?: any): TPromise<any> {
		const obj = this._registrations[eventHandle];
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
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

	$registerImplementationSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.ImplementationProviderRegistry.register(selector, <modes.ImplementationProvider>{
			provideImplementation: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideImplementation(handle, model.uri, position));
			}
		});
		return undefined;
	}

	$registerTypeDefinitionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.TypeDefinitionProviderRegistry.register(selector, <modes.TypeDefinitionProvider>{
			provideTypeDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._proxy.$provideTypeDefinition(handle, model.uri, position));
			}
		});
		return undefined;
	}

	// --- extra info

	$registerHoverProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.HoverProviderRegistry.register(selector, <modes.HoverProvider>{
			provideHover: (model: IReadOnlyModel, position: EditorPosition, token: CancellationToken): Thenable<modes.Hover> => {
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
			provideReferences: (model: IReadOnlyModel, position: EditorPosition, context: modes.ReferenceContext, token: CancellationToken, progress: (locations: modes.Location[]) => void): Thenable<modes.Location[]> => {
				const progressHandle = this._callbackRegistrations.registerChild(handle, progress);
				let refs = this._proxy.$provideReferences(handle, progressHandle, model.uri, position, context);
				refs = always(refs, () => this._callbackRegistrations.unregisterChild(handle, progressHandle));
				return wireCancellationToken(token, refs);
			}
		});
		return undefined;
	}

	$notifyProvideReferencesProgress(handle: number, progressHandle: number, locations: modes.Location[]): TPromise<any> {
		const progressHandler = this._callbackRegistrations.getChild(handle, progressHandle);
		if (progressHandler) {
			progressHandler(locations);
		}
		return undefined;
	}

	// --- quick fix

	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.CodeActionProviderRegistry.register(selector, <modes.CodeActionProvider>{
			provideCodeActions: (model: IReadOnlyModel, range: EditorRange, token: CancellationToken): Thenable<modes.CodeAction[]> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideCodeActions(handle, model.uri, range)));
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
		this._registrations[handle] = WorkspaceSymbolProviderRegistry.register(<IWorkspaceSymbolProvider>{
			provideWorkspaceSymbols: (search: string): TPromise<IWorkspaceSymbol[]> => {
				return this._heapService.trackRecursive(this._proxy.$provideWorkspaceSymbols(handle, search));
			},
			resolveWorkspaceSymbol: (item: IWorkspaceSymbol): TPromise<IWorkspaceSymbol> => {
				return this._proxy.$resolveWorkspaceSymbol(handle, item);
			}
		});
		return undefined;
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.RenameProviderRegistry.register(selector, <modes.RenameProvider>{
			provideRenameEdits: (model: IReadOnlyModel, position: EditorPosition, newName: string, token: CancellationToken): Thenable<modes.WorkspaceEdit> => {
				return wireCancellationToken(token, this._proxy.$provideRenameEdits(handle, model.uri, position, newName));
			}
		});
		return undefined;
	}

	// --- suggest

	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[]): TPromise<any> {
		this._registrations[handle] = modes.SuggestRegistry.register(selector, <modes.ISuggestSupport>{
			triggerCharacters,
			provideCompletionItems: (model: IReadOnlyModel, position: EditorPosition, token: CancellationToken): Thenable<modes.ISuggestResult> => {
				return this._heapService.trackRecursive(wireCancellationToken(token, this._proxy.$provideCompletionItems(handle, model.uri, position)));
			},
			resolveCompletionItem: (model: IReadOnlyModel, position: EditorPosition, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> => {
				return wireCancellationToken(token, this._proxy.$resolveCompletionItem(handle, model.uri, position, suggestion));
			}
		});
		return undefined;
	}

	// --- parameter hints

	$registerSignatureHelpProvider(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any> {
		this._registrations[handle] = modes.SignatureHelpProviderRegistry.register(selector, <modes.SignatureHelpProvider>{

			signatureHelpTriggerCharacters: triggerCharacter,

			provideSignatureHelp: (model: IReadOnlyModel, position: EditorPosition, token: CancellationToken): Thenable<modes.SignatureHelp> => {
				return wireCancellationToken(token, this._proxy.$provideSignatureHelp(handle, model.uri, position));
			}

		});
		return undefined;
	}

	// --- links

	$registerDocumentLinkProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = modes.LinkProviderRegistry.register(selector, <modes.LinkProvider>{
			provideLinks: (model, token) => {
				return wireCancellationToken(token, this._proxy.$provideDocumentLinks(handle, model.uri));
			},
			resolveLink: (link, token) => {
				return wireCancellationToken(token, this._proxy.$resolveDocumentLink(handle, link));
			}
		});
		return undefined;
	}

	// --- configuration

	$setLanguageConfiguration(handle: number, languageId: string, _configuration: vscode.LanguageConfiguration): TPromise<any> {

		let configuration: LanguageConfiguration = {
			comments: _configuration.comments,
			brackets: _configuration.brackets,
			wordPattern: _configuration.wordPattern,
			indentationRules: _configuration.indentationRules,
			onEnterRules: _configuration.onEnterRules,

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

		return undefined;
	}

}
