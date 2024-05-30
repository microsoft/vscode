/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Color } from 'vs/base/common/color';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import * as languages from 'vs/editor/common/languages';
import { ILanguageExtensionPoint, ILanguageService } from 'vs/editor/common/languages/language';
import { LanguageConfiguration } from 'vs/editor/common/languages/languageConfiguration';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ModesRegistry } from 'vs/editor/common/languages/modesRegistry';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import * as model from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import * as standaloneEnums from 'vs/editor/common/standalone/standaloneEnums';
import { StandaloneServices } from 'vs/editor/standalone/browser/standaloneServices';
import { compile } from 'vs/editor/standalone/common/monarch/monarchCompile';
import { MonarchTokenizer } from 'vs/editor/standalone/common/monarch/monarchLexer';
import { IMonarchLanguage } from 'vs/editor/standalone/common/monarch/monarchTypes';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneTheme';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';

/**
 * Register information about a new language.
 */
export function register(language: ILanguageExtensionPoint): void {
	// Intentionally using the `ModesRegistry` here to avoid
	// instantiating services too quickly in the standalone editor.
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

export function getEncodedLanguageId(languageId: string): number {
	const languageService = StandaloneServices.get(ILanguageService);
	return languageService.languageIdCodec.encodeLanguageId(languageId);
}

/**
 * An event emitted when a language is associated for the first time with a text model.
 * @event
 */
export function onLanguage(languageId: string, callback: () => void): IDisposable {
	return StandaloneServices.withServices(() => {
		const languageService = StandaloneServices.get(ILanguageService);
		const disposable = languageService.onDidRequestRichLanguageFeatures((encounteredLanguageId) => {
			if (encounteredLanguageId === languageId) {
				// stop listening
				disposable.dispose();
				// invoke actual listener
				callback();
			}
		});
		return disposable;
	});
}

/**
 * An event emitted when a language is associated for the first time with a text model or
 * when a language is encountered during the tokenization of another language.
 * @event
 */
export function onLanguageEncountered(languageId: string, callback: () => void): IDisposable {
	return StandaloneServices.withServices(() => {
		const languageService = StandaloneServices.get(ILanguageService);
		const disposable = languageService.onDidRequestBasicLanguageFeatures((encounteredLanguageId) => {
			if (encounteredLanguageId === languageId) {
				// stop listening
				disposable.dispose();
				// invoke actual listener
				callback();
			}
		});
		return disposable;
	});
}

/**
 * Set the editing configuration for a language.
 */
export function setLanguageConfiguration(languageId: string, configuration: LanguageConfiguration): IDisposable {
	const languageService = StandaloneServices.get(ILanguageService);
	if (!languageService.isRegisteredLanguageId(languageId)) {
		throw new Error(`Cannot set configuration for unknown language ${languageId}`);
	}
	const languageConfigurationService = StandaloneServices.get(ILanguageConfigurationService);
	return languageConfigurationService.register(languageId, configuration, 100);
}

/**
 * @internal
 */
export class EncodedTokenizationSupportAdapter implements languages.ITokenizationSupport, IDisposable {

	private readonly _languageId: string;
	private readonly _actual: EncodedTokensProvider;

	constructor(languageId: string, actual: EncodedTokensProvider) {
		this._languageId = languageId;
		this._actual = actual;
	}

	dispose(): void {
		// NOOP
	}

	public getInitialState(): languages.IState {
		return this._actual.getInitialState();
	}

	public tokenize(line: string, hasEOL: boolean, state: languages.IState): languages.TokenizationResult {
		if (typeof this._actual.tokenize === 'function') {
			return TokenizationSupportAdapter.adaptTokenize(this._languageId, <{ tokenize(line: string, state: languages.IState): ILineTokens }>this._actual, line, state);
		}
		throw new Error('Not supported!');
	}

	public tokenizeEncoded(line: string, hasEOL: boolean, state: languages.IState): languages.EncodedTokenizationResult {
		const result = this._actual.tokenizeEncoded(line, state);
		return new languages.EncodedTokenizationResult(result.tokens, result.endState);
	}
}

/**
 * @internal
 */
export class TokenizationSupportAdapter implements languages.ITokenizationSupport, IDisposable {

	constructor(
		private readonly _languageId: string,
		private readonly _actual: TokensProvider,
		private readonly _languageService: ILanguageService,
		private readonly _standaloneThemeService: IStandaloneThemeService,
	) {
	}

	dispose(): void {
		// NOOP
	}

	public getInitialState(): languages.IState {
		return this._actual.getInitialState();
	}

	private static _toClassicTokens(tokens: IToken[], language: string): languages.Token[] {
		const result: languages.Token[] = [];
		let previousStartIndex: number = 0;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const t = tokens[i];
			let startIndex = t.startIndex;

			// Prevent issues stemming from a buggy external tokenizer.
			if (i === 0) {
				// Force first token to start at first index!
				startIndex = 0;
			} else if (startIndex < previousStartIndex) {
				// Force tokens to be after one another!
				startIndex = previousStartIndex;
			}

			result[i] = new languages.Token(startIndex, t.scopes, language);

			previousStartIndex = startIndex;
		}
		return result;
	}

	public static adaptTokenize(language: string, actual: { tokenize(line: string, state: languages.IState): ILineTokens }, line: string, state: languages.IState): languages.TokenizationResult {
		const actualResult = actual.tokenize(line, state);
		const tokens = TokenizationSupportAdapter._toClassicTokens(actualResult.tokens, language);

		let endState: languages.IState;
		// try to save an object if possible
		if (actualResult.endState.equals(state)) {
			endState = state;
		} else {
			endState = actualResult.endState;
		}

		return new languages.TokenizationResult(tokens, endState);
	}

	public tokenize(line: string, hasEOL: boolean, state: languages.IState): languages.TokenizationResult {
		return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state);
	}

	private _toBinaryTokens(languageIdCodec: languages.ILanguageIdCodec, tokens: IToken[]): Uint32Array {
		const languageId = languageIdCodec.encodeLanguageId(this._languageId);
		const tokenTheme = this._standaloneThemeService.getColorTheme().tokenTheme;

		const result: number[] = [];
		let resultLen = 0;
		let previousStartIndex: number = 0;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const t = tokens[i];
			const metadata = tokenTheme.match(languageId, t.scopes) | MetadataConsts.BALANCED_BRACKETS_MASK;
			if (resultLen > 0 && result[resultLen - 1] === metadata) {
				// same metadata
				continue;
			}

			let startIndex = t.startIndex;

			// Prevent issues stemming from a buggy external tokenizer.
			if (i === 0) {
				// Force first token to start at first index!
				startIndex = 0;
			} else if (startIndex < previousStartIndex) {
				// Force tokens to be after one another!
				startIndex = previousStartIndex;
			}

			result[resultLen++] = startIndex;
			result[resultLen++] = metadata;

			previousStartIndex = startIndex;
		}

		const actualResult = new Uint32Array(resultLen);
		for (let i = 0; i < resultLen; i++) {
			actualResult[i] = result[i];
		}
		return actualResult;
	}

	public tokenizeEncoded(line: string, hasEOL: boolean, state: languages.IState): languages.EncodedTokenizationResult {
		const actualResult = this._actual.tokenize(line, state);
		const tokens = this._toBinaryTokens(this._languageService.languageIdCodec, actualResult.tokens);

		let endState: languages.IState;
		// try to save an object if possible
		if (actualResult.endState.equals(state)) {
			endState = state;
		} else {
			endState = actualResult.endState;
		}

		return new languages.EncodedTokenizationResult(tokens, endState);
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
	endState: languages.IState;
}

