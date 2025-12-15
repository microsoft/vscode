/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from '../../../../base/common/cache.js';
import { RegExpOptions } from '../../../../base/common/strings.js';
import { LanguageConfiguration } from '../languageConfiguration.js';
import { createBracketOrRegExp } from './richEditBrackets.js';

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
		const bracketPairs = config.brackets ? filterValidBrackets(config.brackets) : [];
		const openingBracketInfos = new CachedFunction((bracket: string) => {
			const closing = new Set<ClosingBracketKind>();

			return {
				info: new OpeningBracketKind(this, bracket, closing),
				closing,
			};
		});
		const closingBracketInfos = new CachedFunction((bracket: string) => {
			const opening = new Set<OpeningBracketKind>();
			const openingColorized = new Set<OpeningBracketKind>();
			return {
				info: new ClosingBracketKind(this, bracket, opening, openingColorized),
				opening,
				openingColorized,
			};
		});

		for (const [open, close] of bracketPairs) {
			const opening = openingBracketInfos.get(open);
			const closing = closingBracketInfos.get(close);

			opening.closing.add(closing.info);
			closing.opening.add(opening.info);
		}

		// Treat colorized brackets as brackets, and mark them as colorized.
		const colorizedBracketPairs = config.colorizedBracketPairs
			? filterValidBrackets(config.colorizedBracketPairs)
			// If not configured: Take all brackets except `<` ... `>`
			// Many languages set < ... > as bracket pair, even though they also use it as comparison operator.
			// This leads to problems when colorizing this bracket, so we exclude it if not explicitly configured otherwise.
			// https://github.com/microsoft/vscode/issues/132476
			: bracketPairs.filter((p) => !(p[0] === '<' && p[1] === '>'));
		for (const [open, close] of colorizedBracketPairs) {
			const opening = openingBracketInfos.get(open);
			const closing = closingBracketInfos.get(close);

			opening.closing.add(closing.info);
			closing.openingColorized.add(opening.info);
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

	public getBracketRegExp(options?: RegExpOptions): RegExp {
		const brackets = Array.from([...this._openingBrackets.keys(), ...this._closingBrackets.keys()]);
		return createBracketOrRegExp(brackets, options);
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
		public readonly openedBrackets: ReadonlySet<ClosingBracketKind>,
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
		public readonly openingBrackets: ReadonlySet<OpeningBracketKind>,
		private readonly openingColorizedBrackets: ReadonlySet<OpeningBracketKind>,
	) {
		super(config, bracketText);
	}

	/**
	 * Checks if this bracket closes the given other bracket.
	 * If the bracket infos come from different configurations, this method will return false.
	*/
	public closes(other: OpeningBracketKind): boolean {
		if (other['config'] !== this.config) {
			return false;
		}
		return this.openingBrackets.has(other);
	}

	public closesColorized(other: OpeningBracketKind): boolean {
		if (other['config'] !== this.config) {
			return false;
		}
		return this.openingColorizedBrackets.has(other);
	}

	public getOpeningBrackets(): readonly OpeningBracketKind[] {
		return [...this.openingBrackets];
	}
}
