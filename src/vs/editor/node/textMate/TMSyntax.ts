/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import * as types from 'vs/base/common/types';
import Event, { Emitter } from 'vs/base/common/event';
import { IExtensionPoint, ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ILineTokens, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/modes';
import { TMState } from 'vs/editor/node/textMate/TMState';
import { RawLineTokens } from 'vs/editor/common/modes/supports';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IGrammar, Registry, StackElement, IToken } from 'vscode-textmate';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { languagesExtPoint } from 'vs/editor/common/services/modeServiceImpl';

export interface IEmbeddedLanguagesMap {
	[scopeName: string]: string;
}

export interface ITMSyntaxExtensionPoint {
	language: string;
	scopeName: string;
	path: string;
	embeddedLanguages: IEmbeddedLanguagesMap;
	injectTo: string[];
}

// TODO@Martin TS(2.0.2) - Type IJsonSchema has no defined property require. Keeping semantic using any cast
export const grammarsExtPoint: IExtensionPoint<ITMSyntaxExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>('grammars', [languagesExtPoint], <any>{
	description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
	type: 'array',
	defaultSnippets: [{ body: [{ language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' } }],
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.grammars.language', 'Language identifier for which this syntax is contributed to.'),
				type: 'string'
			},
			scopeName: {
				description: nls.localize('vscode.extension.contributes.grammars.scopeName', 'Textmate scope name used by the tmLanguage file.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.grammars.path', 'Path of the tmLanguage file. The path is relative to the extension folder and typically starts with \'./syntaxes/\'.'),
				type: 'string'
			},
			embeddedLanguages: {
				description: nls.localize('vscode.extension.contributes.grammars.embeddedLanguages', 'A map of scope name to language id if this grammar contains embedded languages.'),
				type: 'object'
			},
			injectTo: {
				description: nls.localize('vscode.extension.contributes.grammars.injectTo', 'List of language scope names to which this grammar is injected to.'),
				type: 'array',
				items: {
					type: 'string'
				}
			}
		},
		require: ['scopeName', 'path']
	}
});

export class TMScopeRegistry {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: TMLanguageRegistration; };
	private _encounteredLanguages: { [language: string]: boolean; };

	private _onDidEncounterLanguage: Emitter<string> = new Emitter<string>();
	public onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	constructor() {
		this._scopeNameToLanguageRegistration = Object.create(null);
		this._encounteredLanguages = Object.create(null);
	}

	public register(scopeName: string, filePath: string, embeddedLanguages?: IEmbeddedLanguagesMap): void {
		this._scopeNameToLanguageRegistration[scopeName] = new TMLanguageRegistration(this, scopeName, filePath, embeddedLanguages);
	}

	public getLanguageRegistration(scopeName: string): TMLanguageRegistration {
		return this._scopeNameToLanguageRegistration[scopeName] || null;
	}

	public getFilePath(scopeName: string): string {
		let data = this.getLanguageRegistration(scopeName);
		return data ? data.grammarFilePath : null;
	}

	/**
	 * To be called when tokenization found/hit an embedded language.
	 */
	public onEncounteredLanguage(language: string): void {
		if (!this._encounteredLanguages[language]) {
			this._encounteredLanguages[language] = true;
			this._onDidEncounterLanguage.fire(language);
		}
	}
}

export class TMLanguageRegistration {
	_topLevelScopeNameDataBrand: void;

	readonly scopeName: string;
	readonly grammarFilePath: string;

	private readonly _registry: TMScopeRegistry;
	private readonly _embeddedLanguages: IEmbeddedLanguagesMap;
	private readonly _embeddedLanguagesRegex: RegExp;

	constructor(registry: TMScopeRegistry, scopeName: string, grammarFilePath: string, embeddedLanguages: IEmbeddedLanguagesMap) {
		this._registry = registry;
		this.scopeName = scopeName;
		this.grammarFilePath = grammarFilePath;

		// embeddedLanguages handling
		this._embeddedLanguages = Object.create(null);

		if (embeddedLanguages) {
			// If embeddedLanguages are configured, fill in `this._embeddedLanguages`
			let scopes = Object.keys(embeddedLanguages);
			for (let i = 0, len = scopes.length; i < len; i++) {
				let scope = scopes[i];
				let language = embeddedLanguages[scope];
				if (typeof language !== 'string') {
					// never hurts to be too careful
					continue;
				}
				this._embeddedLanguages[scope] = language;
			}
		}

		// create the regex
		let escapedScopes = Object.keys(this._embeddedLanguages).map((scopeName) => strings.escapeRegExpCharacters(scopeName));
		if (escapedScopes.length === 0) {
			// no scopes registered
			this._embeddedLanguagesRegex = null;
		} else {
			escapedScopes.sort();
			escapedScopes.reverse();
			this._embeddedLanguagesRegex = new RegExp(`^((${escapedScopes.join(')|(')}))($|\\.)`, '');
		}
	}

