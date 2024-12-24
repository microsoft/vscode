/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from './errors.js';
import { escapeIcons } from './iconLabels.js';
import { isEqual } from './resources.js';
import { escapeRegExpCharacters } from './strings.js';
import { URI, UriComponents } from './uri.js';

export interface MarkdownStringTrustedOptions {
	readonly enabledCommands: readonly string[];
}

export interface IMarkdownString {
	readonly value: string;
	readonly isTrusted?: boolean | MarkdownStringTrustedOptions;
	readonly supportThemeIcons?: boolean;
	readonly supportHtml?: boolean;
	readonly baseUri?: UriComponents;
	uris?: { [href: string]: UriComponents };
}

export const enum MarkdownStringTextNewlineStyle {
	Paragraph = 0,
	Break = 1,
}

export class MarkdownString implements IMarkdownString {

	public value: string;
	public isTrusted?: boolean | MarkdownStringTrustedOptions;
	public supportThemeIcons?: boolean;
	public supportHtml?: boolean;
	public baseUri?: URI;

	constructor(
		value: string = '',
		isTrustedOrOptions: boolean | { isTrusted?: boolean | MarkdownStringTrustedOptions; supportThemeIcons?: boolean; supportHtml?: boolean } = false,
	) {
		this.value = value;
		if (typeof this.value !== 'string') {
			throw illegalArgument('value');
		}

		if (typeof isTrustedOrOptions === 'boolean') {
			this.isTrusted = isTrustedOrOptions;
			this.supportThemeIcons = false;
			this.supportHtml = false;
		}
		else {
			this.isTrusted = isTrustedOrOptions.isTrusted ?? undefined;
			this.supportThemeIcons = isTrustedOrOptions.supportThemeIcons ?? false;
			this.supportHtml = isTrustedOrOptions.supportHtml ?? false;
		}
	}

	appendText(value: string, newlineStyle: MarkdownStringTextNewlineStyle = MarkdownStringTextNewlineStyle.Paragraph): MarkdownString {
		this.value += escapeMarkdownSyntaxTokens(this.supportThemeIcons ? escapeIcons(value) : value) // CodeQL [SM02383] The Markdown is fully sanitized after being rendered.
			.replace(/([ \t]+)/g, (_match, g1) => '&nbsp;'.repeat(g1.length)) // CodeQL [SM02383] The Markdown is fully sanitized after being rendered.
			.replace(/\>/gm, '\\>') // CodeQL [SM02383] The Markdown is fully sanitized after being rendered.
			.replace(/\n/g, newlineStyle === MarkdownStringTextNewlineStyle.Break ? '\\\n' : '\n\n'); // CodeQL [SM02383] The Markdown is fully sanitized after being rendered.

		return this;
	}

	appendMarkdown(value: string): MarkdownString {
		this.value += value;
		return this;
	}

	appendCodeblock(langId: string, code: string): MarkdownString {
		this.value += `\n${appendEscapedMarkdownCodeBlockFence(code, langId)}\n`;
		return this;
	}

	appendLink(target: URI | string, label: string, title?: string): MarkdownString {
		this.value += '[';
		this.value += this._escape(label, ']');
		this.value += '](';
		this.value += this._escape(String(target), ')');
		if (title) {
			this.value += ` "${this._escape(this._escape(title, '"'), ')')}"`;
		}
		this.value += ')';
		return this;
	}

	private _escape(value: string, ch: string): string {
		const r = new RegExp(escapeRegExpCharacters(ch), 'g');
		return value.replace(r, (match, offset) => {
			if (value.charAt(offset - 1) !== '\\') {
				return `\\${match}`;
			} else {
				return match;
			}
		});
	}
}

export function isEmptyMarkdownString(oneOrMany: IMarkdownString | IMarkdownString[] | null | undefined): boolean {
	if (isMarkdownString(oneOrMany)) {
		return !oneOrMany.value;
	} else if (Array.isArray(oneOrMany)) {
		return oneOrMany.every(isEmptyMarkdownString);
	} else {
		return true;
	}
}

export function isMarkdownString(thing: any): thing is IMarkdownString {
	if (thing instanceof MarkdownString) {
		return true;
	} else if (thing && typeof thing === 'object') {
		return typeof (<IMarkdownString>thing).value === 'string'
			&& (typeof (<IMarkdownString>thing).isTrusted === 'boolean' || typeof (<IMarkdownString>thing).isTrusted === 'object' || (<IMarkdownString>thing).isTrusted === undefined)
			&& (typeof (<IMarkdownString>thing).supportThemeIcons === 'boolean' || (<IMarkdownString>thing).supportThemeIcons === undefined);
	}
	return false;
}

export function markdownStringEqual(a: IMarkdownString, b: IMarkdownString): boolean {
	if (a === b) {
		return true;
	} else if (!a || !b) {
		return false;
	} else {
		return a.value === b.value
			&& a.isTrusted === b.isTrusted
			&& a.supportThemeIcons === b.supportThemeIcons
			&& a.supportHtml === b.supportHtml
			&& (a.baseUri === b.baseUri || !!a.baseUri && !!b.baseUri && isEqual(URI.from(a.baseUri), URI.from(b.baseUri)));
	}
}

export function escapeMarkdownSyntaxTokens(text: string): string {
	// escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
	return text.replace(/[\\`*_{}[\]()#+\-!~]/g, '\\$&'); // CodeQL [SM02383] Backslash is escaped in the character class
}

/**
 * @see https://github.com/microsoft/vscode/issues/193746
 */
export function appendEscapedMarkdownCodeBlockFence(code: string, langId: string) {
	const longestFenceLength =
		code.match(/^`+/gm)?.reduce((a, b) => (a.length > b.length ? a : b)).length ??
		0;
	const desiredFenceLength =
		longestFenceLength >= 3 ? longestFenceLength + 1 : 3;

	// the markdown result
	return [
		`${'`'.repeat(desiredFenceLength)}${langId}`,
		code,
		`${'`'.repeat(desiredFenceLength)}`,
	].join('\n');
}

export function escapeDoubleQuotes(input: string) {
	return input.replace(/"/g, '&quot;');
}

export function removeMarkdownEscapes(text: string): string {
	if (!text) {
		return text;
	}
	return text.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, '$1');
}

export function parseHrefAndDimensions(href: string): { href: string; dimensions: string[] } {
	const dimensions: string[] = [];
	const splitted = href.split('|').map(s => s.trim());
	href = splitted[0];
	const parameters = splitted[1];
	if (parameters) {
		const heightFromParams = /height=(\d+)/.exec(parameters);
		const widthFromParams = /width=(\d+)/.exec(parameters);
		const height = heightFromParams ? heightFromParams[1] : '';
		const width = widthFromParams ? widthFromParams[1] : '';
		const widthIsFinite = isFinite(parseInt(width));
		const heightIsFinite = isFinite(parseInt(height));
		if (widthIsFinite) {
			dimensions.push(`width="${width}"`);
		}
		if (heightIsFinite) {
			dimensions.push(`height="${height}"`);
		}
	}
	return { href, dimensions };
}
