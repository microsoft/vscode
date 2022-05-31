/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from 'vs/base/common/cache';
import { BugIndicatingError } from 'vs/base/common/errors';
import { LanguageConfiguration } from 'vs/editor/common/languages/languageConfiguration';

/**
 * Captures all bracket related configurations for a single language.
 * Immutable.
*/
export class LanguageBracketsConfiguration {
	private readonly _openingBrackets: ReadonlyMap<string, OpeningBracketKind>;
	private readonly _closingBrackets: ReadonlyMap<string, ClosingBracketKind>;

	constructor(
		public readonly languageId: string,
		config: LanguageConfiguration,
	) {
		let brackets: [string, string][];

		// Prefer colorized bracket pairs, as they are more accurate.
		// TODO@hediet: Deprecate `colorizedBracketPairs` and increase accuracy for brackets.
		if (config.colorizedBracketPairs) {
			brackets = filterValidBrackets(config.colorizedBracketPairs.map(b => [b[0], b[1]]));
		} else if (config.brackets) {
			brackets = filterValidBrackets(config.brackets
				.map((b) => [b[0], b[1]] as [string, string])
				// Many languages set < ... > as bracket pair, even though they also use it as comparison operator.
				// This leads to problems when colorizing this bracket, so we exclude it by default.
				// Languages can still override this by configuring `colorizedBracketPairs`
				// https://github.com/microsoft/vscode/issues/132476
				.filter((p) => !(p[0] === '<' && p[1] === '>')));
		} else {
			brackets = [];
		}

		const openingBracketInfos = new CachedFunction((bracket: string) => {
			const closing = new Set<ClosingBracketKind>();
			return {
				info: new OpeningBracketKind(this, bracket, closing),
				closing,
			};
		});
		const closingBracketInfos = new CachedFunction((bracket: string) => {
			const opening = new Set<OpeningBracketKind>();
			return {
				info: new ClosingBracketKind(this, bracket, opening),
				opening,
			};
		});

		for (const [open, close] of brackets) {
			const opening = openingBracketInfos.get(open);
			const closing = closingBracketInfos.get(close);

			opening.closing.add(closing.info);
			closing.opening.add(opening.info);
		}

		this._openingBrackets = new Map([...openingBracketInfos.cachedValues].map(([k, v]) => [k, v.info]));
		this._closingBrackets = new Map([...closingBracketInfos.cachedValues].map(([k, v]) => [k, v.info]));
	}

	/**
	 * No two brackets have the same bracket text.
	*/
	public get openingBrackets(): readonly OpeningBracketKind[] {
		return [...this._openingBrackets.values()];
	}

	/**
	 * No two brackets have the same bracket text.
	*/
	public get closingBrackets(): readonly ClosingBracketKind[] {
		return [...this._closingBrackets.values()];
	}

	public getOpeningBracketInfo(bracketText: string): OpeningBracketKind | undefined {
		return this._openingBrackets.get(bracketText);
	}

	public getClosingBracketInfo(bracketText: string): ClosingBracketKind | undefined {
		return this._closingBrackets.get(bracketText);
	}

	public getBracketInfo(bracketText: string): BracketKind | undefined {
		return this.getOpeningBracketInfo(bracketText) || this.getClosingBracketInfo(bracketText);
	}
}

function filterValidBrackets(bracketPairs: [string, string][]): [string, string][] {
	return bracketPairs.filter(([open, close]) => open !== '' && close !== '');
}

export type BracketKind = OpeningBracketKind | ClosingBracketKind;

export class BracketKindBase {
	constructor(
		protected readonly config: LanguageBracketsConfiguration,
		public readonly bracketText: string,
	) { }

	public get languageId(): string {
		return this.config.languageId;
	}
}

export class OpeningBracketKind extends BracketKindBase {
	public readonly isOpeningBracket = true;

	constructor(
		config: LanguageBracketsConfiguration,
		bracketText: string,
		public readonly openedBrackets: ReadonlySet<ClosingBracketKind>
	) {
		super(config, bracketText);
	}
}

export class ClosingBracketKind extends BracketKindBase {
	public readonly isOpeningBracket = false;

	constructor(
		config: LanguageBracketsConfiguration,
		bracketText: string,
		/**
		 * Non empty array of all opening brackets this bracket closes.
		*/
		public readonly closedBrackets: ReadonlySet<OpeningBracketKind>
	) {
		super(config, bracketText);
	}

	/**
	 * Checks if this bracket closes the given other bracket.
	 * Brackets from other language configuration can be used (they will always return false).
	 * If other is a bracket with the same language id, they have to be from the same configuration.
	*/
	public closes(other: OpeningBracketKind): boolean {
		if (other.languageId === this.languageId) {
			if (other['config'] !== this.config) {
				throw new BugIndicatingError('Brackets from different language configuration cannot be used.');
			}
		}

		return this.closedBrackets.has(other);
	}

	public getClosedBrackets(): readonly OpeningBracketKind[] {
		return [...this.closedBrackets];
	}
}
