/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { IMonarchLanguage } from 'vs/editor/common/modes/monarch/monarchTypes';
import { ILanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { StaticServices } from 'vs/editor/browser/standalone/standaloneServices';
import * as modes from 'vs/editor/common/modes';
import { LanguageConfiguration, IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toThenable } from 'vs/base/common/async';
import { compile } from 'vs/editor/common/modes/monarch/monarchCompile';
import { createTokenizationSupport } from 'vs/editor/common/modes/monarch/monarchLexer';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IMarkerData } from 'vs/platform/markers/common/markers';
import { Token, TokenizationResult, TokenizationResult2 } from 'vs/editor/common/core/token';
import { IStandaloneColorService } from 'vs/editor/common/services/standaloneColorService';

/**
 * Register information about a new language.
 */
export function register(language: ILanguageExtensionPoint): void {
	ModesRegistry.registerLanguage(language);
}

/**
 * Get the information of all the registered languages.
 */
export function getLanguages(): ILanguageExtensionPoint[] {
	let result: ILanguageExtensionPoint[] = [];
	result = result.concat(ModesRegistry.getLanguages());
	return result;
}

/**
 * An event emitted when a language is first time needed (e.g. a model has it set).
 * @event
 */
export function onLanguage(languageId: string, callback: () => void): IDisposable {
	let disposable = StaticServices.modeService.get().onDidCreateMode((mode) => {
		if (mode.getId() === languageId) {
			// stop listening
			disposable.dispose();
			// invoke actual listener
			callback();
		}
	});
	return disposable;
}

/**
 * Set the editing configuration for a language.
 */
export function setLanguageConfiguration(languageId: string, configuration: LanguageConfiguration): IDisposable {
	let languageIdentifier = StaticServices.modeService.get().getLanguageIdentifier(languageId);
	if (!languageIdentifier) {
		throw new Error(`Cannot set configuration for unknown language ${languageId}`);
	}
	return LanguageConfigurationRegistry.register(languageIdentifier, configuration);
}

/**
 * @internal
 */
export class TokenizationSupport2Adapter implements modes.ITokenizationSupport {

	private readonly _standaloneColorService: IStandaloneColorService;
	private readonly _languageIdentifier: modes.LanguageIdentifier;
	private readonly _actual: TokensProvider;

	constructor(standaloneColorService: IStandaloneColorService, languageIdentifier: modes.LanguageIdentifier, actual: TokensProvider) {
		this._standaloneColorService = standaloneColorService;
		this._languageIdentifier = languageIdentifier;
		this._actual = actual;
	}

	public getInitialState(): modes.IState {
		return this._actual.getInitialState();
	}

	private _toClassicTokens(tokens: IToken[], language: string, offsetDelta: number): Token[] {
		let result: Token[] = [];
		for (let i = 0, len = tokens.length; i < len; i++) {
			let t = tokens[i];
			result[i] = new Token(t.startIndex + offsetDelta, t.scopes, language);
		}
		return result;
	}

	public tokenize(line: string, state: modes.IState, offsetDelta: number): TokenizationResult {
		let actualResult = this._actual.tokenize(line, state);
		let tokens = this._toClassicTokens(actualResult.tokens, this._languageIdentifier.language, offsetDelta);

		let endState: modes.IState;
		// try to save an object if possible
		if (actualResult.endState.equals(state)) {
			endState = state;
		} else {
			endState = actualResult.endState;
		}

		return new TokenizationResult(tokens, endState);
	}

	private _toBinaryTokens(tokens: IToken[], offsetDelta: number): Uint32Array {
		let languageId = this._languageIdentifier.id;
		let theme = this._standaloneColorService.getTheme();

		let result: number[] = [], resultLen = 0;
		for (let i = 0, len = tokens.length; i < len; i++) {
			let t = tokens[i];
			let metadata = theme.match(languageId, t.scopes);
			if (resultLen > 0 && result[resultLen - 1] === metadata) {
				// same metadata
				continue;
			}
			result[resultLen++] = t.startIndex;
			result[resultLen++] = metadata;
		}

		let actualResult = new Uint32Array(resultLen);
		for (let i = 0; i < resultLen; i++) {
			actualResult[i] = result[i];
		}
		return actualResult;
	}

