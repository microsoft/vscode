/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/platform/registry/common/platform';
import { Color } from 'vs/base/common/color';
import { ITheme } from 'vs/platform/theme/common/themeService';
import * as nls from 'vs/nls';

import { editorForeground } from 'vs/platform/theme/common/colorRegistry';

//  ------ API types

export const TOKEN_TYPE_WILDCARD = '*';
export const TOKEN_TYPE_WILDCARD_NUM = -1;

// qualified string [type|*](.modifier)*
export type TokenClassificationString = string;

export interface TokenClassification {
	type: number;
	modifiers: number;
}

export interface TokenTypeOrModifierContribution {
	readonly num: number;
	readonly id: string;
	readonly description: string;
	readonly deprecationMessage: string | undefined;
}


export interface TokenStyleData {
	foreground?: Color;
	bold?: boolean;
	underline?: boolean;
	italic?: boolean;
}

export class TokenStyle implements Readonly<TokenStyleData> {
	constructor(
		public readonly foreground?: Color,
		public readonly bold?: boolean,
		public readonly underline?: boolean,
		public readonly italic?: boolean,
	) {
	}
}

export namespace TokenStyle {
	export function fromData(data: { foreground?: Color, bold?: boolean, underline?: boolean, italic?: boolean }) {
		return new TokenStyle(data.foreground, data.bold, data.underline, data.italic);
	}
}

export type ProbeScope = string[];

export interface TokenStyleFunction {
	(theme: ITheme): TokenStyle | undefined;
}

export interface TokenStyleDefaults {
	scopesToProbe: ProbeScope[];
	light: TokenStyleValue | null;
	dark: TokenStyleValue | null;
	hc: TokenStyleValue | null;
}

export interface TokenStylingDefaultRule {
	classification: TokenClassification;
	matchScore: number;
	defaults: TokenStyleDefaults;
}

export interface TokenStylingRule {
	classification: TokenClassification;
	matchScore: number;
	value: TokenStyle;
}

/**
 * A TokenStyle Value is either a token style literal, or a TokenClassificationString
 */
export type TokenStyleValue = TokenStyle | TokenClassificationString;

// TokenStyle registry
export const Extensions = {
	TokenClassificationContribution: 'base.contributions.tokenClassification'
};

export interface ITokenClassificationRegistry {

	/**
	 * Register a token type to the registry.
	 * @param id The TokenType id as used in theme description files
	 * @description the description
	 */
	registerTokenType(id: string, description: string): void;

	/**
	 * Register a token modifier to the registry.
	 * @param id The TokenModifier id as used in theme description files
	 * @description the description
	 */
	registerTokenModifier(id: string, description: string): void;

	getTokenClassificationFromString(str: TokenClassificationString): TokenClassification | undefined;
	getTokenClassification(type: string, modifiers: string[]): TokenClassification | undefined;

	/**
	 * Register a TokenStyle default to the registry.
	 * @param selector The rule selector
	 * @param defaults The default values
	 */
	registerTokenStyleDefault(selector: TokenClassification, defaults: TokenStyleDefaults): void;

	/**
	 * Deregister a TokenType from the registry.
	 */
	deregisterTokenType(id: string): void;

	/**
	 * Deregister a TokenModifier from the registry.
	 */
	deregisterTokenModifier(id: string): void;

	/**
	 * Get all TokenType contributions
	 */
	getTokenTypes(): TokenTypeOrModifierContribution[];

	/**
	 * Get all TokenModifier contributions
	 */
	getTokenModifiers(): TokenTypeOrModifierContribution[];

	/**
	 * Resolves a token classification against the given rules and default rules from the registry.
	 */
	resolveTokenStyle(classification: TokenClassification, themingRules: TokenStylingRule[], useDefault: boolean, theme: ITheme): TokenStyle | undefined;
}



class TokenClassificationRegistry implements ITokenClassificationRegistry {

	private currentTypeNumber = 0;
	private currentModifierBit = 1;

	private tokenTypeById: { [key: string]: TokenTypeOrModifierContribution };
	private tokenModifierById: { [key: string]: TokenTypeOrModifierContribution };

