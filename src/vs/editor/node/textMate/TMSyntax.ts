/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {ILineTokens, IMode, IToken, ITokenizationSupport} from 'vs/editor/common/modes';
import {TMState} from 'vs/editor/common/modes/TMState';
import {Token} from 'vs/editor/common/modes/supports';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IGrammar, ITMToken, Registry} from 'vscode-textmate';

export interface ITMSyntaxExtensionPoint {
	language: string;
	scopeName: string;
	path: string;
}

let grammarsExtPoint = ExtensionsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>('grammars', {
	description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
	type: 'array',
	defaultSnippets: [ { body: [{ id: '', extensions: [] }] }],
	items: {
		type: 'object',
		defaultSnippets: [ { body: { language: '{{id}}', scopeName: 'source.{{id}}', path: './syntaxes/{{id}}.tmLanguage.'} }],
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
	private _grammarRegistry: Registry;
	private _modeService: IModeService;
	private _scopeNameToFilePath: { [scopeName:string]: string; };

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
		this._grammarRegistry = new Registry({
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
		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, syntax.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		this._scopeNameToFilePath[syntax.scopeName] = normalizedAbsolutePath;

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
		shouldGenerateEmbeddedModels: false,
		getInitialState: () => new TMState(mode, null, null),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenizer.tokenize(line, <TMState> state, offsetDelta, stopAtOffset)
	};
}



class Tokenizer {
	private _grammar: IGrammar;
	private _modeId: string;

	constructor(modeId:string, grammar: IGrammar) {
		this._modeId = modeId;
		this._grammar = grammar;
	}

	public tokenize(line: string, state: TMState, offsetDelta: number = 0, stopAtOffset?: number): ILineTokens {
		if (line.length >= 20000) {
			return {
				tokens: <IToken[]>[{
					startIndex: offsetDelta,
					type: ''
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
			tokens: <IToken[]>[],
			actualStopOffset: offsetDelta + line.length,
			endState: freshState,
			modeTransitions: [{ startIndex: offsetDelta, mode: freshState.getMode() }],
		};

		let lastTokenType:string = null;
		for (let tokenIndex = 0, len = textMateResult.tokens.length; tokenIndex < len; tokenIndex++) {
			let token = textMateResult.tokens[tokenIndex];
			let tokenStartIndex = token.startIndex;
			let t = decodeTextMateToken(this._modeId, token);

			// do not push a new token if the type is exactly the same (also helps with ligatures)
			if (t.tokenType !== lastTokenType) {
				ret.tokens.push(new Token(tokenStartIndex + offsetDelta, t.tokenType));
				lastTokenType = t.tokenType;
			}
		}

		return ret;
	}
}

function decodeTextMateToken(modeId:string, entry: ITMToken) {
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
	dedupTokens(tokenTypeArray, modeToken, tokenTypes);

	return {
		tokenType: tokenTypes.join('.'),
		modeToken: modeId
	};
}

/**
 * Remove duplicate entries, collect result in `result`, place `modeToken` at the end
 * and detect if this is a comment => return true if it looks like a comment
 */
function dedupTokens(tokenTypeArray:string[], modeToken:string, result:string[]): void {

	tokenTypeArray.sort();

	var prev:string = null,
		curr:string = null;

	for (var i = 0, len = tokenTypeArray.length; i < len; i++) {
		prev = curr;
		curr = tokenTypeArray[i];

		if (curr === prev || curr === modeToken) {
			continue;
		}

		result.push(curr);
	}

	result.push(modeToken);
}