/**
 * The result of a line tokenization.
 */
export interface IEncodedLineTokens {
	/**
	 * The tokens on the line in a binary, encoded format. Each token occupies two array indices. For token i:
	 *  - at offset 2*i => startIndex
	 *  - at offset 2*i + 1 => metadata
	 * Meta data is in binary format:
	 * - -------------------------------------------
	 *     3322 2222 2222 1111 1111 1100 0000 0000
	 *     1098 7654 3210 9876 5432 1098 7654 3210
	 * - -------------------------------------------
	 *     bbbb bbbb bfff ffff ffFF FFTT LLLL LLLL
	 * - -------------------------------------------
	 *  - L = EncodedLanguageId (8 bits): Use `getEncodedLanguageId` to get the encoded ID of a language.
	 *  - T = StandardTokenType (2 bits): Other = 0, Comment = 1, String = 2, RegEx = 3.
	 *  - F = FontStyle (4 bits): None = 0, Italic = 1, Bold = 2, Underline = 4, Strikethrough = 8.
	 *  - f = foreground ColorId (9 bits)
	 *  - b = background ColorId (9 bits)
	 *  - The color value for each colorId is defined in IStandaloneThemeData.customTokenColors:
	 * e.g. colorId = 1 is stored in IStandaloneThemeData.customTokenColors[1]. Color id = 0 means no color,
	 * id = 1 is for the default foreground color, id = 2 for the default background.
	 */
	tokens: Uint32Array;
	/**
	 * The tokenization end state.
	 * A pointer will be held to this and the object should not be modified by the tokenizer after the pointer is returned.
	 */
	endState: languages.IState;
}

