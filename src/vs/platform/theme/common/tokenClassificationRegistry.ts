/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/platform/registry/common/platform';
import { Color } from 'vs/base/common/color';
import { ITheme } from 'vs/platform/theme/common/themeService';
import * as nls from 'vs/nls';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';

export const TOKEN_TYPE_WILDCARD = '*';
export const TOKEN_TYPE_WILDCARD_NUM = -1;

// qualified string [type|*](.modifier)*
export type TokenClassificationString = string;

export const typeAndModifierIdPattern = '^\\w+[-_\\w+]*$';
export const fontStylePattern = '^(\\s*(-?italic|-?bold|-?underline))*\\s*$';

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
	export function fromSettings(foreground: string | undefined, fontStyle: string | undefined): TokenStyle {
		let foregroundColor = undefined;
		if (foreground !== undefined) {
			foregroundColor = Color.fromHex(foreground);
		}
		let bold, underline, italic;
		if (fontStyle !== undefined) {
			fontStyle = fontStyle.trim();
			if (fontStyle.length === 0) {
				bold = italic = underline = false;
			} else {
				const expression = /-?italic|-?bold|-?underline/g;
				let match;
				while ((match = expression.exec(fontStyle))) {
					switch (match[0]) {
						case 'bold': bold = true; break;
						case 'italic': italic = true; break;
						case 'underline': underline = true; break;
					}
				}
			}
		}
		return new TokenStyle(foregroundColor, bold, underline, italic);

	}
}

export type ProbeScope = string[];

export interface TokenStyleFunction {
	(theme: ITheme): TokenStyle | undefined;
}

export interface TokenStyleDefaults {
	scopesToProbe?: ProbeScope[];
	light?: TokenStyleValue;
	dark?: TokenStyleValue;
	hc?: TokenStyleValue;
}

export interface TokenStylingDefaultRule {
	match(classification: TokenClassification): number;
	selector: TokenClassification;
	defaults: TokenStyleDefaults;
}

export interface TokenStylingRule {
	match(classification: TokenClassification): number;
	value: TokenStyle;
	selector: TokenClassification;
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

	readonly onDidChangeSchema: Event<void>;

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

	getTokenClassification(type: string, modifiers: string[]): TokenClassification | undefined;

	getTokenStylingRule(classification: TokenClassification, value: TokenStyle): TokenStylingRule;

	/**
	 * Register a TokenStyle default to the registry.
	 * @param selector The rule selector
	 * @param defaults The default values
	 */
	registerTokenStyleDefault(selector: TokenClassification, defaults: TokenStyleDefaults): void;

	/**
	 * Deregister a TokenStyle default to the registry.
	 * @param selector The rule selector
	 */
	deregisterTokenStyleDefault(selector: TokenClassification): void;

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
	 * The styling rules to used when a schema does not define any styling rules.
	 */
	getTokenStylingDefaultRules(): TokenStylingDefaultRule[];

	/**
	 * JSON schema for an object to assign styling to token classifications
	 */
	getTokenStylingSchema(): IJSONSchema;
}

class TokenClassificationRegistry implements ITokenClassificationRegistry {

	private readonly _onDidChangeSchema = new Emitter<void>();
	readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event;

	private currentTypeNumber = 0;
	private currentModifierBit = 1;

	private tokenTypeById: { [key: string]: TokenTypeOrModifierContribution };
	private tokenModifierById: { [key: string]: TokenTypeOrModifierContribution };

	private tokenStylingDefaultRules: TokenStylingDefaultRule[] = [];

