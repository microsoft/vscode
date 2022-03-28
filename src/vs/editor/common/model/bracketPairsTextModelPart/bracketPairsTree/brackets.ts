/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { BracketAstNode } from './ast';
import { toLength } from './length';
import { DenseKeyProvider, identityKeyProvider, SmallImmutableSet } from './smallImmutableSet';
import { OpeningBracketId, Token, TokenKind } from './tokenizer';

export class BracketTokens {
	static createFromLanguage(configuration: ResolvedLanguageConfiguration, denseKeyProvider: DenseKeyProvider<string>): BracketTokens {
		function getId(languageId: string, openingText: string): OpeningBracketId {
			return denseKeyProvider.getKey(`${languageId}:::${openingText}`);
		}

		const brackets = configuration.characterPair.getColorizedBrackets();

		const closingBrackets = new Map</* closingText */ string, { openingBrackets: SmallImmutableSet<OpeningBracketId>; first: OpeningBracketId }>();
		const openingBrackets = new Set</* openingText */ string>();

		for (const [openingText, closingText] of brackets) {
			openingBrackets.add(openingText);

			let info = closingBrackets.get(closingText);
			const openingTextId = getId(configuration.languageId, openingText);
			if (!info) {
				info = { openingBrackets: SmallImmutableSet.getEmpty(), first: openingTextId };
				closingBrackets.set(closingText, info);
			}
			info.openingBrackets = info.openingBrackets.add(openingTextId, identityKeyProvider);
		}

		const map = new Map<string, Token>();

		for (const [closingText, info] of closingBrackets) {
			const length = toLength(0, closingText.length);
			map.set(closingText, new Token(
				length,
				TokenKind.ClosingBracket,
				info.first,
				info.openingBrackets,
				BracketAstNode.create(length, configuration.languageId, closingText, info.openingBrackets)
			));
		}

		for (const openingText of openingBrackets) {
			const length = toLength(0, openingText.length);
			const openingTextId = getId(configuration.languageId, openingText);
			const bracketIds = SmallImmutableSet.getEmpty().add(openingTextId, identityKeyProvider);
			map.set(openingText, new Token(
				length,
				TokenKind.OpeningBracket,
				openingTextId,
				bracketIds,
				BracketAstNode.create(length, configuration.languageId, openingText, bracketIds)
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
			this._regExpGlobal = regExpStr ? new RegExp(regExpStr, 'g') : null;
			this.hasRegExp = true;
		}
		return this._regExpGlobal;
	}

	getToken(value: string): Token | undefined {
		return this.map.get(value);
	}

	findClosingTokenText(openingBracketIds: SmallImmutableSet<OpeningBracketId>): string | undefined {
		for (const [closingText, info] of this.map) {
			if (info.bracketIds.intersects(openingBracketIds)) {
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
	const escaped = escapeRegExpCharacters(str);
	// This bracket pair uses letters like e.g. "begin" - "end" (see https://github.com/microsoft/vscode/issues/132162)
	const needsWordBoundaries = (/^[\w ]+$/.test(str));
	return (needsWordBoundaries ? `\\b${escaped}\\b` : escaped);
}

export class LanguageAgnosticBracketTokens {
	private readonly languageIdToBracketTokens = new Map<string, BracketTokens>();

	constructor(
		private readonly denseKeyProvider: DenseKeyProvider<string>,
		private readonly getLanguageConfiguration: (languageId: string) => ResolvedLanguageConfiguration,
	) {
	}

	public didLanguageChange(languageId: string): boolean {
		const existing = this.languageIdToBracketTokens.get(languageId);
		if (!existing) {
			return false;
		}
		const newRegExpStr = BracketTokens.createFromLanguage(this.getLanguageConfiguration(languageId), this.denseKeyProvider).getRegExpStr();
		return existing.getRegExpStr() !== newRegExpStr;
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