	private tokenStylingDefaultRules: TokenStylingDefaultRule[] = [];

	constructor() {
		this.tokenTypeById = {};
		this.tokenModifierById = {};

		this.tokenTypeById[TOKEN_TYPE_WILDCARD] = { num: TOKEN_TYPE_WILDCARD_NUM, id: TOKEN_TYPE_WILDCARD, description: '', deprecationMessage: undefined };
	}

	public registerTokenType(id: string, description: string, deprecationMessage?: string): void {
		const num = this.currentTypeNumber++;
		let tokenStyleContribution: TokenTypeOrModifierContribution = { num, id, description, deprecationMessage };
		this.tokenTypeById[id] = tokenStyleContribution;
	}

	public registerTokenModifier(id: string, description: string, deprecationMessage?: string): void {
		const num = this.currentModifierBit;
		this.currentModifierBit = this.currentModifierBit * 2;
		let tokenStyleContribution: TokenTypeOrModifierContribution = { num, id, description, deprecationMessage };
		this.tokenModifierById[id] = tokenStyleContribution;
	}

	public getTokenClassification(type: string, modifiers: string[]): TokenClassification | undefined {
		const tokenTypeDesc = this.tokenTypeById[type];
		if (!tokenTypeDesc) {
			return undefined;
		}
		let allModifierBits = 0;
		for (const modifier of modifiers) {
			const tokenModifierDesc = this.tokenModifierById[modifier];
			if (tokenModifierDesc) {
				allModifierBits |= tokenModifierDesc.num;
			}
		}
		return { type: tokenTypeDesc.num, modifiers: allModifierBits };
	}

	public getTokenClassificationFromString(str: TokenClassificationString): TokenClassification | undefined {
		const parts = str.split('.');
		const type = parts.shift();
		if (type) {
			return this.getTokenClassification(type, parts);
		}
		return undefined;
	}

	public registerTokenStyleDefault(classification: TokenClassification, defaults: TokenStyleDefaults): void {
		const matchScore = bitCount(classification.modifiers) + ((classification.type !== TOKEN_TYPE_WILDCARD_NUM) ? 1 : 0);
		this.tokenStylingDefaultRules.push({ classification, matchScore, defaults });
	}

	public deregisterTokenType(id: string): void {
		delete this.tokenTypeById[id];
	}

	public deregisterTokenModifier(id: string): void {
		delete this.tokenModifierById[id];
	}

	public getTokenTypes(): TokenTypeOrModifierContribution[] {
		return Object.keys(this.tokenTypeById).map(id => this.tokenTypeById[id]);
	}

	public getTokenModifiers(): TokenTypeOrModifierContribution[] {
		return Object.keys(this.tokenModifierById).map(id => this.tokenModifierById[id]);
	}

	public resolveTokenStyle(classification: TokenClassification, themingRules: TokenStylingRule[], useDefault: boolean, theme: ITheme): TokenStyle | undefined {
		let result: any = {
			foreground: theme.getColor(editorForeground),
			bold: false,
			underline: false,
			italic: false
		};
		let score = {
			foreground: -1,
			bold: -1,
			underline: -1,
			italic: -1
		};

		function _processStyle(matchScore: number, style: TokenStyle) {
			for (let p in result) {
				const property = p as keyof TokenStyle;
				const info = style[property];
				if (info !== undefined && score[property] <= matchScore) {
					score[property] = matchScore;
					result[property] = info;
				}
			}
		}
		themingRules.forEach(rule => {
			const matchScore = match(rule, classification);
			if (matchScore >= 0) {
				_processStyle(matchScore, rule.value);
			}
		});
		if (useDefault) {
			this.tokenStylingDefaultRules.forEach(rule => {
				const matchScore = match(rule, classification);
				if (matchScore >= 0) {
					let style = theme.resolveScopes(rule.defaults.scopesToProbe);
					if (!style) {
						style = this.resolveTokenStyleValue(rule.defaults[theme.type], theme);
					}
					if (style) {
						_processStyle(matchScore, style);
					}
				}
			});
		}
		return TokenStyle.fromData(result);
	}