	private tokenStylingSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
		type: 'object',
		properties: {},
		additionalProperties: getStylingSchemeEntry(),
		definitions: {
			style: {
				type: 'object',
				description: nls.localize('schema.token.settings', 'Colors and styles for the token.'),
				properties: {
					foreground: {
						type: 'string',
						description: nls.localize('schema.token.foreground', 'Foreground color for the token.'),
						format: 'color-hex',
						default: '#ff0000'
					},
					background: {
						type: 'string',
						deprecationMessage: nls.localize('schema.token.background.warning', 'Token background colors are currently not supported.')
					},
					fontStyle: {
						type: 'string',
						description: nls.localize('schema.token.fontStyle', 'Font style of the rule: \'italic\', \'bold\' or \'underline\' or a combination. The empty string unsets inherited settings.'),
						pattern: fontStylePattern,
						patternErrorMessage: nls.localize('schema.fontStyle.error', 'Font style must be \'italic\', \'bold\' or \'underline\' or a combination. The empty string unsets all styles.'),
						defaultSnippets: [{ label: nls.localize('schema.token.fontStyle.none', 'None (clear inherited style)'), bodyText: '""' }, { body: 'italic' }, { body: 'bold' }, { body: 'underline' }, { body: 'italic underline' }, { body: 'bold underline' }, { body: 'italic bold underline' }]
					}
				},
				additionalProperties: false,
				defaultSnippets: [{ body: { foreground: '${1:#FF0000}', fontStyle: '${2:bold}' } }]
			}
		}
	};

	constructor() {
		this.tokenTypeById = {};
		this.tokenModifierById = {};

		this.tokenTypeById[TOKEN_TYPE_WILDCARD] = { num: TOKEN_TYPE_WILDCARD_NUM, id: TOKEN_TYPE_WILDCARD, description: '', deprecationMessage: undefined };
	}

	public registerTokenType(id: string, description: string, deprecationMessage?: string): void {
		if (!id.match(typeAndModifierIdPattern)) {
			throw new Error('Invalid token type id.');
		}

		const num = this.currentTypeNumber++;
		let tokenStyleContribution: TokenTypeOrModifierContribution = { num, id, description, deprecationMessage };
		this.tokenTypeById[id] = tokenStyleContribution;

		this.tokenStylingSchema.properties[id] = getStylingSchemeEntry(description, deprecationMessage);
	}

	public registerTokenModifier(id: string, description: string, deprecationMessage?: string): void {
		if (!id.match(typeAndModifierIdPattern)) {
			throw new Error('Invalid token modifier id.');
		}

		const num = this.currentModifierBit;
		this.currentModifierBit = this.currentModifierBit * 2;
		let tokenStyleContribution: TokenTypeOrModifierContribution = { num, id, description, deprecationMessage };
		this.tokenModifierById[id] = tokenStyleContribution;

		this.tokenStylingSchema.properties[`*.${id}`] = getStylingSchemeEntry(description, deprecationMessage);
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


	private newMatcher(selector: TokenClassification) {
		const score = getTokenStylingScore(selector);
		return (classification: TokenClassification) => {
			const selectorType = selector.type;
			if (selectorType !== TOKEN_TYPE_WILDCARD_NUM && selectorType !== classification.type) {
				return -1;
			}
			const selectorModifier = selector.modifiers;
			if ((classification.modifiers & selectorModifier) !== selectorModifier) {
				return -1;
			}
			return score;
		};
	}

	public getTokenStylingRule(selector: TokenClassification, value: TokenStyle): TokenStylingRule {
		return {
			match: this.newMatcher(selector),
			value,
			selector
		};
	}

	public registerTokenStyleDefault(selector: TokenClassification, defaults: TokenStyleDefaults): void {
		this.tokenStylingDefaultRules.push({ selector, match: this.newMatcher(selector), defaults });
	}

	public deregisterTokenStyleDefault(classification: TokenClassification): void {
		this.tokenStylingDefaultRules = this.tokenStylingDefaultRules.filter(r => !(r.selector.type === classification.type && r.selector.modifiers === classification.modifiers));
	}

	public deregisterTokenType(id: string): void {
		delete this.tokenTypeById[id];
		delete this.tokenStylingSchema.properties[id];
	}

	public deregisterTokenModifier(id: string): void {
		delete this.tokenModifierById[id];
		delete this.tokenStylingSchema.properties[`*.${id}`];
	}

	public getTokenTypes(): TokenTypeOrModifierContribution[] {
		return Object.keys(this.tokenTypeById).map(id => this.tokenTypeById[id]);
	}

	public getTokenModifiers(): TokenTypeOrModifierContribution[] {
		return Object.keys(this.tokenModifierById).map(id => this.tokenModifierById[id]);
	}

	public getTokenStylingSchema(): IJSONSchema {
		return this.tokenStylingSchema;
	}

	public getTokenStylingDefaultRules(): TokenStylingDefaultRule[] {
		return this.tokenStylingDefaultRules;
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


const tokenClassificationRegistry = new TokenClassificationRegistry();
platform.Registry.add(Extensions.TokenClassificationContribution, tokenClassificationRegistry);

registerDefaultClassifications();

function registerDefaultClassifications(): void {
	function registerTokenType(id: string, description: string, scopesToProbe: ProbeScope[] = [], extendsTC?: string, deprecationMessage?: string): string {
		tokenClassificationRegistry.registerTokenType(id, description, deprecationMessage);

		if (scopesToProbe || extendsTC) {
			const classification = tokenClassificationRegistry.getTokenClassification(id, []);
			tokenClassificationRegistry.registerTokenStyleDefault(classification!, { scopesToProbe, light: extendsTC, dark: extendsTC, hc: extendsTC });
		}
		return id;
	}

	// default token types

	registerTokenType('comment', nls.localize('comment', "Style for comments."), [['comment']]);
	registerTokenType('string', nls.localize('string', "Style for strings."), [['string']]);
	registerTokenType('keyword', nls.localize('keyword', "Style for keywords."), [['keyword.control']]);
	registerTokenType('number', nls.localize('number', "Style for numbers."), [['constant.numeric']]);
	registerTokenType('regexp', nls.localize('regexp', "Style for expressions."), [['constant.regexp']]);
	registerTokenType('operator', nls.localize('operator', "Style for operators."), [['keyword.operator']]);

	registerTokenType('namespace', nls.localize('namespace', "Style for namespaces."), [['entity.name.namespace']]);

	registerTokenType('type', nls.localize('type', "Style for types."), [['entity.name.type'], ['support.type'], ['support.class']]);
	registerTokenType('struct', nls.localize('struct', "Style for structs."), [['storage.type.struct']], 'type');
	registerTokenType('class', nls.localize('class', "Style for classes."), [['entity.name.type.class']], 'type');
	registerTokenType('interface', nls.localize('interface', "Style for interfaces."), [['entity.name.type.interface']], 'type');
	registerTokenType('enum', nls.localize('enum', "Style for enums."), [['entity.name.type.enum']], 'type');
	registerTokenType('typeParameter', nls.localize('typeParameter', "Style for type parameters."), [['entity.name.type', 'meta.type.parameters']], 'type');

	registerTokenType('function', nls.localize('function', "Style for functions"), [['entity.name.function'], ['support.function']]);
	registerTokenType('member', nls.localize('member', "Style for member"), [['entity.name.function.member'], ['support.function']]);
	registerTokenType('macro', nls.localize('macro', "Style for macros."), [['entity.name.other.preprocessor.macro']], 'function');

	registerTokenType('variable', nls.localize('variable', "Style for variables."), [['variable'], ['entity.name.variable']]);
	registerTokenType('constant', nls.localize('constant', "Style for constants."), [['variable.other.constant']], 'variable');
	registerTokenType('parameter', nls.localize('parameter', "Style for parameters."), [['variable.parameter']], 'variable');
	registerTokenType('property', nls.localize('property', "Style for properties."), [['variable.other.property']], 'variable');

	registerTokenType('label', nls.localize('labels', "Style for labels. "), undefined);

	// default token modifiers

	tokenClassificationRegistry.registerTokenModifier('declaration', nls.localize('declaration', "Style for all symbol declarations."), undefined);
	tokenClassificationRegistry.registerTokenModifier('documentation', nls.localize('documentation', "Style to use for references in documentation."), undefined);
	tokenClassificationRegistry.registerTokenModifier('static', nls.localize('static', "Style to use for symbols that are static."), undefined);
	tokenClassificationRegistry.registerTokenModifier('abstract', nls.localize('abstract', "Style to use for symbols that are abstract."), undefined);
	tokenClassificationRegistry.registerTokenModifier('deprecated', nls.localize('deprecated', "Style to use for symbols that are deprecated."), undefined);
	tokenClassificationRegistry.registerTokenModifier('modification', nls.localize('modification', "Style to use for write accesses."), undefined);
	tokenClassificationRegistry.registerTokenModifier('async', nls.localize('async', "Style to use for symbols that are async."), undefined);
	tokenClassificationRegistry.registerTokenModifier('readonly', nls.localize('readonly', "Style to use for symbols that are readonly."), undefined);


}

export function getTokenClassificationRegistry(): ITokenClassificationRegistry {
	return tokenClassificationRegistry;
}

function bitCount(u: number) {
	// https://blogs.msdn.microsoft.com/jeuge/2005/06/08/bit-fiddling-3/
	const uCount = u - ((u >> 1) & 0o33333333333) - ((u >> 2) & 0o11111111111);
	return ((uCount + (uCount >> 3)) & 0o30707070707) % 63;
}

function getTokenStylingScore(classification: TokenClassification) {
	return bitCount(classification.modifiers) + ((classification.type !== TOKEN_TYPE_WILDCARD_NUM) ? 1 : 0);
}

function getStylingSchemeEntry(description?: string, deprecationMessage?: string): IJSONSchema {
	return {
		description,
		deprecationMessage,
		defaultSnippets: [{ body: '${1:#ff0000}' }],
		anyOf: [
			{
				type: 'string',
				format: 'color-hex'
			},
			{
				$ref: '#definitions/style'
			}
		]
	};
}

export const tokenStylingSchemaId = 'vscode://schemas/token-styling';

let schemaRegistry = platform.Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(tokenStylingSchemaId, tokenClassificationRegistry.getTokenStylingSchema());

const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(tokenStylingSchemaId), 200);
tokenClassificationRegistry.onDidChangeSchema(() => {
	if (!delayer.isScheduled()) {
		delayer.schedule();
	}
});