	public tokenize2(line: string, state: modes.IState, offsetDelta: number): TokenizationResult2 {
		let actualResult = this._actual.tokenize(line, state);
		let tokens = this._toBinaryTokens(actualResult.tokens, offsetDelta);

		let endState: modes.IState;
		// try to save an object if possible
		if (actualResult.endState.equals(state)) {
			endState = state;
		} else {
			endState = actualResult.endState;
		}

		return new TokenizationResult2(tokens, endState);
	}
}

/**
 * A token.
 */
export interface IToken {
	startIndex: number;
	scopes: string;
}

/**
 * The result of a line tokenization.
 */
export interface ILineTokens {
	/**
	 * The list of tokens on the line.
	 */
	tokens: IToken[];
	/**
	 * The tokenization end state.
	 * A pointer will be held to this and the object should not be modified by the tokenizer after the pointer is returned.
	 */
	endState: modes.IState;
}

/**
 * A "manual" provider of tokens.
 */
export interface TokensProvider {
	/**
	 * The initial state of a language. Will be the state passed in to tokenize the first line.
	 */
	getInitialState(): modes.IState;
	/**
	 * Tokenize a line given the state at the beginning of the line.
	 */
	tokenize(line: string, state: modes.IState): ILineTokens;
}

/**
 * Set the tokens provider for a language (manual implementation).
 */
export function setTokensProvider(languageId: string, provider: TokensProvider): IDisposable {
	let languageIdentifier = StaticServices.modeService.get().getLanguageIdentifier(languageId);
	if (!languageIdentifier) {
		throw new Error(`Cannot set tokens provider for unknown language ${languageId}`);
	}
	let adapter = new TokenizationSupport2Adapter(StaticServices.standaloneColorService.get(), languageIdentifier, provider);
	return modes.TokenizationRegistry.register(languageId, adapter);
}

/**
 * Set the tokens provider for a language (monarch implementation).
 */
export function setMonarchTokensProvider(languageId: string, languageDef: IMonarchLanguage): IDisposable {
	let lexer = compile(languageId, languageDef);
	let adapter = createTokenizationSupport(StaticServices.modeService.get(), StaticServices.standaloneColorService.get(), languageId, lexer);
	return modes.TokenizationRegistry.register(languageId, adapter);
}

/**
 * Register a reference provider (used by e.g. reference search).
 */
export function registerReferenceProvider(languageId: string, provider: modes.ReferenceProvider): IDisposable {
	return modes.ReferenceProviderRegistry.register(languageId, provider);
}

/**
 * Register a rename provider (used by e.g. rename symbol).
 */
export function registerRenameProvider(languageId: string, provider: modes.RenameProvider): IDisposable {
	return modes.RenameProviderRegistry.register(languageId, provider);
}

/**
 * Register a signature help provider (used by e.g. paremeter hints).
 */
export function registerSignatureHelpProvider(languageId: string, provider: modes.SignatureHelpProvider): IDisposable {
	return modes.SignatureHelpProviderRegistry.register(languageId, provider);
}

/**
 * Register a hover provider (used by e.g. editor hover).
 */