/**
 * A factory for token providers.
 */
export interface TokensProviderFactory {
	create(): languages.ProviderResult<TokensProvider | EncodedTokensProvider | IMonarchLanguage>;
}

/**
 * A "manual" provider of tokens.
 */
export interface TokensProvider {
	/**
	 * The initial state of a language. Will be the state passed in to tokenize the first line.
	 */
	getInitialState(): languages.IState;
	/**
	 * Tokenize a line given the state at the beginning of the line.
	 */
	tokenize(line: string, state: languages.IState): ILineTokens;
}

/**
 * A "manual" provider of tokens, returning tokens in a binary form.
 */
export interface EncodedTokensProvider {
	/**
	 * The initial state of a language. Will be the state passed in to tokenize the first line.
	 */
	getInitialState(): languages.IState;
	/**
	 * Tokenize a line given the state at the beginning of the line.
	 */
	tokenizeEncoded(line: string, state: languages.IState): IEncodedLineTokens;
	/**
	 * Tokenize a line given the state at the beginning of the line.
	 */
	tokenize?(line: string, state: languages.IState): ILineTokens;
}

function isATokensProvider(provider: TokensProvider | EncodedTokensProvider | IMonarchLanguage): provider is TokensProvider | EncodedTokensProvider {
	return (typeof provider.getInitialState === 'function');
}

function isEncodedTokensProvider(provider: TokensProvider | EncodedTokensProvider): provider is EncodedTokensProvider {
	return 'tokenizeEncoded' in provider;
}

function isThenable<T>(obj: any): obj is Thenable<T> {
	return obj && typeof obj.then === 'function';
}

/**
 * Change the color map that is used for token colors.
 * Supported formats (hex): #RRGGBB, $RRGGBBAA, #RGB, #RGBA
 */
export function setColorMap(colorMap: string[] | null): void {
	const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
	if (colorMap) {
		const result: Color[] = [null!];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			result[i] = Color.fromHex(colorMap[i]);
		}
		standaloneThemeService.setColorMapOverride(result);
	} else {
		standaloneThemeService.setColorMapOverride(null);
	}
}

/**
 * @internal
 */
function createTokenizationSupportAdapter(languageId: string, provider: TokensProvider | EncodedTokensProvider) {
	if (isEncodedTokensProvider(provider)) {
		return new EncodedTokenizationSupportAdapter(languageId, provider);
	} else {
		return new TokenizationSupportAdapter(
			languageId,
			provider,
			StandaloneServices.get(ILanguageService),
			StandaloneServices.get(IStandaloneThemeService),
		);
	}
}

/**
 * Register a tokens provider factory for a language. This tokenizer will be exclusive with a tokenizer
 * set using `setTokensProvider` or one created using `setMonarchTokensProvider`, but will work together
 * with a tokens provider set using `registerDocumentSemanticTokensProvider` or `registerDocumentRangeSemanticTokensProvider`.
 */
