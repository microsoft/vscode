/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { BracketKind } from 'vs/editor/common/languages/supports/languageBracketsConfiguration';
import { BracketAstNode } from './ast';
import { toLength } from './length';
import { DenseKeyProvider, identityKeyProvider, SmallImmutableSet } from './smallImmutableSet';
import { OpeningBracketId, Token, TokenKind } from './tokenizer';

export class BracketTokens {
	static createFromLanguage(configuration: ResolvedLanguageConfiguration, denseKeyProvider: DenseKeyProvider<string>): BracketTokens {
		function getId(bracketInfo: BracketKind): OpeningBracketId {
			return denseKeyProvider.getKey(`${bracketInfo.languageId}:::${bracketInfo.bracketText}`);
		}

		const map = new Map<string, Token>();
		for (const openingBracket of configuration.bracketsNew.openingBrackets) {
			const length = toLength(0, openingBracket.bracketText.length);
			const openingTextId = getId(openingBracket);
			const bracketIds = SmallImmutableSet.getEmpty().add(openingTextId, identityKeyProvider);
			map.set(openingBracket.bracketText, new Token(
				length,
				TokenKind.OpeningBracket,
				openingTextId,
				bracketIds,
				BracketAstNode.create(length, openingBracket, bracketIds)
			));
		}

		for (const closingBracket of configuration.bracketsNew.closingBrackets) {
			const length = toLength(0, closingBracket.bracketText.length);
			let bracketIds = SmallImmutableSet.getEmpty();
			const closingBrackets = closingBracket.getOpeningBrackets();
			for (const bracket of closingBrackets) {
				bracketIds = bracketIds.add(getId(bracket), identityKeyProvider);
			}
			map.set(closingBracket.bracketText, new Token(
				length,
				TokenKind.ClosingBracket,
				getId(closingBrackets[0]),
				bracketIds,
				BracketAstNode.create(length, closingBracket, bracketIds)
			));
		}

		return new BracketTokens(map);
	}

	private hasRegExp = false;
	private _regExpGlobal: RegExp | null = null;

	constructor(
		private readonly map: Map<string, Token>
	) { }

	getRegExpStr(): string | null {
		if (this.isEmpty) {
			return null;
		} else {
			const keys = [...this.map.keys()];
			keys.sort();
			keys.reverse();
			return keys.map(k => prepareBracketForRegExp(k)).join('|');
		}
	}

	/**
	 * Returns null if there is no such regexp (because there are no brackets).
	*/
	get regExpGlobal(): RegExp | null {
		if (!this.hasRegExp) {
			const regExpStr = this.getRegExpStr();
			this._regExpGlobal = regExpStr ? new RegExp(regExpStr, 'gi') : null;
			this.hasRegExp = true;
		}
		return this._regExpGlobal;
	}

	getToken(value: string): Token | undefined {
		return this.map.get(value.toLowerCase());
	}

	findClosingTokenText(openingBracketIds: SmallImmutableSet<OpeningBracketId>): string | undefined {
		for (const [closingText, info] of this.map) {
			if (info.kind === TokenKind.ClosingBracket && info.bracketIds.intersects(openingBracketIds)) {
				return closingText;
			}
		}
		return undefined;
	}

	get isEmpty(): boolean {
		return this.map.size === 0;
	}
}

function prepareBracketForRegExp(str: string): string {
	let escaped = escapeRegExpCharacters(str);
	// These bracket pair delimiters start or end with letters
	// see https://github.com/microsoft/vscode/issues/132162 https://github.com/microsoft/vscode/issues/150440
	if (/^[\w ]+/.test(str)) {
		escaped = `\\b${escaped}`;
	}
	if (/[\w ]+$/.test(str)) {
		escaped = `${escaped}\\b`;
	}
	return escaped;
}

export class LanguageAgnosticBracketTokens {
	private readonly languageIdToBracketTokens = new Map<string, BracketTokens>();

	constructor(
		private readonly denseKeyProvider: DenseKeyProvider<string>,
		private readonly getLanguageConfiguration: (languageId: string) => ResolvedLanguageConfiguration,
	) {
	}

	public didLanguageChange(languageId: string): boolean {
		// Report a change whenever the language configuration updates.
		return this.languageIdToBracketTokens.has(languageId);
	}

	getSingleLanguageBracketTokens(languageId: string): BracketTokens {
		let singleLanguageBracketTokens = this.languageIdToBracketTokens.get(languageId);
		if (!singleLanguageBracketTokens) {
			singleLanguageBracketTokens = BracketTokens.createFromLanguage(this.getLanguageConfiguration(languageId), this.denseKeyProvider);
			this.languageIdToBracketTokens.set(languageId, singleLanguageBracketTokens);
		}
		return singleLanguageBracketTokens;
	}

	getToken(value: string, languageId: string): Token | undefined {
		const singleLanguageBracketTokens = this.getSingleLanguageBracketTokens(languageId);
		return singleLanguageBracketTokens.getToken(value);
	}
}
