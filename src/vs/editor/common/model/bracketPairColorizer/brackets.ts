/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { LanguageId } from 'vs/editor/common/modes';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { BracketAstNode } from './ast';
import { toLength } from './length';
import { Token, TokenKind } from './tokenizer';

export class BracketTokens {
	static createFromLanguage(languageId: LanguageId, customBracketPairs: readonly [string, string][]): BracketTokens {
		const brackets = [...(LanguageConfigurationRegistry.getColorizedBracketPairs(languageId))];

		const tokens = new BracketTokens();

		let idxOffset = 0;
		for (const pair of brackets) {
			tokens.addBracket(languageId, pair[0], TokenKind.OpeningBracket, idxOffset);
			tokens.addBracket(languageId, pair[1], TokenKind.ClosingBracket, idxOffset);
			idxOffset++;
		}

		for (const pair of customBracketPairs) {
			idxOffset++;
			tokens.addBracket(languageId, pair[0], TokenKind.OpeningBracket, idxOffset);
			tokens.addBracket(languageId, pair[1], TokenKind.ClosingBracket, idxOffset);
		}

		return tokens;
	}

	private hasRegExp = false;
	private _regExpGlobal: RegExp | null = null;
	private readonly map = new Map<string, Token>();

	private addBracket(languageId: LanguageId, value: string, kind: TokenKind, idx: number): void {
		const length = toLength(0, value.length);
		this.map.set(value,
			new Token(
				length,
				kind,
				// A language can have at most 1000 bracket pairs.
				languageId * 1000 + idx,
				languageId,
				BracketAstNode.create(length)
			)
		);
	}

	getRegExpStr(): string | null {
		if (this.isEmpty) {
			return null;
		} else {
			const keys = [...this.map.keys()];
			keys.sort();
			keys.reverse();
			return keys.map(k => escapeRegExpCharacters(k)).join('|');
		}
	}

	/**
	 * Returns null if there is no such regexp (because there are no brackets).
	*/
	get regExpGlobal(): RegExp | null {
		if (!this.hasRegExp) {
			const regExpStr = this.getRegExpStr();
			this._regExpGlobal = regExpStr ? new RegExp(regExpStr, 'g') : null;
			this.hasRegExp = true;
		}
		return this._regExpGlobal;
	}

	getToken(value: string): Token | undefined {
		return this.map.get(value);
	}

	get isEmpty(): boolean {
		return this.map.size === 0;
	}
}

export class LanguageAgnosticBracketTokens {
	private readonly languageIdToBracketTokens: Map<LanguageId, BracketTokens> = new Map();

	constructor(private readonly customBracketPairs: readonly [string, string][]) {
	}

	public didLanguageChange(languageId: LanguageId): boolean {
		const existing = this.languageIdToBracketTokens.get(languageId);
		if (!existing) {
			return false;
		}
		const newRegExpStr = BracketTokens.createFromLanguage(languageId, this.customBracketPairs).getRegExpStr();
		return existing.getRegExpStr() !== newRegExpStr;
	}

	getSingleLanguageBracketTokens(languageId: LanguageId): BracketTokens {
		let singleLanguageBracketTokens = this.languageIdToBracketTokens.get(languageId);
		if (!singleLanguageBracketTokens) {
			singleLanguageBracketTokens = BracketTokens.createFromLanguage(languageId, this.customBracketPairs);
			this.languageIdToBracketTokens.set(languageId, singleLanguageBracketTokens);
		}
		return singleLanguageBracketTokens;
	}

	getToken(value: string, languageId: LanguageId): Token | undefined {
		const singleLanguageBracketTokens = this.getSingleLanguageBracketTokens(languageId);
		return singleLanguageBracketTokens.getToken(value);
	}
}
