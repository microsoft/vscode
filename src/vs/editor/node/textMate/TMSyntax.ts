/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import paths = require('vs/base/common/paths');
import errors = require('vs/base/common/errors');

import Modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import collections = require('vs/base/common/collections');
import textMate = require('vscode-textmate');
import TMState = require('vs/editor/common/modes/TMState');
import {IModeService} from 'vs/editor/common/services/modeService';
import {PluginsRegistry, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';

export interface ITMSyntaxExtensionPoint {
	language: string;
	scopeName: string;
	path: string;
}

let grammarsExtPoint = PluginsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>('grammars', {
	description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
	type: 'array',
	default: [{ id: '', extensions: [] }],
	items: {
		type: 'object',
		default: { language: '{{id}}', scopeName: 'source.{{id}}', path: './syntaxes/{{id}}.tmLanguage.'},
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.grammars.language', 'Language id for which this syntax is contributed to.'),
				type: 'string'
			},
			scopeName: {
				description: nls.localize('vscode.extension.contributes.grammars.scopeName', 'Textmate scope name used by the tmLanguage file.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.grammars.path', 'Path of the tmLanguage file. The path is relative to the extension folder and typically starts with \'./syntaxes/\'.'),
				type: 'string'
			}
		}
	}
});

export class MainProcessTextMateSyntax {
	private _grammarRegistry: textMate.Registry;
	private _modeService: IModeService;
	private _scopeNameToFilePath: { [scopeName:string]: string; };

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
		this._grammarRegistry = new textMate.Registry({
			getFilePath: (scopeName:string) => {
				return this._scopeNameToFilePath[scopeName];
			}
		});
		this._scopeNameToFilePath = {};

		grammarsExtPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let grammars = extensions[i].value;
				for (let j = 0; j < grammars.length; j++) {
					this._handleGrammarExtensionPointUser(extensions[i].description.extensionFolderPath, grammars[j], extensions[i].collector);
				}
			}
		});
	}

	private _handleGrammarExtensionPointUser(extensionFolderPath:string, syntax:ITMSyntaxExtensionPoint, collector: IMessageCollector): void {
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
		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, syntax.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		this._scopeNameToFilePath[syntax.scopeName] = normalizedAbsolutePath;

		let modeId = syntax.language;
		if (modeId) {
			PluginsRegistry.registerOneTimeActivationEventListener('onLanguage:' + modeId, () => {
				this.registerDefinition(modeId, syntax.scopeName);
			});
		}
	}

	public registerDefinition(modeId: string, scopeName: string): void {
		this._grammarRegistry.loadGrammar(scopeName, (err, grammar) => {
			if (err) {
				errors.onUnexpectedError(err);
				return;
			}

			this._modeService.registerTokenizationSupport(modeId, (mode: Modes.IMode) => {
				return createTokenizationSupport(mode, grammar);
			});
		});
	}
}

function createTokenizationSupport(mode: Modes.IMode, grammar: textMate.IGrammar): Modes.ITokenizationSupport {
	var tokenizer = new Tokenizer(mode.getId(), grammar);
	return {
		shouldGenerateEmbeddedModels: false,
		getInitialState: () => new TMState.TMState(mode, null, null),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenizer.tokenize(line, <TMState.TMState> state, offsetDelta, stopAtOffset)
	};
}



class Tokenizer {
	private _grammar: textMate.IGrammar;
	private _modeId: string;

	constructor(modeId:string, grammar: textMate.IGrammar) {
		this._modeId = modeId;
		this._grammar = grammar;
	}

