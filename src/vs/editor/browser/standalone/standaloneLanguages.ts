/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IDisposable} from 'vs/base/common/lifecycle';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {Extensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {Registry} from 'vs/platform/platform';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {IMonarchLanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import {ensureStaticPlatformServices} from 'vs/editor/browser/standalone/standaloneServices';
import * as modes from 'vs/editor/common/modes';
import {startup} from './standaloneCodeEditor';
import {IRichLanguageConfiguration} from 'vs/editor/common/modes/languageConfigurationRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {CancellationToken} from 'vs/base/common/cancellation';
import {toThenable} from 'vs/base/common/async';
import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';

export function register(language:ILanguageExtensionPoint): void {
	ModesRegistry.registerLanguage(language);
}

export function getLanguages(): ILanguageExtensionPoint[] {
	let result:ILanguageExtensionPoint[] = [];
	result = result.concat(ModesRegistry.getLanguages());
	result = result.concat(ModesRegistry.getCompatModes());
	return result;
}

export function onLanguage(languageId:string, callback:()=>void): IDisposable {
	let isDisposed = false;
	ExtensionsRegistry.registerOneTimeActivationEventListener('onLanguage:' + languageId, () => {
		if (!isDisposed) {
			callback();
		}
	});
	return {
		dispose: () => { isDisposed = true; }
	};
}

export function setLanguageConfiguration(languageId:string, configuration:IRichLanguageConfiguration): IDisposable {
	return LanguageConfigurationRegistry.register(languageId, configuration);
}

export function setTokensProvider(languageId:string, support:modes.TokensProvider): IDisposable {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	return staticPlatformServices.modeService.registerTokenizationSupport2(languageId, support);
}

export function setMonarchTokensProvider(languageId:string, languageDef:IMonarchLanguage): IDisposable {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	let lexer = compile(languageId, languageDef);
	let modeService = staticPlatformServices.modeService;

	return modeService.registerTokenizationSupport(languageId, (mode) => {
		return createTokenizationSupport(modeService, mode, lexer);
	});
}

export function registerReferenceProvider(languageId:string, support:modes.ReferenceProvider): IDisposable {
	return modes.ReferenceProviderRegistry.register(languageId, support);
}

export function registerRenameProvider(languageId:string, support:modes.RenameProvider): IDisposable {
	return modes.RenameProviderRegistry.register(languageId, support);
}

export enum CompletionItemKind {
	Text,
	Method,
	Function,
	Constructor,
	Field,
	Variable,
	Class,
	Interface,
	Module,
	Property,
	Unit,
	Value,
	Enum,
	Keyword,
	Snippet,
	Color,
	File,
	Reference
}
export interface CompletionItem {
	label: string;
	kind: CompletionItemKind;
	detail?: string;
	documentation?: string;
	sortText?: string;
	filterText?: string;
	insertText?: string;
	textEdit?: editorCommon.ISingleEditOperation;
}
export interface CompletionList {
	isIncomplete?: boolean;
	items: CompletionItem[];
}
export interface CompletionItemProvider {
	triggerCharacters?: string[];
	provideCompletionItems(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList>;
	resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem>;
}

export function registerCompletionItemProvider(languageId:string, provider:CompletionItemProvider): IDisposable {
	let adapter = new SuggestAdapter(provider);
	return modes.SuggestRegistry.register(languageId, {
		triggerCharacters: provider.triggerCharacters,
		shouldAutotriggerSuggest: true,
		provideCompletionItems: (model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Thenable<modes.ISuggestResult[]> => {
			return adapter.provideCompletionItems(model, position, token);
		},
		resolveCompletionItem: (model:editorCommon.IReadOnlyModel, position:Position, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> => {
			return adapter.resolveCompletionItem(model, position, suggestion, token);
		}
	});
}
interface ISuggestion2 extends modes.ISuggestion {
	_actual: CompletionItem;
}
function convertKind(kind: CompletionItemKind): modes.SuggestionType {
	switch (kind) {
		case CompletionItemKind.Function: return 'function';
		case CompletionItemKind.Constructor: return 'constructor';
		case CompletionItemKind.Field: return 'field';
		case CompletionItemKind.Variable: return 'variable';
		case CompletionItemKind.Class: return 'class';
		case CompletionItemKind.Interface: return 'interface';
		case CompletionItemKind.Module: return 'module';
		case CompletionItemKind.Property: return 'property';
		case CompletionItemKind.Unit: return 'unit';
		case CompletionItemKind.Value: return 'value';
		case CompletionItemKind.Enum: return 'enum';
		case CompletionItemKind.Keyword: return 'keyword';
		case CompletionItemKind.Snippet: return 'snippet';
		case CompletionItemKind.Text: return 'text';
		case CompletionItemKind.Color: return 'color';
		case CompletionItemKind.File: return 'file';
		case CompletionItemKind.Reference: return 'reference';
	}
	return 'property';
}
class SuggestAdapter {

	private _provider: CompletionItemProvider;

	constructor(provider: CompletionItemProvider) {
		this._provider = provider;
	}

	private static from(item:CompletionItem): ISuggestion2 {
		return {
			_actual: item,
			label: item.label,
			codeSnippet: item.insertText || item.label,
			type: convertKind(item.kind),
			typeLabel: item.detail,
			documentationLabel: item.documentation,
			sortText: item.sortText,
			filterText: item.filterText
		};
	}

	provideCompletionItems(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Thenable<modes.ISuggestResult[]> {
		const ran = model.getWordAtPosition(position);

		return toThenable<CompletionItem[]|CompletionList>(this._provider.provideCompletionItems(model, position, token)).then(value => {
			let list: CompletionList;
			if (Array.isArray(value)) {
				list = {
					items: value,
					isIncomplete: false
				};
			} else if (typeof value === 'object' && Array.isArray(value.items)) {
				list = value;
			} else if (!value) {
				// undefined and null are valid results
				return;
			} else {
				// warn about everything else
				console.warn('INVALID result from completion provider. expected CompletionItem-array or CompletionList but got:', value);
			}

			let defaultSuggestions: modes.ISuggestResult = {
				suggestions: [],
				currentWord: ran ? model.getValueInRange(new Range(position.lineNumber, ran.startColumn, position.lineNumber, ran.endColumn)) : '',
			};
			let allSuggestions: modes.ISuggestResult[] = [defaultSuggestions];

			for (let i = 0; i < list.items.length; i++) {
				const item = list.items[i];
				const suggestion = SuggestAdapter.from(item);

				if (item.textEdit) {

					let editRange = item.textEdit.range;
					let isSingleLine = (editRange.startLineNumber === editRange.endLineNumber);

					// invalid text edit
					if (!isSingleLine || editRange.startColumn !== position.lineNumber) {
						console.warn('INVALID text edit, must be single line and on the same line');
						continue;
					}

					// insert the text of the edit and create a dedicated
					// suggestion-container with overwrite[Before|After]
					suggestion.codeSnippet = item.textEdit.text;
					suggestion.overwriteBefore = position.column - editRange.startColumn;
					suggestion.overwriteAfter = editRange.endColumn - position.column;

					allSuggestions.push({
						currentWord: model.getValueInRange(editRange),
						suggestions: [suggestion],
						incomplete: list.isIncomplete
					});

				} else {
					defaultSuggestions.suggestions.push(suggestion);
				}
			}

			return allSuggestions;
		});
	}

	resolveCompletionItem(model:editorCommon.IReadOnlyModel, position:Position, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> {
		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return TPromise.as(suggestion);
		}

		let item = (<ISuggestion2>suggestion)._actual;
		if (!item) {
			return TPromise.as(suggestion);
		}

		return toThenable(this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {
			return SuggestAdapter.from(resolvedItem);
		});
	}
}

export function registerSignatureHelpProvider(languageId:string, support:modes.SignatureHelpProvider): IDisposable {
	return modes.SignatureHelpProviderRegistry.register(languageId, support);
}

export function registerHoverProvider(languageId:string, support:modes.HoverProvider): IDisposable {
	return modes.HoverProviderRegistry.register(languageId, support);
}

export function registerDocumentSymbolProvider(languageId:string, support:modes.DocumentSymbolProvider): IDisposable {
	return modes.DocumentSymbolProviderRegistry.register(languageId, support);
}

export function registerDocumentHighlightProvider(languageId:string, support:modes.DocumentHighlightProvider): IDisposable {
	return modes.DocumentHighlightProviderRegistry.register(languageId, support);
}

export function registerDefinitionProvider(languageId:string, support:modes.DefinitionProvider): IDisposable {
	return modes.DefinitionProviderRegistry.register(languageId, support);
}

export function registerCodeLensProvider(languageId:string, support:modes.CodeLensProvider): IDisposable {
	return modes.CodeLensProviderRegistry.register(languageId, support);
}

export function registerCodeActionProvider(languageId:string, support:modes.CodeActionProvider): IDisposable {
	return modes.CodeActionProviderRegistry.register(languageId, support);
}

export function registerDocumentFormattingEditProvider(languageId:string, support:modes.DocumentFormattingEditProvider): IDisposable {
	return modes.DocumentFormattingEditProviderRegistry.register(languageId, support);
}

export function registerDocumentRangeFormattingEditProvider(languageId:string, support:modes.DocumentRangeFormattingEditProvider): IDisposable {
	return modes.DocumentRangeFormattingEditProviderRegistry.register(languageId, support);
}

export function registerOnTypeFormattingEditProvider(languageId:string, support:modes.OnTypeFormattingEditProvider): IDisposable {
	return modes.OnTypeFormattingEditProviderRegistry.register(languageId, support);
}

export function registerLinkProvider(languageId:string, support:modes.LinkProvider): IDisposable {
	return modes.LinkProviderRegistry.register(languageId, support);
}

/**
 * @internal
 */
export function registerStandaloneSchema(uri:string, schema:IJSONSchema) {
	let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
	schemaRegistry.registerSchema(uri, schema);
}

/**
 * @internal
 */
export function createMonacoLanguagesAPI(): typeof monaco.languages {
	return {
		register: register,
		getLanguages: getLanguages,
		onLanguage: onLanguage,

		// provider methods
		setLanguageConfiguration: setLanguageConfiguration,
		setTokensProvider: setTokensProvider,
		setMonarchTokensProvider: setMonarchTokensProvider,
		registerReferenceProvider: registerReferenceProvider,
		registerRenameProvider: registerRenameProvider,
		registerCompletionItemProvider: registerCompletionItemProvider,
		registerSignatureHelpProvider: registerSignatureHelpProvider,
		registerHoverProvider: registerHoverProvider,
		registerDocumentSymbolProvider: registerDocumentSymbolProvider,
		registerDocumentHighlightProvider: registerDocumentHighlightProvider,
		registerDefinitionProvider: registerDefinitionProvider,
		registerCodeLensProvider: registerCodeLensProvider,
		registerCodeActionProvider: registerCodeActionProvider,
		registerDocumentFormattingEditProvider: registerDocumentFormattingEditProvider,
		registerDocumentRangeFormattingEditProvider: registerDocumentRangeFormattingEditProvider,
		registerOnTypeFormattingEditProvider: registerOnTypeFormattingEditProvider,
		registerLinkProvider: registerLinkProvider,

		// enums
		DocumentHighlightKind: modes.DocumentHighlightKind,
		CompletionItemKind: CompletionItemKind,
		SymbolKind: modes.SymbolKind,
		IndentAction: modes.IndentAction
	};
}