export function registerTokensProviderFactory(languageId: string, factory: TokensProviderFactory): IDisposable {
	const adaptedFactory = new languages.LazyTokenizationSupport(async () => {
		const result = await Promise.resolve(factory.create());
		if (!result) {
			return null;
		}
		if (isATokensProvider(result)) {
			return createTokenizationSupportAdapter(languageId, result);
		}
		return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, result), StandaloneServices.get(IConfigurationService));
	});
	return languages.TokenizationRegistry.registerFactory(languageId, adaptedFactory);
}

/**
 * Set the tokens provider for a language (manual implementation). This tokenizer will be exclusive
 * with a tokenizer created using `setMonarchTokensProvider`, or with `registerTokensProviderFactory`,
 * but will work together with a tokens provider set using `registerDocumentSemanticTokensProvider`
 * or `registerDocumentRangeSemanticTokensProvider`.
 */
export function setTokensProvider(languageId: string, provider: TokensProvider | EncodedTokensProvider | Thenable<TokensProvider | EncodedTokensProvider>): IDisposable {
	const languageService = StandaloneServices.get(ILanguageService);
	if (!languageService.isRegisteredLanguageId(languageId)) {
		throw new Error(`Cannot set tokens provider for unknown language ${languageId}`);
	}
	if (isThenable<TokensProvider | EncodedTokensProvider>(provider)) {
		return registerTokensProviderFactory(languageId, { create: () => provider });
	}
	return languages.TokenizationRegistry.register(languageId, createTokenizationSupportAdapter(languageId, provider));
}

/**
 * Set the tokens provider for a language (monarch implementation). This tokenizer will be exclusive
 * with a tokenizer set using `setTokensProvider`, or with `registerTokensProviderFactory`, but will
 * work together with a tokens provider set using `registerDocumentSemanticTokensProvider` or
 * `registerDocumentRangeSemanticTokensProvider`.
 */
export function setMonarchTokensProvider(languageId: string, languageDef: IMonarchLanguage | Thenable<IMonarchLanguage>): IDisposable {
	const create = (languageDef: IMonarchLanguage) => {
		return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, languageDef), StandaloneServices.get(IConfigurationService));
	};
	if (isThenable<IMonarchLanguage>(languageDef)) {
		return registerTokensProviderFactory(languageId, { create: () => languageDef });
	}
	return languages.TokenizationRegistry.register(languageId, create(languageDef));
}

/**
 * Register a reference provider (used by e.g. reference search).
 */
export function registerReferenceProvider(languageSelector: LanguageSelector, provider: languages.ReferenceProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.referenceProvider.register(languageSelector, provider);
}

/**
 * Register a rename provider (used by e.g. rename symbol).
 */
export function registerRenameProvider(languageSelector: LanguageSelector, provider: languages.RenameProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.renameProvider.register(languageSelector, provider);
}

/**
 * Register a new symbol-name provider (e.g., when a symbol is being renamed, show new possible symbol-names)
 */
export function registerNewSymbolNameProvider(languageSelector: LanguageSelector, provider: languages.NewSymbolNamesProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.newSymbolNamesProvider.register(languageSelector, provider);
}

/**
 * Register a signature help provider (used by e.g. parameter hints).
 */
export function registerSignatureHelpProvider(languageSelector: LanguageSelector, provider: languages.SignatureHelpProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.signatureHelpProvider.register(languageSelector, provider);
}

/**
 * Register a hover provider (used by e.g. editor hover).
 */
