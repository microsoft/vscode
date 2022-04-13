/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from 'vs/base/common/lifecycle';
import { EncodedTokenizationResult, IState, ITokenizationSupport, TokenizationResult } from 'vs/editor/common/languages';
import { IValidTSGrammarDefinition } from 'vs/workbench/services/treeSitter/common/TSService';
import * as Parser from 'web-tree-sitter';

export class TSTokenization extends Disposable implements ITokenizationSupport {
	private parser: Parser | null;
	private _grammar: IValidTSGrammarDefinition;

	constructor(grammar: IValidTSGrammarDefinition) {
		super();
		this.parser = null;
		this._grammar = grammar;
	}

	public async init() {
		try {
			await Parser.init();
		} catch (e) {
			console.log(e);
		}
		// this.parser = new Parser();
		// const language = await Parser.Language.load(this._grammar.location.path);
		// this.parser.setLanguage(language);
	}

	public getInitialState(): IState {
		throw new Error('Not supported!');
	}

	public tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error('Not supported!');
	}

	public tokenizeEncoded(line: string, hasEOL: boolean): EncodedTokenizationResult {
		throw new Error('Not supported!');
	}
}
