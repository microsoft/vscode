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
	scanCssBlock(css, 0, css.length, [], rules);
	return rules;
}

function scanCssBlock(css: string, start: number, end: number, selectors: readonly string[], rules: CssRule[]): void {
	const declarations: CssDeclaration[] = [];
	let statementStart = start;

	for (let index = start; index < end; index++) {
		const character = css[index];
		if (character === '"' || character === '\'') {
			index = skipString(css, index + 1, character);
		} else if (character === '(') {
			index = skipBalanced(css, index + 1, end, '(', ')');
		} else if (character === '[') {
			index = skipBalanced(css, index + 1, end, '[', ']');
		} else if (character === '{') {
			const selectorStart = skipWhitespace(css, statementStart);
			const prelude = css.slice(selectorStart, index).trim();
			const blockEnd = skipBalanced(css, index + 1, end, '{', '}');
			if (isCustomPropertyPrelude(prelude)) {
				index = blockEnd;
				continue;
			}

			if (prelude.startsWith('@')) {
				scanCssBlock(css, index + 1, blockEnd, selectors, rules);
			} else {
				scanCssBlock(css, index + 1, blockEnd, resolveNestedSelectors(selectors, splitSelectors(prelude)), rules);
			}
			index = blockEnd;
			statementStart = blockEnd + 1;
		} else if (character === ';') {
			const declaration = parseDeclaration(css, statementStart, index);
			if (declaration) {
				declarations.push(declaration);
			}
			statementStart = index + 1;
		}
	}

	const declaration = parseDeclaration(css, statementStart, end);
	if (declaration) {
		declarations.push(declaration);
	}
	if (selectors.length > 0 && declarations.length > 0) {
		rules.push({ selectors, declarations });
	}
}

function parseDeclaration(css: string, start: number, end: number): CssDeclaration | undefined {
	const offset = skipWhitespace(css, start);
	const separator = css.indexOf(':', offset);
	if (separator < 0 || separator >= end) {
		return undefined;
	}
	const property = css.slice(offset, separator).trim();
	if (!/^[-\w]+$/.test(property)) {
		return undefined;
	}
	return {
		offset,
		property: property.toLowerCase(),
		value: css.slice(separator + 1, end),
	};
}

function splitSelectors(selector: string): string[] {
	return selector.split(',').map(part => part.trim()).filter(Boolean);
}

function resolveNestedSelectors(parentSelectors: readonly string[], nestedSelectors: readonly string[]): string[] {
	if (parentSelectors.length === 0) {
		return [...nestedSelectors];
	}
	const resolved: string[] = [];
	for (const parentSelector of parentSelectors) {
		for (const nestedSelector of nestedSelectors) {
			resolved.push(nestedSelector.includes('&')
				? nestedSelector.replaceAll('&', parentSelector)
				: `${parentSelector} ${nestedSelector}`);
		}
	}
	return resolved;
}

function isCustomPropertyPrelude(prelude: string): boolean {
	return /^--[-\w]+\s*:/.test(prelude);
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

function skipBalanced(contents: string, start: number, end: number, open: string, close: string): number {
	let depth = 1;
	for (let index = start; index < end; index++) {
		const character = contents[index];
		if (character === '"' || character === '\'') {
			index = skipString(contents, index + 1, character);
		} else if (character === open) {
			depth++;
		} else if (character === close && --depth === 0) {
			return index;
		}
	}
	return end;
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
	return normalized === 'none' || normalized === 'transparent' || normalized.startsWith('var(');
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