	public tokenize(line: string, state: TMState.TMState, offsetDelta: number = 0, stopAtOffset?: number): Modes.ILineTokens {
		if (line.length >= 20000) {
			return {
				tokens: <Modes.IToken[]>[{
					startIndex: offsetDelta,
					type: '',
					bracket: Modes.Bracket.None
				}],
				actualStopOffset: offsetDelta,
				endState: state,
				modeTransitions: [{ startIndex: offsetDelta, mode: state.getMode() }],
			};
		}
		let freshState = state.clone();
		let textMateResult = this._grammar.tokenizeLine(line, freshState.getRuleStack());
		freshState.setRuleStack(textMateResult.ruleStack);

		// Create the result early and fill in the tokens later
		let ret = {
			tokens: <Modes.IToken[]>[],
			actualStopOffset: offsetDelta + line.length,
			endState: freshState,
			modeTransitions: [{ startIndex: offsetDelta, mode: freshState.getMode() }],
		};

		for (let tokenIndex = 0, len = textMateResult.tokens.length; tokenIndex < len; tokenIndex++) {
			let token = textMateResult.tokens[tokenIndex];
			let tokenStartIndex = token.startIndex;
			let tokenEndIndex = (tokenIndex + 1 < len ? textMateResult.tokens[tokenIndex + 1].startIndex : line.length);

			let t = decodeTextMateToken(this._modeId, token);

			if (t.isOpaqueToken) {
				// Should not do any smartness to detect brackets on this token
				ret.tokens.push(new supports.Token(tokenStartIndex + offsetDelta, t.tokenType));
				continue;
			}

			let i: number,
				charCode: number,
				isBracket: string;

			for (i = tokenStartIndex; i < tokenEndIndex; i++) {
				charCode = line.charCodeAt(i);
				isBracket = null;

				switch (charCode) {
					case _openParen: // (
						isBracket = 'delimiter.paren';
						break;
					case _closeParen: // )
						isBracket = 'delimiter.paren';
						break;
					case _openCurly: // {
						isBracket = 'delimiter.curly';
						break;
					case _closeCurly: // }
						isBracket = 'delimiter.curly';
						break;
					case _openSquare: // [
						isBracket = 'delimiter.square';
						break;
					case _closeSquare: // ]
						isBracket = 'delimiter.square';
						break;
				}

				if (isBracket) {
					if (tokenStartIndex < i) {
						// push a token before character `i`
						ret.tokens.push(new supports.Token(tokenStartIndex + offsetDelta, t.tokenType));
						tokenStartIndex = i;
					}

					// push character `i` as a token
					ret.tokens.push(new supports.Token(tokenStartIndex + offsetDelta, isBracket + '.' + t.modeToken));
					tokenStartIndex = i + 1;
				}
			}

			if (tokenStartIndex < tokenEndIndex) {
				// push the remaining text as a token
				ret.tokens.push(new supports.Token(tokenStartIndex + offsetDelta, t.tokenType));
			}
		}

		return ret;
	}
}

function decodeTextMateToken(modeId:string, entry: textMate.IToken) {
	let tokenTypeArray: string[] = [];
	for (let level = 1 /* deliberately skip scope 0*/; level < entry.scopes.length; ++level) {
		tokenTypeArray = tokenTypeArray.concat(entry.scopes[level].split('.'));
	}
	let modeToken = '';
	if (entry.scopes.length > 0) {
		let dotIndex = entry.scopes[0].lastIndexOf('.');
		if (dotIndex >= 0) {
			modeToken = entry.scopes[0].substr(dotIndex + 1);
		}
	}
	let tokenTypes: string[] = [];
	let isOpaqueToken = dedupTokens(tokenTypeArray, modeToken, tokenTypes);

	return {
		isOpaqueToken: isOpaqueToken,
		tokenType: tokenTypes.join('.'),
		modeToken: modeId
	};
}

/**
 * Remove duplicate entries, collect result in `result`, place `modeToken` at the end
 * and detect if this is a comment => return true if it looks like a comment
 */
function dedupTokens(tokenTypeArray:string[], modeToken:string, result:string[]): boolean {

	tokenTypeArray.sort();

	var prev:string = null,
		curr:string = null,
		isOpaqueToken = false;

	for (var i = 0, len = tokenTypeArray.length; i < len; i++) {
		prev = curr;
		curr = tokenTypeArray[i];

		if (curr === prev || curr === modeToken) {
			continue;
		}

		result.push(curr);

		if (!isOpaqueToken && (curr === 'comment' || curr === 'string' || curr === 'regexp')) {
			isOpaqueToken = true;
		}
	}

	result.push(modeToken);

	return isOpaqueToken;
}


var _openParen = '('.charCodeAt(0);
var _closeParen = ')'.charCodeAt(0);
var _openCurly = '{'.charCodeAt(0);
var _closeCurly = '}'.charCodeAt(0);
var _openSquare = '['.charCodeAt(0);
var _closeSquare = ']'.charCodeAt(0);

var characterToBracket = collections.createNumberDictionary<number>();
characterToBracket['('.charCodeAt(0)] = Modes.Bracket.Open;
characterToBracket[')'.charCodeAt(0)] = Modes.Bracket.Close;
characterToBracket['{'.charCodeAt(0)] = Modes.Bracket.Open;
characterToBracket['}'.charCodeAt(0)] = Modes.Bracket.Close;
characterToBracket['['.charCodeAt(0)] = Modes.Bracket.Open;
characterToBracket[']'.charCodeAt(0)] = Modes.Bracket.Close;