	/**
	 * Given a produced TM scope, return the language that token describes or null if unknown.
	 * e.g. source.html => html, source.css.embedded.html => css, punctuation.definition.tag.html => null
	 */
	public scopeToLanguage(scope: string): string {
		if (!scope) {
			return null;
		}
		if (!this._embeddedLanguagesRegex) {
			// no scopes registered
			return null;
		}
		let m = scope.match(this._embeddedLanguagesRegex);
		if (!m) {
			// no scopes matched
			return null;
		}

		let language = this._embeddedLanguages[m[1]] || null;
		if (!language) {
			return null;
		}

		this._registry.onEncounteredLanguage(language);
		return language;
	}
}

export class MainProcessTextMateSyntax {
	private _grammarRegistry: Registry;
	private _modeService: IModeService;
	private _scopeRegistry: TMScopeRegistry;
	private _injections: { [scopeName: string]: string[]; };

	public onDidEncounterLanguage: Event<string>;

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
		this._scopeRegistry = new TMScopeRegistry();
		this.onDidEncounterLanguage = this._scopeRegistry.onDidEncounterLanguage;
		this._injections = {};

		this._grammarRegistry = new Registry({
			getFilePath: (scopeName: string) => {
				return this._scopeRegistry.getFilePath(scopeName);
			},
			getInjections: (scopeName: string) => {
				return this._injections[scopeName];
			}
		});

		grammarsExtPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let grammars = extensions[i].value;
				for (let j = 0; j < grammars.length; j++) {
					this._handleGrammarExtensionPointUser(extensions[i].description.extensionFolderPath, grammars[j], extensions[i].collector);
				}
			}
		});
	}

	private _handleGrammarExtensionPointUser(extensionFolderPath: string, syntax: ITMSyntaxExtensionPoint, collector: ExtensionMessageCollector): void {
		if (syntax.language && ((typeof syntax.language !== 'string') || !this._modeService.isRegisteredMode(syntax.language))) {
			collector.error(nls.localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", grammarsExtPoint.name, String(syntax.language)));
			return;
		}
		if (!syntax.scopeName || (typeof syntax.scopeName !== 'string')) {
			collector.error(nls.localize('invalid.scopeName', "Expected string in `contributes.{0}.scopeName`. Provided value: {1}", grammarsExtPoint.name, String(syntax.scopeName)));
			return;
		}
		if (!syntax.path || (typeof syntax.path !== 'string')) {
			collector.error(nls.localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", grammarsExtPoint.name, String(syntax.path)));
			return;
		}
		if (syntax.injectTo && (!Array.isArray(syntax.injectTo) || syntax.injectTo.some(scope => typeof scope !== 'string'))) {
			collector.error(nls.localize('invalid.injectTo', "Invalid value in `contributes.{0}.injectTo`. Must be an array of language scope names. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.injectTo)));
			return;
		}
		if (syntax.embeddedLanguages && !types.isObject(syntax.embeddedLanguages)) {
			collector.error(nls.localize('invalid.embeddedLanguages', "Invalid value in `contributes.{0}.embeddedLanguages`. Must be an object map from scope name to language. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.embeddedLanguages)));
			return;
		}

		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, syntax.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		this._scopeRegistry.register(syntax.scopeName, normalizedAbsolutePath, syntax.embeddedLanguages);

		if (syntax.injectTo) {
			for (let injectScope of syntax.injectTo) {
				let injections = this._injections[injectScope];
				if (!injections) {
					this._injections[injectScope] = injections = [];
				}
				injections.push(syntax.scopeName);
			}
		}

		let modeId = syntax.language;
		if (modeId) {
			let disposable = this._modeService.onDidCreateMode((mode) => {
				if (mode.getId() !== modeId) {
					return;
				}
				this.registerDefinition(modeId, syntax.scopeName);
				disposable.dispose();
			});
		}
	}

	private registerDefinition(modeId: string, scopeName: string): void {
		this._grammarRegistry.loadGrammar(scopeName, (err, grammar) => {
			if (err) {
				onUnexpectedError(err);
				return;
			}

			let languageRegistration = this._scopeRegistry.getLanguageRegistration(scopeName);
			TokenizationRegistry.register(modeId, createTokenizationSupport(languageRegistration, modeId, grammar));
		});
	}
}

function createTokenizationSupport(languageRegistration: TMLanguageRegistration, modeId: string, grammar: IGrammar): ITokenizationSupport {
	var tokenizer = new Tokenizer(languageRegistration, modeId, grammar);
	return {
		getInitialState: () => new TMState(modeId, null, null),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenizer.tokenize(line, <TMState>state, offsetDelta, stopAtOffset)
	};
}

/**
 * Data associated with a text mate scope as part of decoding.
 *
 * e.g.
 * For a scope "punctuation.definition.string.end.html", the tokens are: punctuation, definition, string, end, html.
 * Each of those tokens receive a unique numeric id, so instead of storing the token strings, we store the token ids.
 * Ultimately this means we store something like [23, 21, 12, 13, 1], considering those numbers to be the ids of the tokens.
 */
export class TMScopeDecodeData {
	_tmScopeDecodeDataBrand: void;

	/**
	 * The original text mate scope.
	 */
	public readonly scope: string;

	/**
	 * The language this scope belongs to.
	 * e.g. source.html => html, source.css.embedded.html => css, punctuation.definition.tag.html => null
	 */
	public readonly language: string;

	/**
	 * The token ids this scope consists of.
	 */
	public readonly tokenIds: number[];

	constructor(scope: string, language: string, tokenIds: number[]) {
		this.scope = scope;
		this.language = language;
		this.tokenIds = tokenIds;
	}
}

/**
 * Data associated with a stack of text mate scopes as part of decoding.
 */
export class TMScopesDecodeData {
	_tmScopesDecodeDataBrand: void;

	/**
	 * The last scope in the stack.
	 */
	public readonly scope: string;
	/**
	 * The resolved tokens mask.
	 * tokens[i] === true ===> token with id i is present.
	 */
	public readonly tokensMask: boolean[];
	/**
	 * The resolved language.
	 */
	public readonly language: string;

	constructor(parent: TMScopesDecodeData, scope: TMScopeDecodeData) {
		// 1) Inherit data from `parent`.
		let tokensMask: boolean[];
		let language: string;
		if (parent) {
			tokensMask = parent.tokensMask.slice(0);
			language = parent.language;
		} else {
			tokensMask = [];
			language = null;
		}

		// 2) Overwrite with data from `scope`.
		let scopeTokenIds = scope.tokenIds;
		for (let i = 0, len = scopeTokenIds.length; i < len; i++) {
			tokensMask[scopeTokenIds[i]] = true;
		}
		if (scope.language) {
			language = scope.language;
		}

		this.scope = scope.scope;
		this.tokensMask = tokensMask;
		this.language = language;
	}
}

export class DecodeMap {
	_decodeMapBrand: void;

	private lastAssignedTokenId: number;
	private readonly languageRegistration: TMLanguageRegistration;
	private readonly scopeToTokenIds: { [scope: string]: TMScopeDecodeData; };
	private readonly tokenToTokenId: { [token: string]: number; };
	private readonly tokenIdToToken: string[];
	prevTokenScopes: TMScopesDecodeData[];
	public readonly topLevelScope: TMScopesDecodeData;

	constructor(languageRegistration: TMLanguageRegistration) {
		this.lastAssignedTokenId = 0;
		this.languageRegistration = languageRegistration;
		this.scopeToTokenIds = Object.create(null);
		this.tokenToTokenId = Object.create(null);
		this.tokenIdToToken = [null];
		this.prevTokenScopes = [];
		this.topLevelScope = new TMScopesDecodeData(null, new TMScopeDecodeData(languageRegistration.scopeName, this.languageRegistration.scopeToLanguage(languageRegistration.scopeName), []));
	}

	private _getTokenId(token: string): number {
		let tokenId = this.tokenToTokenId[token];
		if (!tokenId) {
			tokenId = (++this.lastAssignedTokenId);
			this.tokenToTokenId[token] = tokenId;
			this.tokenIdToToken[tokenId] = token;
		}
		return tokenId;
	}

	public decodeTMScope(scope: string): TMScopeDecodeData {
		let result = this.scopeToTokenIds[scope];
		if (result) {
			return result;
		}

		let scopePieces = scope.split('.');

		let tokenIds: number[] = [];
		for (let i = 0; i < scopePieces.length; i++) {
			tokenIds[i] = this._getTokenId(scopePieces[i]);
		}

		result = new TMScopeDecodeData(scope, this.languageRegistration.scopeToLanguage(scope), tokenIds);
		this.scopeToTokenIds[scope] = result;
		return result;
	}

	public getToken(tokenMap: boolean[]): string {
		let result = '';
		let isFirst = true;
		for (let i = 1, len = tokenMap.length; i < len; i++) {
			if (tokenMap[i]) {
				if (isFirst) {
					isFirst = false;
					result += this.tokenIdToToken[i];
				} else {
					result += '.';
					result += this.tokenIdToToken[i];
				}
			}
		}
		return result;
	}
}

function depth(stackElement: StackElement): number {
	let result = 0;
	while (stackElement) {
		result++;
		stackElement = stackElement._parent;
	}
	return result;
}

class Tokenizer {
	private _grammar: IGrammar;
	private _modeId: string;
	private _decodeMap: DecodeMap;

	constructor(languageRegistration: TMLanguageRegistration, modeId: string, grammar: IGrammar) {
		this._modeId = modeId;
		this._grammar = grammar;
		this._decodeMap = new DecodeMap(languageRegistration);
	}

	public tokenize(line: string, state: TMState, offsetDelta: number = 0, stopAtOffset?: number): ILineTokens {
		// Do not attempt to tokenize if a line has over 20k
		// or if the rule stack contains more than 100 rules (indicator of broken grammar that forgets to pop rules)
		if (line.length >= 20000 || depth(state.getRuleStack()) > 100) {
			return new RawLineTokens(
				[new Token(offsetDelta, '')],
				[new ModeTransition(offsetDelta, state.getModeId())],
				offsetDelta,
				state
			);
		}
		let freshState = state.clone();
		let textMateResult = this._grammar.tokenizeLine(line, freshState.getRuleStack());
		freshState.setRuleStack(textMateResult.ruleStack);

		return decodeTextMateTokens(line, offsetDelta, this._decodeMap, textMateResult.tokens, freshState);
	}
}

export function decodeTextMateTokens(line: string, offsetDelta: number, decodeMap: DecodeMap, resultTokens: IToken[], resultState: TMState): RawLineTokens {
	const topLevelModeId = resultState.getModeId();

	// Create the result early and fill in the tokens later
	let tokens: Token[] = [];
	let modeTransitions: ModeTransition[] = [];

	let lastTokenType: string = null;
	let lastModeId: string = null;

	for (let tokenIndex = 0, len = resultTokens.length; tokenIndex < len; tokenIndex++) {
		let token = resultTokens[tokenIndex];
		let tokenStartIndex = token.startIndex;

		let tokenType = '';
		let tokenModeId = topLevelModeId;
		let decodedToken = decodeTextMateToken(decodeMap, token.scopes);
		if (decodedToken) {
			tokenType = decodeMap.getToken(decodedToken.tokensMask);
			if (decodedToken.language) {
				tokenModeId = decodedToken.language;
			}
		}

		// do not push a new token if the type is exactly the same (also helps with ligatures)
		if (tokenType !== lastTokenType) {
			tokens.push(new Token(tokenStartIndex + offsetDelta, tokenType));
			lastTokenType = tokenType;
		}

		if (tokenModeId !== lastModeId) {
			modeTransitions.push(new ModeTransition(tokenStartIndex + offsetDelta, tokenModeId));
			lastModeId = tokenModeId;
		}
	}

	return new RawLineTokens(
		tokens,
		modeTransitions,
		offsetDelta + line.length,
		resultState
	);
}

export function decodeTextMateToken(decodeMap: DecodeMap, scopes: string[]): TMScopesDecodeData {
	const prevTokenScopes = decodeMap.prevTokenScopes;
	const prevTokenScopesLength = prevTokenScopes.length;

	let resultScopes: TMScopesDecodeData[] = [decodeMap.topLevelScope];
	let lastResultScope: TMScopesDecodeData = decodeMap.topLevelScope;

	let sameAsPrev = true;
	for (let level = 1/* deliberately skip scope 0*/, scopesLength = scopes.length; level < scopesLength; level++) {
		let scope = scopes[level];

		if (sameAsPrev && level < prevTokenScopesLength) {
			let prevTokenScope = prevTokenScopes[level];
			if (prevTokenScope.scope === scope) {
				// continue reusing the results of the previous token's computation
				lastResultScope = prevTokenScope;
				resultScopes[level] = lastResultScope;
				continue;
			}
		}
		sameAsPrev = false;

		lastResultScope = new TMScopesDecodeData(lastResultScope, decodeMap.decodeTMScope(scope));
		resultScopes[level] = lastResultScope;
	}

	decodeMap.prevTokenScopes = resultScopes;
	return lastResultScope;
}