export function registerHoverProvider(languageId: string, provider: modes.HoverProvider): IDisposable {
	return modes.HoverProviderRegistry.register(languageId, {
		provideHover: (model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.Hover> => {
			let word = model.getWordAtPosition(position);

			return toThenable<modes.Hover>(provider.provideHover(model, position, token)).then((value) => {
				if (!value) {
					return undefined;
				}
				if (!value.range && word) {
					value.range = new Range(position.lineNumber, word.startColumn, position.column, word.endColumn);
				}
				if (!value.range) {
					value.range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
				}
				return value;
			});
		}
	});
}

/**
 * Register a document symbol provider (used by e.g. outline).
 */
export function registerDocumentSymbolProvider(languageId: string, provider: modes.DocumentSymbolProvider): IDisposable {
	return modes.DocumentSymbolProviderRegistry.register(languageId, provider);
}

/**
 * Register a document highlight provider (used by e.g. highlight occurences).
 */
export function registerDocumentHighlightProvider(languageId: string, provider: modes.DocumentHighlightProvider): IDisposable {
	return modes.DocumentHighlightProviderRegistry.register(languageId, provider);
}

/**
 * Register a definition provider (used by e.g. go to definition).
 */
export function registerDefinitionProvider(languageId: string, provider: modes.DefinitionProvider): IDisposable {
	return modes.DefinitionProviderRegistry.register(languageId, provider);
}

/**
 * Register a implementation provider (used by e.g. go to implementation).
 */
export function registerImplementationProvider(languageId: string, provider: modes.ImplementationProvider): IDisposable {
	return modes.ImplementationProviderRegistry.register(languageId, provider);
}

/**
 * Register a type definition provider (used by e.g. go to type definition).
 */
export function registerTypeDefinitionProvider(languageId: string, provider: modes.TypeDefinitionProvider): IDisposable {
	return modes.TypeDefinitionProviderRegistry.register(languageId, provider);
}

/**
 * Register a code lens provider (used by e.g. inline code lenses).
 */
export function registerCodeLensProvider(languageId: string, provider: modes.CodeLensProvider): IDisposable {
	return modes.CodeLensProviderRegistry.register(languageId, provider);
}

/**
 * Register a code action provider (used by e.g. quick fix).
 */
export function registerCodeActionProvider(languageId: string, provider: CodeActionProvider): IDisposable {
	return modes.CodeActionProviderRegistry.register(languageId, {
		provideCodeActions: (model: editorCommon.IReadOnlyModel, range: Range, token: CancellationToken): modes.CodeAction[] | Thenable<modes.CodeAction[]> => {
			let markers = StaticServices.markerService.get().read({ resource: model.uri }).filter(m => {
				return Range.areIntersectingOrTouching(m, range);
			});
			return provider.provideCodeActions(model, range, { markers }, token);
		}
	});
}

/**
 * Register a formatter that can handle only entire models.
 */
export function registerDocumentFormattingEditProvider(languageId: string, provider: modes.DocumentFormattingEditProvider): IDisposable {
	return modes.DocumentFormattingEditProviderRegistry.register(languageId, provider);
}

/**
 * Register a formatter that can handle a range inside a model.
 */
export function registerDocumentRangeFormattingEditProvider(languageId: string, provider: modes.DocumentRangeFormattingEditProvider): IDisposable {
	return modes.DocumentRangeFormattingEditProviderRegistry.register(languageId, provider);
}

/**
 * Register a formatter than can do formatting as the user types.
 */
export function registerOnTypeFormattingEditProvider(languageId: string, provider: modes.OnTypeFormattingEditProvider): IDisposable {
	return modes.OnTypeFormattingEditProviderRegistry.register(languageId, provider);
}

/**
 * Register a link provider that can find links in text.
 */
export function registerLinkProvider(languageId: string, provider: modes.LinkProvider): IDisposable {
	return modes.LinkProviderRegistry.register(languageId, provider);
}

/**
 * Register a completion item provider (use by e.g. suggestions).
 */
export function registerCompletionItemProvider(languageId: string, provider: CompletionItemProvider): IDisposable {
	let adapter = new SuggestAdapter(provider);
	return modes.SuggestRegistry.register(languageId, {
		triggerCharacters: provider.triggerCharacters,
		provideCompletionItems: (model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.ISuggestResult> => {
			return adapter.provideCompletionItems(model, position, token);
		},
		resolveCompletionItem: (model: editorCommon.IReadOnlyModel, position: Position, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> => {
			return adapter.resolveCompletionItem(model, position, suggestion, token);
		}
	});
}

/**
 * Contains additional diagnostic information about the context in which
 * a [code action](#CodeActionProvider.provideCodeActions) is run.
 */
export interface CodeActionContext {

	/**
	 * An array of diagnostics.
	 *
	 * @readonly
	 */
	readonly markers: IMarkerData[];
}

/**
 * The code action interface defines the contract between extensions and
 * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
 */
export interface CodeActionProvider {
	/**
	 * Provide commands for the given document and range.
	 */
	provideCodeActions(model: editorCommon.IReadOnlyModel, range: Range, context: CodeActionContext, token: CancellationToken): modes.CodeAction[] | Thenable<modes.CodeAction[]>;
}

/**
 * Completion item kinds.
 */
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
	Reference,
	Folder
}

/**
 * A snippet string is a template which allows to insert text
 * and to control the editor cursor when insertion happens.
 *
 * A snippet can define tab stops and placeholders with `$1`, `$2`
 * and `${3:foo}`. `$0` defines the final tab stop, it defaults to
 * the end of the snippet. Variables are defined with `$name` and
 * `${name:default value}`. The full snippet syntax is documented
 * [here](http://code.visualstudio.com/docs/customization/userdefinedsnippets#_creating-your-own-snippets).
 */
export interface SnippetString {

	/**
	 * The snippet string.
	 */
	value: string;
}

/**
 * A completion item represents a text snippet that is
 * proposed to complete text that is being typed.
 */
export interface CompletionItem {
	/**
	 * The label of this completion item. By default
	 * this is also the text that is inserted when selecting
	 * this completion.
	 */
	label: string;
	/**
	 * The kind of this completion item. Based on the kind
	 * an icon is chosen by the editor.
	 */
	kind: CompletionItemKind;
	/**
	 * A human-readable string with additional information
	 * about this item, like type or symbol information.
	 */
	detail?: string;
	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string;
	/**
	 * A string that should be used when comparing this item
	 * with other items. When `falsy` the [label](#CompletionItem.label)
	 * is used.
	 */
	sortText?: string;
	/**
	 * A string that should be used when filtering a set of
	 * completion items. When `falsy` the [label](#CompletionItem.label)
	 * is used.
	 */
	filterText?: string;
	/**
	 * A string or snippet that should be inserted in a document when selecting
	 * this completion. When `falsy` the [label](#CompletionItem.label)
	 * is used.
	 */
	insertText?: string | SnippetString;
	/**
	 * A range of text that should be replaced by this completion item.
	 *
	 * Defaults to a range from the start of the [current word](#TextDocument.getWordRangeAtPosition) to the
	 * current position.
	 *
	 * *Note:* The range must be a [single line](#Range.isSingleLine) and it must
	 * [contain](#Range.contains) the position at which completion has been [requested](#CompletionItemProvider.provideCompletionItems).
	 */
	range?: Range;
	/**
	 * @deprecated **Deprecated** in favor of `CompletionItem.insertText` and `CompletionItem.range`.
	 *
	 * ~~An [edit](#TextEdit) which is applied to a document when selecting
	 * this completion. When an edit is provided the value of
	 * [insertText](#CompletionItem.insertText) is ignored.~~
	 *
	 * ~~The [range](#Range) of the edit must be single-line and on the same
	 * line completions were [requested](#CompletionItemProvider.provideCompletionItems) at.~~
	 */
	textEdit?: editorCommon.ISingleEditOperation;
}
/**
 * Represents a collection of [completion items](#CompletionItem) to be presented
 * in the editor.
 */
export interface CompletionList {
	/**
	 * This list it not complete. Further typing should result in recomputing
	 * this list.
	 */
	isIncomplete?: boolean;
	/**
	 * The completion items.
	 */
	items: CompletionItem[];
}
/**
 * The completion item provider interface defines the contract between extensions and
 * the [IntelliSense](https://code.visualstudio.com/docs/editor/editingevolved#_intellisense).
 *
 * When computing *complete* completion items is expensive, providers can optionally implement
 * the `resolveCompletionItem`-function. In that case it is enough to return completion
 * items with a [label](#CompletionItem.label) from the
 * [provideCompletionItems](#CompletionItemProvider.provideCompletionItems)-function. Subsequently,
 * when a completion item is shown in the UI and gains focus this provider is asked to resolve
 * the item, like adding [doc-comment](#CompletionItem.documentation) or [details](#CompletionItem.detail).
 */
export interface CompletionItemProvider {
	triggerCharacters?: string[];
	/**
	 * Provide completion items for the given position and document.
	 */
	provideCompletionItems(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList>;
	/**
	 * Given a completion item fill in more data, like [doc-comment](#CompletionItem.documentation)
	 * or [details](#CompletionItem.detail).
	 *
	 * The editor will only resolve a completion item once.
	 */
	resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem>;
}

interface ISuggestion2 extends modes.ISuggestion {
	_actual: CompletionItem;
}
function convertKind(kind: CompletionItemKind): modes.SuggestionType {
	switch (kind) {
		case CompletionItemKind.Method: return 'method';
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
		case CompletionItemKind.Folder: return 'folder';
	}
	return 'property';
}
class SuggestAdapter {

	private _provider: CompletionItemProvider;

	constructor(provider: CompletionItemProvider) {
		this._provider = provider;
	}

	private static from(item: CompletionItem, position: Position, wordStartPos: Position): ISuggestion2 {
		let suggestion: ISuggestion2 = {
			_actual: item,
			label: item.label,
			insertText: item.label,
			type: convertKind(item.kind),
			detail: item.detail,
			documentation: item.documentation,
			sortText: item.sortText,
			filterText: item.filterText,
			snippetType: 'internal'
		};
		let editRange = item.textEdit ? item.textEdit.range : item.range;
		if (editRange) {
			let isSingleLine = (editRange.startLineNumber === editRange.endLineNumber);

			// invalid text edit
			if (!isSingleLine || editRange.startLineNumber !== position.lineNumber) {
				console.warn('INVALID range, must be single line and on the same line');
				return null;
			}

			// insert the text of the edit and create a dedicated
			// suggestion-container with overwrite[Before|After]
			suggestion.overwriteBefore = position.column - editRange.startColumn;
			suggestion.overwriteAfter = editRange.endColumn - position.column;
		} else {
			suggestion.overwriteBefore = position.column - wordStartPos.column;
			suggestion.overwriteAfter = 0;
		}
		if (item.textEdit) {
			suggestion.insertText = item.textEdit.text;
		} else if (typeof item.insertText === 'object' && typeof item.insertText.value === 'string') {
			suggestion.insertText = item.insertText.value;
			suggestion.snippetType = 'textmate';
		} else if (typeof item.insertText === 'string') {
			suggestion.insertText = item.insertText;
		}
		return suggestion;
	}

	provideCompletionItems(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.ISuggestResult> {

		return toThenable<CompletionItem[] | CompletionList>(this._provider.provideCompletionItems(model, position, token)).then(value => {
			const result: modes.ISuggestResult = {
				suggestions: []
			};

			// default text edit start
			let wordStartPos = position;
			const word = model.getWordUntilPosition(position);
			if (word) {
				wordStartPos = new Position(wordStartPos.lineNumber, word.startColumn);
			}

			let list: CompletionList;
			if (Array.isArray(value)) {
				list = {
					items: value,
					isIncomplete: false
				};
			} else if (typeof value === 'object' && Array.isArray(value.items)) {
				list = value;
				result.incomplete = list.isIncomplete;
			} else if (!value) {
				// undefined and null are valid results
				return undefined;
			} else {
				// warn about everything else
				console.warn('INVALID result from completion provider. expected CompletionItem-array or CompletionList but got:', value);
			}

			for (let i = 0; i < list.items.length; i++) {
				const item = list.items[i];
				const suggestion = SuggestAdapter.from(item, position, wordStartPos);
				if (suggestion) {
					result.suggestions.push(suggestion);
				}
			}

			return result;
		});
	}

	resolveCompletionItem(model: editorCommon.IReadOnlyModel, position: Position, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> {
		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return TPromise.as(suggestion);
		}

		let item = (<ISuggestion2>suggestion)._actual;
		if (!item) {
			return TPromise.as(suggestion);
		}

		return toThenable(this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {
			let wordStartPos = position;
			const word = model.getWordUntilPosition(position);
			if (word) {
				wordStartPos = new Position(wordStartPos.lineNumber, word.startColumn);
			}
			return SuggestAdapter.from(resolvedItem, position, wordStartPos);
		});
	}
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
		registerImplementationProvider: registerImplementationProvider,
		registerTypeDefinitionProvider: registerTypeDefinitionProvider,
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
		IndentAction: IndentAction,
	};
}
