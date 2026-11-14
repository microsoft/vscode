/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from './errors.js';
import { escapeIcons } from './iconLabels.js';
import { matchesSomeScheme, Schemas } from './network.js';
import { dirname, isEqual, resolvePath } from './resources.js';
import { URI, UriComponents } from './uri.js';

export interface MarkdownStringTrustedOptions {
	readonly enabledCommands: readonly string[];
}

export interface IMarkdownString {
	readonly value: string;
	readonly isTrusted?: boolean | MarkdownStringTrustedOptions;
	readonly supportThemeIcons?: boolean;
	readonly supportHtml?: boolean;
	/** @internal */
	readonly supportAlertSyntax?: boolean;
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
	public supportAlertSyntax?: boolean;
	public baseUri?: URI;
	public uris?: { [href: string]: UriComponents } | undefined;

	public static lift(dto: IMarkdownString): MarkdownString {
		const markdownString = new MarkdownString(dto.value, dto);
		markdownString.uris = dto.uris;
		markdownString.baseUri = dto.baseUri ? URI.revive(dto.baseUri) : undefined;
		return markdownString;
	}

	constructor(
		value: string = '',
		isTrustedOrOptions: boolean | { isTrusted?: boolean | MarkdownStringTrustedOptions; supportThemeIcons?: boolean; supportHtml?: boolean; supportAlertSyntax?: boolean } = false,
	) {
		this.value = value;
		if (typeof this.value !== 'string') {
			throw illegalArgument('value');
		}

		if (typeof isTrustedOrOptions === 'boolean') {
			this.isTrusted = isTrustedOrOptions;
			this.supportThemeIcons = false;
			this.supportHtml = false;
			this.supportAlertSyntax = false;
		}
		else {
			this.isTrusted = isTrustedOrOptions.isTrusted ?? undefined;
			this.supportThemeIcons = isTrustedOrOptions.supportThemeIcons ?? false;
			this.supportHtml = isTrustedOrOptions.supportHtml ?? false;
			this.supportAlertSyntax = isTrustedOrOptions.supportAlertSyntax ?? false;
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

	/**
	 * Appends a link.
	 *
	 * @param target The link target, used literally: it cannot end the link or add Markdown.
	 * It is not validated, so check the scheme of untrusted targets before using them in trusted Markdown.
	 * @param label The link text as Markdown. Use {@link escapeMarkdownLinkLabel} for plain text.
	 * @param title The link title, used literally.
	 */
	appendLink(target: URI | string, label: string, title?: string): MarkdownString {
		this.value += '[';
		this.value += this._escape(label, ']');
		this.value += '](';
		this.value += escapeMarkdownLinkDestination(String(target));
		if (title) {
			this.value += ` "${escapeMarkdownLinkTitle(title)}"`;
		}
		this.value += ')';
		return this;
	}

	private _escape(value: string, ch: string): string {
		// A delimiter is already escaped only if it follows an odd number of backslashes:
		// in `\\]` the first backslash escapes the second one, which leaves `]` unescaped.
		// A trailing odd run of backslashes is completed as well, so that it cannot escape
		// the delimiter that is appended after the value.
		let result = '';
		let backslashes = 0;
		for (const c of value) {
			if (c === ch && backslashes % 2 === 0) {
				result += '\\';
			}
			backslashes = c === '\\' ? backslashes + 1 : 0;
			result += c;
		}
		return backslashes % 2 === 1 ? result + '\\' : result;
	}
}

/**
 * Escapes a string for use as a Markdown link destination: whitespace and control characters,
 * which would end the destination, are percent-encoded and Markdown syntax is backslash-escaped.
 */
function escapeMarkdownLinkDestination(target: string): string {
	return target
		.replace(/[\s\x00-\x1f\x7f]/g, ch => encodeURIComponent(ch))
		.replace(/[\\()<>]/g, '\\$&');
}

/**
 * Escapes a string for use as a double-quoted Markdown link title. Line breaks are replaced,
 * because an empty line would end the paragraph and with it the link. Characters that the
 * Markdown parser interprets in titles are written as character references, not backslash
 * escapes: marked reads `\\"` as an escaped quote, so a title ending in a backslash would
 * otherwise extend into the following text.
 */
function escapeMarkdownLinkTitle(title: string): string {
	return title
		.replace(/\r\n|[\r\n]/g, ' ')
		.replace(/\0/g, '\uFFFD') // HTML cannot represent NUL
		.replace(/[&\\"()\t]/g, ch => `&#${ch.charCodeAt(0)};`);
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

export function isMarkdownString(thing: unknown): thing is IMarkdownString {
	if (thing instanceof MarkdownString) {
		return true;
	} else if (thing && typeof thing === 'object') {
		return typeof (<IMarkdownString>thing).value === 'string'
			&& (typeof (<IMarkdownString>thing).isTrusted === 'boolean' || typeof (<IMarkdownString>thing).isTrusted === 'object' || (<IMarkdownString>thing).isTrusted === undefined)
			&& (typeof (<IMarkdownString>thing).supportThemeIcons === 'boolean' || (<IMarkdownString>thing).supportThemeIcons === undefined)
			&& (typeof (<IMarkdownString>thing).supportAlertSyntax === 'boolean' || (<IMarkdownString>thing).supportAlertSyntax === undefined);
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
			&& a.supportAlertSyntax === b.supportAlertSyntax
			&& (a.baseUri === b.baseUri || !!a.baseUri && !!b.baseUri && isEqual(URI.from(a.baseUri), URI.from(b.baseUri)));
	}
}

export function escapeMarkdownSyntaxTokens(text: string): string {
	// escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
	return text
		.replace(/[\\`*_{}[\]()#+!~]/g, '\\$&') // CodeQL [SM02383] Backslash is escaped in the character class
		.replace(/^([ \t]*)-/gm, '$1\\-'); // CodeQL [SM02383] Backslash is escaped in the character class
}

/**
 * Escapes text that does not come from the product, so that it renders as plain text when it is placed into markdown:
 * no links (including autolinks and bare URLs), images, theme icons or block syntax. Whitespace is collapsed to single spaces.
 */
export function escapeUntrustedMarkdown(text: string): string {
	return escapeMarkdownSyntaxTokens(escapeIcons(text.replace(/\s+/g, ' '))).replace(/[<>:.@]/g, '\\$&');
}

/**
 * Escapes only the characters that would break out of markdown link text
 * (`[label](url)`) syntax: `\` and `]`. Use this when the escaped string is
 * displayed as the visible label of a link, since renderers that extract the
 * link text without re-parsing markdown (e.g. the chat inline anchor / skill
 * pill) would otherwise show full `escapeMarkdownSyntaxTokens` backslashes
 * (`\-`, `\.`, ...) verbatim.
 */
export function escapeMarkdownLinkLabel(text: string): string {
	return text.replace(/[\\\]]/g, '\\$&');
}

/**
 * Escapes plain text for use as the text of a Markdown link, for example the label of
 * {@link MarkdownString.appendLink}, so that it renders literally. Unlike
 * {@link escapeMarkdownLinkLabel}, this also prevents autolinks, emphasis, code spans and
 * character references: every ASCII punctuation character is backslash-escaped. Line breaks
 * are replaced with spaces, because an empty line would end the paragraph and with it the link.
 */
export function escapeMarkdownLinkText(text: string): string {
	return text
		.replace(/\r\n|[\r\n]/g, ' ')
		.replace(/[!-/:-@[-`{-~]/g, '\\$&'); // CodeQL [SM02383] All ASCII punctuation, including the backslash, is escaped
}

/**
 * Wraps code in a fenced code block. A line that starts with at least as many
 * backticks as the fence, after up to three spaces of indentation, would close
 * it, so the fence is made longer than any such run.
 *
 * @see https://github.com/microsoft/vscode/issues/193746
 */
export function appendEscapedMarkdownCodeBlockFence(code: string, langId: string) {
	const longestFenceLength =
		code.match(/^ {0,3}`+/gm)?.reduce((longest, fence) => Math.max(longest, fence.trimStart().length), 0) ??
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

/**
 * Wraps arbitrary text in a markdown inline code span using a backtick fence
 * long enough to safely contain any backtick sequences present in the text.
 *
 * Backticks inside an inline code span cannot be backslash-escaped per the
 * CommonMark spec — the only safe way is to choose a delimiter run longer
 * than any run of backticks in the content (and pad with spaces if the
 * content begins or ends with a backtick).
 */
export function appendEscapedMarkdownInlineCode(text: string): string {
	const longestBacktickRun = Math.max(0, ...(text.match(/`+/g) ?? []).map(m => m.length));
	const fence = '`'.repeat(longestBacktickRun + 1);
	const needsSpace = text.startsWith('`') || text.endsWith('`');
	const content = needsSpace ? ` ${text} ` : text;
	return `${fence}${content}${fence}`;
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

/**
 * Resolves a Markdown link or media destination against the Markdown's base URI, as the Markdown
 * renderer does. Destinations with a scheme are returned unchanged.
 */
export function resolveWithBaseUri(baseUri: URI, href: string): string {
	const hasScheme = /^\w[\w\d+.-]*:/.test(href);
	if (hasScheme) {
		return href;
	}

	if (baseUri.path.endsWith('/')) {
		return resolvePath(baseUri, href).toString();
	} else {
		return resolvePath(dirname(baseUri), href).toString();
	}
}

export function createMarkdownLink(text: string, href: string, title?: string, escapeTokens = true): string {
	return `[${escapeTokens ? escapeMarkdownSyntaxTokens(text) : text}](${href}${title ? ` "${escapeMarkdownSyntaxTokens(title)}"` : ''})`;
}

export function createMarkdownCommandLink(command: { text: string; id: string; arguments?: unknown[]; tooltip: string }, escapeTokens = true): string {
	const uri = createCommandUri(command.id, ...(command.arguments || [])).toString();
	return createMarkdownLink(command.text, uri, command.tooltip, escapeTokens);
}

export function createCommandUri(commandId: string, ...commandArgs: unknown[]): URI {
	return URI.from({
		scheme: Schemas.command,
		path: commandId,
		query: commandArgs.length ? encodeURIComponent(JSON.stringify(commandArgs)) : undefined,
	});
}

/**
 * VS Code addresses some content with placeholder `http` URLs whose authority is wrapped in
 * underscores, such as `http://_vscodecontentref_/0`. Underscores are illegal in hostnames, so
 * no real site collides with this shape.
 */
const placeholderAuthority = /^https?:\/\/_[^/?#]*_(?:[/?#]|$)/i;

/**
 * Paths naming a location on this machine. Hand-rolled rather than reusing `extpath`, whose
 * drive-letter handling follows the host platform: a Windows path must still be recognized
 * when the copy happens on macOS.
 */
const absolutePath = /^(?:[/\\]|[a-z]:[/\\])/i;

/** Whether a target still resolves once content is copied into another application. */
export function isPortableLinkTarget(target: string): boolean {
	const trimmed = target.trim();
	return matchesSomeScheme(trimmed, Schemas.http, Schemas.https, Schemas.mailto)
		&& !placeholderAuthority.test(trimmed);
}

/**
 * Whether a markdown target is worth keeping when the markdown itself is shared. Wider than
 * {@link isPortableLinkTarget}: document-relative targets such as `#section` name no machine,
 * so they stay meaningful in whatever document the markdown lands in.
 */
export function isPortableMarkdownTarget(target: string): boolean {
	const trimmed = target.trim();
	return isPortableLinkTarget(trimmed)
		|| (!!trimmed && !/^[a-z][a-z0-9.+-]*:/i.test(trimmed) && !absolutePath.test(trimmed));
}
