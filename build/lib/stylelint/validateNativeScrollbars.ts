/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface CssDeclaration {
	readonly offset: number;
	readonly property: string;
	readonly value: string;
}

interface CssRule {
	readonly selectors: readonly string[];
	readonly declarations: readonly CssDeclaration[];
}

const requiredWorkbenchColorSchemes = new Map<string, string>([
	['.monaco-workbench.vs-dark', 'dark'],
	['.monaco-workbench.hc-black', 'dark'],
	['.monaco-workbench.vs', 'light'],
	['.monaco-workbench.hc-light', 'light'],
]);

export function hasWorkbenchNativeScrollbarTheming(contents: string): boolean {
	const rules = parseCssRules(contents);
	for (const [selector, expectedValue] of requiredWorkbenchColorSchemes) {
		const hasRequiredColorScheme = rules.some(rule => rule.selectors.includes(selector)
			&& rule.declarations.some(declaration => declaration.property === 'color-scheme' && normalizeCssValue(declaration.value) === expectedValue));
		if (!hasRequiredColorScheme) {
			return false;
		}
	}
	return true;
}

export function findHardcodedNativeScrollbarColor(contents: string): number | undefined {
	for (const rule of parseCssRules(contents)) {
		for (const declaration of rule.declarations) {
			if (declaration.property === 'scrollbar-color') {
				if (!isThemeAwareScrollbarColor(declaration.value)) {
					return declaration.offset;
				}
			} else if (rule.selectors.some(selector => selector.includes('::-webkit-scrollbar'))
				&& isBackgroundProperty(declaration.property)
				&& !isThemeAwareColor(declaration.value)) {
				return declaration.offset;
			}
		}
	}
	return undefined;
}

function parseCssRules(contents: string): CssRule[] {
	const css = stripComments(contents);
	const rules: CssRule[] = [];
	const stack: { readonly contentStart: number; readonly selectors: readonly string[] }[] = [];
	let statementStart = 0;

	for (let index = 0; index < css.length; index++) {
		const character = css[index];
		if (character === '"' || character === '\'') {
			index = skipString(css, index + 1, character);
		} else if (character === '{') {
			const selectorStart = skipWhitespace(css, statementStart);
			const selector = css.slice(selectorStart, index).trim();
			stack.push({
				contentStart: index + 1,
				selectors: selector.split(',').map(part => part.trim()),
			});
			statementStart = index + 1;
		} else if (character === ';') {
			statementStart = index + 1;
		} else if (character === '}') {
			const frame = stack.pop();
			if (frame) {
				rules.push({
					selectors: frame.selectors,
					declarations: parseDeclarations(css, frame.contentStart, index),
				});
			}
			statementStart = index + 1;
		}
	}

	return rules;
}

function parseDeclarations(css: string, start: number, end: number): CssDeclaration[] {
	const declarations: CssDeclaration[] = [];
	const declarationPattern = /(?:^|;)\s*(?<property>[-\w]+)\s*:\s*(?<value>[^;{}]*)/g;
	const block = css.slice(start, end);
	for (const match of block.matchAll(declarationPattern)) {
		const property = match.groups?.property;
		const value = match.groups?.value;
		if (property && value !== undefined) {
			declarations.push({
				offset: start + (match.index ?? 0),
				property: property.toLowerCase(),
				value,
			});
		}
	}
	return declarations;
}

function stripComments(contents: string): string {
	const result = contents.split('');
	for (let index = 0; index < contents.length; index++) {
		const character = contents[index];
		if (character === '"' || character === '\'') {
			index = skipString(contents, index + 1, character);
		} else if (character === '/' && contents[index + 1] === '*') {
			result[index++] = ' ';
			result[index] = ' ';
			while (++index < contents.length) {
				if (contents[index] === '*' && contents[index + 1] === '/') {
					result[index] = ' ';
					result[++index] = ' ';
					break;
				}
				if (contents[index] !== '\r' && contents[index] !== '\n') {
					result[index] = ' ';
				}
			}
		}
	}
	return result.join('');
}

function skipString(contents: string, start: number, quote: string): number {
	for (let index = start; index < contents.length; index++) {
		if (contents[index] === '\\') {
			index++;
		} else if (contents[index] === quote) {
			return index;
		}
	}
	return contents.length;
}

function skipWhitespace(contents: string, start: number): number {
	let index = start;
	while (index < contents.length && /\s/.test(contents[index])) {
		index++;
	}
	return index;
}

function isBackgroundProperty(property: string): boolean {
	return property === 'background' || property === 'background-color';
}

function isThemeAwareColor(value: string): boolean {
	const normalized = normalizeCssValue(value);
	return normalized === 'transparent' || normalized.startsWith('var(');
}

function isThemeAwareScrollbarColor(value: string): boolean {
	const normalized = normalizeCssValue(value);
	if (normalized === 'auto') {
		return true;
	}
	const colors = splitTopLevelWhitespace(normalized);
	return colors.length === 2 && colors.every(color => color === 'transparent' || color.startsWith('var('));
}

function normalizeCssValue(value: string): string {
	return value.replace(/\s*!important\s*$/, '').trim().replace(/\s+/g, ' ');
}

function splitTopLevelWhitespace(value: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let partStart = 0;
	for (let index = 0; index < value.length; index++) {
		const character = value[index];
		if (character === '"' || character === '\'') {
			index = skipString(value, index + 1, character);
		} else if (character === '(') {
			depth++;
		} else if (character === ')') {
			depth--;
		} else if (depth === 0 && /\s/.test(character)) {
			if (partStart < index) {
				parts.push(value.slice(partStart, index));
			}
			partStart = index + 1;
		}
	}
	if (partStart < value.length) {
		parts.push(value.slice(partStart));
	}
	return parts;
}