export function registerHoverProvider(languageSelector: LanguageSelector, provider: languages.HoverProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.hoverProvider.register(languageSelector, {
		provideHover: async (model: model.ITextModel, position: Position, token: CancellationToken, context?: languages.HoverContext<languages.Hover>): Promise<languages.Hover | undefined> => {
			const word = model.getWordAtPosition(position);

			return Promise.resolve<languages.Hover | null | undefined>(provider.provideHover(model, position, token, context)).then((value): languages.Hover | undefined => {
				if (!value) {
					return undefined;
				}
				if (!value.range && word) {
					value.range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
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
export function registerDocumentSymbolProvider(languageSelector: LanguageSelector, provider: languages.DocumentSymbolProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentSymbolProvider.register(languageSelector, provider);
}

/**
 * Register a document highlight provider (used by e.g. highlight occurrences).
 */
export function registerDocumentHighlightProvider(languageSelector: LanguageSelector, provider: languages.DocumentHighlightProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentHighlightProvider.register(languageSelector, provider);
}

/**
 * Register an linked editing range provider.
 */
export function registerLinkedEditingRangeProvider(languageSelector: LanguageSelector, provider: languages.LinkedEditingRangeProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.linkedEditingRangeProvider.register(languageSelector, provider);
}

/**
 * Register a definition provider (used by e.g. go to definition).
 */
export function registerDefinitionProvider(languageSelector: LanguageSelector, provider: languages.DefinitionProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.definitionProvider.register(languageSelector, provider);
}

/**
 * Register a implementation provider (used by e.g. go to implementation).
 */
export function registerImplementationProvider(languageSelector: LanguageSelector, provider: languages.ImplementationProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.implementationProvider.register(languageSelector, provider);
}

/**
 * Register a type definition provider (used by e.g. go to type definition).
 */
export function registerTypeDefinitionProvider(languageSelector: LanguageSelector, provider: languages.TypeDefinitionProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.typeDefinitionProvider.register(languageSelector, provider);
}

/**
 * Register a code lens provider (used by e.g. inline code lenses).
 */
export function registerCodeLensProvider(languageSelector: LanguageSelector, provider: languages.CodeLensProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.codeLensProvider.register(languageSelector, provider);
}

/**
 * Register a code action provider (used by e.g. quick fix).
 */
export function registerCodeActionProvider(languageSelector: LanguageSelector, provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.codeActionProvider.register(languageSelector, {
		providedCodeActionKinds: metadata?.providedCodeActionKinds,
		documentation: metadata?.documentation,
		provideCodeActions: (model: model.ITextModel, range: Range, context: languages.CodeActionContext, token: CancellationToken): languages.ProviderResult<languages.CodeActionList> => {
			const markerService = StandaloneServices.get(IMarkerService);
			const markers = markerService.read({ resource: model.uri }).filter(m => {
				return Range.areIntersectingOrTouching(m, range);
			});
			return provider.provideCodeActions(model, range, { markers, only: context.only, trigger: context.trigger }, token);
		},
		resolveCodeAction: provider.resolveCodeAction
	});
}

/**
 * Register a formatter that can handle only entire models.
 */
export function registerDocumentFormattingEditProvider(languageSelector: LanguageSelector, provider: languages.DocumentFormattingEditProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentFormattingEditProvider.register(languageSelector, provider);
}

/**
 * Register a formatter that can handle a range inside a model.
 */
export function registerDocumentRangeFormattingEditProvider(languageSelector: LanguageSelector, provider: languages.DocumentRangeFormattingEditProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentRangeFormattingEditProvider.register(languageSelector, provider);
}

/**
 * Register a formatter than can do formatting as the user types.
 */
export function registerOnTypeFormattingEditProvider(languageSelector: LanguageSelector, provider: languages.OnTypeFormattingEditProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.onTypeFormattingEditProvider.register(languageSelector, provider);
}

/**
 * Register a link provider that can find links in text.
 */
export function registerLinkProvider(languageSelector: LanguageSelector, provider: languages.LinkProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.linkProvider.register(languageSelector, provider);
}

/**
 * Register a completion item provider (use by e.g. suggestions).
 */
export function registerCompletionItemProvider(languageSelector: LanguageSelector, provider: languages.CompletionItemProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.completionProvider.register(languageSelector, provider);
}

/**
 * Register a document color provider (used by Color Picker, Color Decorator).
 */
export function registerColorProvider(languageSelector: LanguageSelector, provider: languages.DocumentColorProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.colorProvider.register(languageSelector, provider);
}

/**
 * Register a folding range provider
 */
export function registerFoldingRangeProvider(languageSelector: LanguageSelector, provider: languages.FoldingRangeProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.foldingRangeProvider.register(languageSelector, provider);
}

/**
 * Register a declaration provider
 */
export function registerDeclarationProvider(languageSelector: LanguageSelector, provider: languages.DeclarationProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.declarationProvider.register(languageSelector, provider);
}

/**
 * Register a selection range provider
 */
export function registerSelectionRangeProvider(languageSelector: LanguageSelector, provider: languages.SelectionRangeProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.selectionRangeProvider.register(languageSelector, provider);
}

/**
 * Register a document semantic tokens provider. A semantic tokens provider will complement and enhance a
 * simple top-down tokenizer. Simple top-down tokenizers can be set either via `setMonarchTokensProvider`
 * or `setTokensProvider`.
 *
 * For the best user experience, register both a semantic tokens provider and a top-down tokenizer.
 */
export function registerDocumentSemanticTokensProvider(languageSelector: LanguageSelector, provider: languages.DocumentSemanticTokensProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentSemanticTokensProvider.register(languageSelector, provider);
}

/**
 * Register a document range semantic tokens provider. A semantic tokens provider will complement and enhance a
 * simple top-down tokenizer. Simple top-down tokenizers can be set either via `setMonarchTokensProvider`
 * or `setTokensProvider`.
 *
 * For the best user experience, register both a semantic tokens provider and a top-down tokenizer.
 */
export function registerDocumentRangeSemanticTokensProvider(languageSelector: LanguageSelector, provider: languages.DocumentRangeSemanticTokensProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.documentRangeSemanticTokensProvider.register(languageSelector, provider);
}

/**
 * Register an inline completions provider.
 */
export function registerInlineCompletionsProvider(languageSelector: LanguageSelector, provider: languages.InlineCompletionsProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.inlineCompletionsProvider.register(languageSelector, provider);
}

export function registerInlineEditProvider(languageSelector: LanguageSelector, provider: languages.InlineEditProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.inlineEditProvider.register(languageSelector, provider);
}

/**
 * Register an inlay hints provider.
 */
export function registerInlayHintsProvider(languageSelector: LanguageSelector, provider: languages.InlayHintsProvider): IDisposable {
	const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
	return languageFeaturesService.inlayHintsProvider.register(languageSelector, provider);
}

/**
 * Contains additional diagnostic information about the context in which
 * a [code action](#CodeActionProvider.provideCodeActions) is run.
 */
export interface CodeActionContext {

	/**
	 * An array of diagnostics.
	 */
	readonly markers: IMarkerData[];

	/**
	 * Requested kind of actions to return.
	 */
	readonly only?: string;

	/**
	 * The reason why code actions were requested.
	 */
	readonly trigger: languages.CodeActionTriggerType;
}

/**
 * The code action interface defines the contract between extensions and
 * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
 */
export interface CodeActionProvider {
	/**
	 * Provide commands for the given document and range.
	 */
	provideCodeActions(model: model.ITextModel, range: Range, context: CodeActionContext, token: CancellationToken): languages.ProviderResult<languages.CodeActionList>;

	/**
	 * Given a code action fill in the edit. Will only invoked when missing.
	 */
	resolveCodeAction?(codeAction: languages.CodeAction, token: CancellationToken): languages.ProviderResult<languages.CodeAction>;
}



/**
 * Metadata about the type of code actions that a {@link CodeActionProvider} provides.
 */
export interface CodeActionProviderMetadata {
	/**
	 * List of code action kinds that a {@link CodeActionProvider} may return.
	 *
	 * This list is used to determine if a given `CodeActionProvider` should be invoked or not.
	 * To avoid unnecessary computation, every `CodeActionProvider` should list use `providedCodeActionKinds`. The
	 * list of kinds may either be generic, such as `["quickfix", "refactor", "source"]`, or list out every kind provided,
	 * such as `["quickfix.removeLine", "source.fixAll" ...]`.
	 */
	readonly providedCodeActionKinds?: readonly string[];

	readonly documentation?: ReadonlyArray<{ readonly kind: string; readonly command: languages.Command }>;
}

/**
 * @internal
 */
export function createMonacoLanguagesAPI(): typeof monaco.languages {
	return {
		register: <any>register,
		getLanguages: <any>getLanguages,
		onLanguage: <any>onLanguage,
		onLanguageEncountered: <any>onLanguageEncountered,
		getEncodedLanguageId: <any>getEncodedLanguageId,

		// provider methods
		setLanguageConfiguration: <any>setLanguageConfiguration,
		setColorMap: setColorMap,
		registerTokensProviderFactory: <any>registerTokensProviderFactory,
		setTokensProvider: <any>setTokensProvider,
		setMonarchTokensProvider: <any>setMonarchTokensProvider,
		registerReferenceProvider: <any>registerReferenceProvider,
		registerRenameProvider: <any>registerRenameProvider,
		registerNewSymbolNameProvider: <any>registerNewSymbolNameProvider,
		registerCompletionItemProvider: <any>registerCompletionItemProvider,
		registerSignatureHelpProvider: <any>registerSignatureHelpProvider,
		registerHoverProvider: <any>registerHoverProvider,
		registerDocumentSymbolProvider: <any>registerDocumentSymbolProvider,
		registerDocumentHighlightProvider: <any>registerDocumentHighlightProvider,
		registerLinkedEditingRangeProvider: <any>registerLinkedEditingRangeProvider,
		registerDefinitionProvider: <any>registerDefinitionProvider,
		registerImplementationProvider: <any>registerImplementationProvider,
		registerTypeDefinitionProvider: <any>registerTypeDefinitionProvider,
		registerCodeLensProvider: <any>registerCodeLensProvider,
		registerCodeActionProvider: <any>registerCodeActionProvider,
		registerDocumentFormattingEditProvider: <any>registerDocumentFormattingEditProvider,
		registerDocumentRangeFormattingEditProvider: <any>registerDocumentRangeFormattingEditProvider,
		registerOnTypeFormattingEditProvider: <any>registerOnTypeFormattingEditProvider,
		registerLinkProvider: <any>registerLinkProvider,
		registerColorProvider: <any>registerColorProvider,
		registerFoldingRangeProvider: <any>registerFoldingRangeProvider,
		registerDeclarationProvider: <any>registerDeclarationProvider,
		registerSelectionRangeProvider: <any>registerSelectionRangeProvider,
		registerDocumentSemanticTokensProvider: <any>registerDocumentSemanticTokensProvider,
		registerDocumentRangeSemanticTokensProvider: <any>registerDocumentRangeSemanticTokensProvider,
		registerInlineCompletionsProvider: <any>registerInlineCompletionsProvider,
		registerInlineEditProvider: <any>registerInlineEditProvider,
		registerInlayHintsProvider: <any>registerInlayHintsProvider,

		// enums
		DocumentHighlightKind: standaloneEnums.DocumentHighlightKind,
		CompletionItemKind: standaloneEnums.CompletionItemKind,
		CompletionItemTag: standaloneEnums.CompletionItemTag,
		CompletionItemInsertTextRule: standaloneEnums.CompletionItemInsertTextRule,
		SymbolKind: standaloneEnums.SymbolKind,
		SymbolTag: standaloneEnums.SymbolTag,
		IndentAction: standaloneEnums.IndentAction,
		CompletionTriggerKind: standaloneEnums.CompletionTriggerKind,
		SignatureHelpTriggerKind: standaloneEnums.SignatureHelpTriggerKind,
		InlayHintKind: standaloneEnums.InlayHintKind,
		InlineCompletionTriggerKind: standaloneEnums.InlineCompletionTriggerKind,
		InlineEditTriggerKind: standaloneEnums.InlineEditTriggerKind,
		CodeActionTriggerType: standaloneEnums.CodeActionTriggerType,
		NewSymbolNameTag: standaloneEnums.NewSymbolNameTag,
		NewSymbolNameTriggerKind: standaloneEnums.NewSymbolNameTriggerKind,
		PartialAcceptTriggerKind: standaloneEnums.PartialAcceptTriggerKind,
		HoverVerbosityAction: standaloneEnums.HoverVerbosityAction,

		// classes
		FoldingRangeKind: languages.FoldingRangeKind,
		SelectedSuggestionInfo: <any>languages.SelectedSuggestionInfo,
	};
}