	/**
	 * @param tokenStyleValue Resolve a tokenStyleValue in the context of a theme
	 */
	private resolveTokenStyleValue(tokenStyleValue: TokenStyleValue | null, theme: ITheme): TokenStyle | undefined {
		if (tokenStyleValue === null) {
			return undefined;
		} else if (typeof tokenStyleValue === 'string') {
			const classification = this.getTokenClassificationFromString(tokenStyleValue);
			if (classification) {
				return theme.getTokenStyle(classification);
			}
		} else if (typeof tokenStyleValue === 'object') {
			return tokenStyleValue;
		}
		return undefined;
	}


	public toString() {
		let sorter = (a: string, b: string) => {
			let cat1 = a.indexOf('.') === -1 ? 0 : 1;
			let cat2 = b.indexOf('.') === -1 ? 0 : 1;
			if (cat1 !== cat2) {
				return cat1 - cat2;
			}
			return a.localeCompare(b);
		};

		return Object.keys(this.tokenTypeById).sort(sorter).map(k => `- \`${k}\`: ${this.tokenTypeById[k].description}`).join('\n');
	}

}

function match(themeSelector: TokenStylingRule | TokenStylingDefaultRule, classification: TokenClassification): number {
	const selectorType = themeSelector.classification.type;
	if (selectorType !== TOKEN_TYPE_WILDCARD_NUM && selectorType === classification.type) {
		return -1;
	}
	const selectorModifier = themeSelector.classification.modifiers;
	if ((classification.modifiers & selectorModifier) !== selectorModifier) {
		return -1;
	}
	return themeSelector.matchScore;
}


const tokenClassificationRegistry = new TokenClassificationRegistry();
platform.Registry.add(Extensions.TokenClassificationContribution, tokenClassificationRegistry);

export function registerTokenType(id: string, defaults: TokenStyleDefaults | null, description: string, deprecationMessage?: string): string {
	tokenClassificationRegistry.registerTokenType(id, description, deprecationMessage);

	if (defaults) {
		const classification = tokenClassificationRegistry.getTokenClassification(id, []);
		tokenClassificationRegistry.registerTokenStyleDefault(classification!, defaults);
	}
	return id;
}

export function getTokenClassificationRegistry(): ITokenClassificationRegistry {
	return tokenClassificationRegistry;
}

export const comments = registerTokenType('comments', { scopesToProbe: [['comment']], dark: null, light: null, hc: null }, nls.localize('comments', "Token style for comments."));
export const strings = registerTokenType('strings', { scopesToProbe: [['string']], dark: null, light: null, hc: null }, nls.localize('strings', "Token style for strings."));
export const keywords = registerTokenType('keywords', { scopesToProbe: [['keyword.control'], ['storage'], ['storage.type']], dark: null, light: null, hc: null }, nls.localize('keywords', "Token style for keywords."));
export const numbers = registerTokenType('numbers', { scopesToProbe: [['constant.numeric']], dark: null, light: null, hc: null }, nls.localize('numbers', "Token style for numbers."));
export const types = registerTokenType('types', { scopesToProbe: [['entity.name.type'], ['entity.name.class'], ['support.type'], ['support.class']], dark: null, light: null, hc: null }, nls.localize('types', "Token style for types."));
export const functions = registerTokenType('functions', { scopesToProbe: [['entity.name.function'], ['support.function']], dark: null, light: null, hc: null }, nls.localize('functions', "Token style for functions."));
export const variables = registerTokenType('variables', { scopesToProbe: [['variable'], ['entity.name.variable']], dark: null, light: null, hc: null }, nls.localize('variables', "Token style for variables."));



function bitCount(u: number) {
	// https://blogs.msdn.microsoft.com/jeuge/2005/06/08/bit-fiddling-3/
	const uCount = u - ((u >> 1) & 0o33333333333) - ((u >> 2) & 0o11111111111);
	return ((uCount + (uCount >> 3)) & 0o30707070707) % 63;
}
