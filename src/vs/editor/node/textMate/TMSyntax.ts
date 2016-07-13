/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {ILineTokens, IMode, ITokenizationSupport} from 'vs/editor/common/modes';
import {TMState} from 'vs/editor/common/modes/TMState';
import {LineTokens, Token} from 'vs/editor/common/modes/supports';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IGrammar, Registry} from 'vscode-textmate';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

export interface ITMSyntaxExtensionPoint {
	language: string;
	scopeName: string;
	path: string;
	injectTo: string[];
}

let grammarsExtPoint = ExtensionsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>('grammars', {
	description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
	type: 'array',
	defaultSnippets: [ { body: [{ language: '{{id}}', scopeName: 'source.{{id}}', path: './syntaxes/{{id}}.tmLanguage.'}] }],
	items: {
		type: 'object',
		defaultSnippets: [ { body: { language: '{{id}}', scopeName: 'source.{{id}}', path: './syntaxes/{{id}}.tmLanguage.'} }],
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

interface MyEditorConfig {
	useExperimentalParser: boolean;
}

export class MainProcessTextMateSyntax {
	private _grammarRegistry: Registry;
	private _modeService: IModeService;
	private _scopeNameToFilePath: { [scopeName:string]: string; };
	private _injections: { [scopeName:string]: string[]; };

	constructor(
		@IModeService modeService: IModeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this._modeService = modeService;
		this._scopeNameToFilePath = {};
		this._injections = {};

		let editorConfig = configurationService.getConfiguration<MyEditorConfig>('editor');
		let useExperimentalParser = true;
		if (typeof editorConfig.useExperimentalParser !== 'undefined') {
			if (Boolean(editorConfig.useExperimentalParser) === false) {
				useExperimentalParser = false;
			}
		}

		this._grammarRegistry = new Registry({
			getFilePath: (scopeName:string) => {
				return this._scopeNameToFilePath[scopeName];
			},
			getInjections: (scopeName:string) => {
				return this._injections[scopeName];
			}
		}, useExperimentalParser);

		grammarsExtPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let grammars = extensions[i].value;
				for (let j = 0; j < grammars.length; j++) {
					this._handleGrammarExtensionPointUser(extensions[i].description.extensionFolderPath, grammars[j], extensions[i].collector);
				}
			}
		});
	}

	private _handleGrammarExtensionPointUser(extensionFolderPath:string, syntax:ITMSyntaxExtensionPoint, collector: IExtensionMessageCollector): void {
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
		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, syntax.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		this._scopeNameToFilePath[syntax.scopeName] = normalizedAbsolutePath;

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

	public registerDefinition(modeId: string, scopeName: string): void {
		this._grammarRegistry.loadGrammar(scopeName, (err, grammar) => {
			if (err) {
				onUnexpectedError(err);
				return;
			}

			this._modeService.registerTokenizationSupport(modeId, (mode: IMode) => {
				return createTokenizationSupport(mode, grammar);
			});
		});
	}
}

function createTokenizationSupport(mode: IMode, grammar: IGrammar): ITokenizationSupport {
	var tokenizer = new Tokenizer(mode.getId(), grammar);
	return {
		getInitialState: () => new TMState(mode, null, null),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenizer.tokenize(line, <TMState> state, offsetDelta, stopAtOffset)
	};
}

export class DecodeMap {
	_decodeMapBrand: void;

	lastAssignedId: number;
	scopeToTokenIds: { [scope:string]:number[]; };
	tokenToTokenId: { [token:string]:number; };
	tokenIdToToken: string[];
	prevToken: TMTokenDecodeData;

	constructor() {
		this.lastAssignedId = 0;
		this.scopeToTokenIds = Object.create(null);
		this.tokenToTokenId = Object.create(null);
		this.tokenIdToToken = [null];
		this.prevToken = new TMTokenDecodeData([], []);
	}

	public getTokenIds(scope:string): number[] {
		let tokens = this.scopeToTokenIds[scope];
		if (tokens) {
			return tokens;
		}
		let tmpTokens = scope.split('.');

		tokens = [];
		for (let i = 0; i < tmpTokens.length; i++) {
			let token = tmpTokens[i];
			let tokenId = this.tokenToTokenId[token];
			if (!tokenId) {
				tokenId = (++this.lastAssignedId);
				this.tokenToTokenId[token] = tokenId;
				this.tokenIdToToken[tokenId] = token;
			}
			tokens.push(tokenId);
		}

		this.scopeToTokenIds[scope] = tokens;
		return tokens;
	}

	public getToken(tokenMap:boolean[]): string {
		let result = '';
		let isFirst = true;
		for (let i = 1; i <= this.lastAssignedId; i++) {
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

export class TMTokenDecodeData {
	_tmTokenDecodeDataBrand: void;

	public scopes: string[];
	public scopeTokensMaps: boolean[][];

	constructor(scopes:string[], scopeTokensMaps:boolean[][]) {
		this.scopes = scopes;
		this.scopeTokensMaps = scopeTokensMaps;
	}
}

class Tokenizer {
	private _grammar: IGrammar;
	private _modeId: string;
	private _decodeMap: DecodeMap;

	constructor(modeId:string, grammar: IGrammar) {
		this._modeId = modeId;
		this._grammar = grammar;
		this._decodeMap = new DecodeMap();
	}

	public tokenize(line: string, state: TMState, offsetDelta: number = 0, stopAtOffset?: number): ILineTokens {
		if (line.length >= 20000) {
			return new LineTokens(
				[new Token(offsetDelta, '')],
				[new ModeTransition(offsetDelta, state.getMode())],
				offsetDelta,
				state
			);
		}
		let freshState = state.clone();
		let textMateResult = this._grammar.tokenizeLine(line, freshState.getRuleStack());
		freshState.setRuleStack(textMateResult.ruleStack);

		// Create the result early and fill in the tokens later
		let tokens:Token[] = [];

		let lastTokenType:string = null;
		for (let tokenIndex = 0, len = textMateResult.tokens.length; tokenIndex < len; tokenIndex++) {
			let token = textMateResult.tokens[tokenIndex];
			let tokenStartIndex = token.startIndex;
			let tokenType = decodeTextMateToken(this._decodeMap, token.scopes);

			// do not push a new token if the type is exactly the same (also helps with ligatures)
			if (tokenType !== lastTokenType) {
				tokens.push(new Token(tokenStartIndex + offsetDelta, tokenType));
				lastTokenType = tokenType;
			}
		}

		return new LineTokens(
			tokens,
			[new ModeTransition(offsetDelta, freshState.getMode())],
			offsetDelta + line.length,
			freshState
		);
	}
}

export function decodeTextMateToken(decodeMap: DecodeMap, scopes: string[]): string {
	const prevTokenScopes = decodeMap.prevToken.scopes;
	const prevTokenScopesLength = prevTokenScopes.length;
	const prevTokenScopeTokensMaps = decodeMap.prevToken.scopeTokensMaps;

	let scopeTokensMaps: boolean[][] = [];
	let prevScopeTokensMaps: boolean[] = [];
	let sameAsPrev = true;
	for (let level = 1/* deliberately skip scope 0*/; level < scopes.length; level++) {
		let scope = scopes[level];

		if (sameAsPrev) {
			if (level < prevTokenScopesLength && prevTokenScopes[level] === scope) {
				prevScopeTokensMaps = prevTokenScopeTokensMaps[level];
				scopeTokensMaps[level] = prevScopeTokensMaps;
				continue;
			}
			sameAsPrev = false;
		}

		let tokens = decodeMap.getTokenIds(scope);
		prevScopeTokensMaps = prevScopeTokensMaps.slice(0);
		for (let i = 0; i < tokens.length; i++) {
			prevScopeTokensMaps[tokens[i]] = true;
		}
		scopeTokensMaps[level] = prevScopeTokensMaps;
	}

	decodeMap.prevToken = new TMTokenDecodeData(scopes, scopeTokensMaps);
	return decodeMap.getToken(prevScopeTokensMaps);
}
