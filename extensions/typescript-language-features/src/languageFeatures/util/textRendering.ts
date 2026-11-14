/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OpenJsDocLinkCommand, OpenJsDocLinkCommand_Args } from '../../commands/openJsDocLink';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';

export interface IFilePathToResourceConverter {
	/**
	 * Convert a typescript filepath to a VS Code resource.
	 */
	toResource(filepath: string): vscode.Uri;
}

function getTagBodyText(
	tag: Proto.JSDocTagInfo,
	filePathConverter: IFilePathToResourceConverter,
): string | undefined {
	if (!tag.text) {
		return undefined;
	}

	// Convert to markdown code block if it does not already contain one
	function makeCodeblock(text: string): string {
		if (/^\s*[~`]{3}/m.test(text)) {
			return text;
		}
		return '```tsx\n' + text + '\n```';
	}

	let text = convertLinkTags(tag.text, filePathConverter);
	switch (tag.name) {
		case 'example': {
			// Example text does not support `{@link}` as it is considered code.
			// TODO: should we support it if it appears outside of an explicit code block?
			text = asPlainText(tag.text);

			// check for caption tags, fix for #79704
			const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
			if (captionTagMatches?.index === 0) {
				return captionTagMatches[1] + '\n' + makeCodeblock(text.substr(captionTagMatches[0].length));
			} else {
				return makeCodeblock(text);
			}
		}
		case 'author': {
			// fix obsucated email address, #80898
			const emailMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);
			if (emailMatch === null) {
				return text;
			} else {
				return `${emailMatch[1]} ${emailMatch[2]}`;
			}
		}
		case 'default': {
			return makeCodeblock(text);
		}
		// These tags are documented (JSDoc/TSDoc) to start with a `{TypeExpression}`
		// immediately after the tag name, so -- unlike arbitrary/custom tags -- it's safe and
		// necessary to protect that leading brace group from Markdown/HTML misinterpretation.
		// See `wrapLeadingTypeExpressionAsCode` below.
		case 'type':
		case 'satisfies':
		case 'enum':
		case 'this':
		case 'throws':
		case 'exception': {
			return wrapLeadingTypeExpressionAsCode(text);
		}
		default: {
			return text;
		}
	}
}

/**
 * Many JSDoc tags (`@type`, `@satisfies`, `@enum`, `@throws`, `@this`, etc.) start with a
 * `{TypeExpression}` immediately after the tag name. That type expression is not source code,
 * so it is not put in a code block, which means it is later rendered as plain Markdown.
 *
 * Markdown treats bracket pairs like `<number>` as inline HTML. Since `<number>` is not an
 * allowed/known HTML tag, it gets stripped out by the Markdown sanitizer, silently eating any
 * generic type arguments (e.g. `Promise<number>` renders as just `Promise`). See #341685.
 *
 * To avoid this, wrap the leading `{TypeExpression}` in an inline code span so it is rendered
 * verbatim instead of being interpreted as Markdown/HTML. Any trailing description text (and
 * its original whitespace/newlines) is left untouched so Markdown block structure is preserved.
 */
function wrapLeadingTypeExpressionAsCode(text: string): string {
	if (text.charAt(0) !== '{') {
		return text;
	}

	const end = findMatchingBraceEnd(text);
	if (end === undefined) {
		return text;
	}

	const typeExpression = text.slice(1, end);
	const rest = text.slice(end + 1);
	return wrapAsInlineCode(typeExpression) + rest;
}

/**
 * Finds the index of the `}` that closes the `{` at index 0 of `text`, skipping over braces
 * that appear inside quoted type syntax -- string-literal types (`{'}'}`) and template-literal
 * types (`` {`a${T}`} ``) -- so an internal `}` inside a quote doesn't end the scan early.
 */
function findMatchingBraceEnd(text: string): number | undefined {
	let depth = 0;
	for (let i = 0; i < text.length; ++i) {
		const ch = text.charAt(i);
		if (ch === '\'' || ch === '"' || ch === '`') {
			const closingQuoteIndex = findClosingQuote(text, i, ch);
			if (closingQuoteIndex === undefined) {
				return undefined;
			}
			i = closingQuoteIndex;
			continue;
		}
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			if (--depth === 0) {
				return i;
			}
		}
	}
	return undefined;
}

/**
 * Finds the index of the quote character matching `text.charAt(start)`, skipping over
 * backslash-escaped characters and, for template literals, over `${...}` interpolations
 * (which may themselves contain nested quotes/template literals, e.g. `` `a${`b`}` ``).
 */
function findClosingQuote(text: string, start: number, quote: string): number | undefined {
	for (let i = start + 1; i < text.length; ++i) {
		if (text.charAt(i) === '\\') {
			i++; // Skip the escaped character
			continue;
		}
		if (quote === '`' && text.charAt(i) === '$' && text.charAt(i + 1) === '{') {
			// Skip over the balanced `${...}` interpolation instead of treating any quote
			// character inside it as closing this template literal.
			const closingBraceOffset = findMatchingBraceEnd(text.slice(i + 1));
			if (closingBraceOffset === undefined) {
				return undefined;
			}
			i += closingBraceOffset + 1;
			continue;
		}
		if (text.charAt(i) === quote) {
			return i;
		}
	}
	return undefined;
}

/**
 * Wraps `code` in a Markdown inline code span. Backslashes cannot escape backticks inside a
 * code span, so instead this uses a delimiter longer than any run of backticks already in
 * `code`, padded with a space on each side (harmless, and required when `code` itself starts
 * or ends with a backtick) per the CommonMark code span rules.
 */
function wrapAsInlineCode(code: string): string {
	const maxBacktickRun = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
	const delimiter = '`'.repeat(maxBacktickRun + 1);
	const padding = maxBacktickRun ? ' ' : '';
	return `${delimiter}${padding}${code}${padding}${delimiter}`;
}

function getTagDocumentation(
	tag: Proto.JSDocTagInfo,
	filePathConverter: IFilePathToResourceConverter,
): string | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'param':
		case 'template': {
			const body = getTagBody(tag, filePathConverter);
			if (body?.length === 3) {
				const param = body[1];
				const doc = body[2];
				const label = `*@${tag.name}* \`${param}\``;
				if (!doc) {
					return label;
				}
				return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` \u2014 ${doc}`);
			}
			break;
		}
		case 'return':
		case 'returns': {
			// For return(s), we require a non-empty body
			if (!tag.text?.length) {
				return undefined;
			}

			break;
		}
	}


	// Generic tag
	const label = `*@${tag.name}*`;
	const text = getTagBodyText(tag, filePathConverter);
	if (!text) {
		return label;
	}
	return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` \u2014 ${text}`);
}

function getTagBody(tag: Proto.JSDocTagInfo, filePathConverter: IFilePathToResourceConverter): Array<string> | undefined {
	if (tag.name === 'template') {
		const parts = tag.text;
		if (parts && typeof (parts) !== 'string') {
			const params = parts.filter(p => p.kind === 'typeParameterName').map(p => p.text).join(', ');
			const docs = parts.filter(p => p.kind === 'text').map(p => convertLinkTags(p.text.replace(/^\s*-?\s*/, ''), filePathConverter)).join(' ');
			return params ? ['', params, docs] : undefined;
		}
	}
	return (convertLinkTags(tag.text, filePathConverter)).split(/^(\S+)\s*-?\s*/);
}

function asPlainText(parts: readonly Proto.SymbolDisplayPart[] | string): string {
	if (typeof parts === 'string') {
		return parts;
	}
	return parts.map(part => part.text).join('');
}

export function asPlainTextWithLinks(
	parts: readonly Proto.SymbolDisplayPart[] | string,
	filePathConverter: IFilePathToResourceConverter,
): string {
	return convertLinkTags(parts, filePathConverter);
}

/**
 * Convert `@link` inline tags to markdown links
 */
function convertLinkTags(
	parts: readonly Proto.SymbolDisplayPart[] | string | undefined,
	filePathConverter: IFilePathToResourceConverter,
): string {
	if (!parts) {
		return '';
	}

	if (typeof parts === 'string') {
		return parts;
	}

	const out: string[] = [];

	let currentLink: { name?: string; target?: Proto.FileSpan; text?: string; readonly linkcode: boolean } | undefined;
	for (const part of parts) {
		switch (part.kind) {
			case 'link':
				if (currentLink) {
					if (currentLink.target) {
						const file = filePathConverter.toResource(currentLink.target.file);
						const args: OpenJsDocLinkCommand_Args = {
							file: { ...file.toJSON(), $mid: undefined }, // Prevent VS Code from trying to transform the uri,
							position: typeConverters.Position.fromLocation(currentLink.target.start)
						};
						const command = `command:${OpenJsDocLinkCommand.id}?${encodeURIComponent(JSON.stringify([args]))}`;

						const linkText = currentLink.text ? currentLink.text : escapeMarkdownSyntaxTokensForCode(currentLink.name ?? '');
						out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${command} "${vscode.l10n.t('Open symbol link')}")`);
					} else {
						const text = currentLink.text ?? currentLink.name;
						if (text) {
							if (/^https?:/.test(text)) {
								const parts = text.split(' ');
								if (parts.length === 1 && !currentLink.linkcode) {
									out.push(`<${parts[0]}>`);
								} else {
									const linkText = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
									out.push(`[${currentLink.linkcode ? '`' + escapeMarkdownSyntaxTokensForCode(linkText) + '`' : linkText}](${parts[0]})`);
								}
							} else {
								out.push(escapeMarkdownSyntaxTokensForCode(text));
							}
						}
					}
					currentLink = undefined;
				} else {
					currentLink = {
						linkcode: part.text === '{@linkcode '
					};
				}
				break;

			case 'linkName':
				if (currentLink) {
					currentLink.name = part.text;
					currentLink.target = (part as Proto.JSDocLinkDisplayPart).target;
				}
				break;

			case 'linkText':
				if (currentLink) {
					currentLink.text = part.text;
				}
				break;

			default:
				out.push(part.text);
				break;
		}
	}
	return out.join('');
}

function escapeMarkdownSyntaxTokensForCode(text: string): string {
	return text.replace(/`/g, '\\$&'); // CodeQL [SM02383] This is only meant to escape backticks. The Markdown is fully sanitized after being rendered.
}

export function tagsToMarkdown(
	tags: readonly Proto.JSDocTagInfo[],
	filePathConverter: IFilePathToResourceConverter,
): string {
	return tags.map(tag => getTagDocumentation(tag, filePathConverter)).join('  \n\n');
}

export function documentationToMarkdown(
	documentation: readonly Proto.SymbolDisplayPart[] | string,
	tags: readonly Proto.JSDocTagInfo[],
	filePathConverter: IFilePathToResourceConverter,
	baseUri: vscode.Uri | undefined,
): vscode.MarkdownString {
	const out = new vscode.MarkdownString();
	appendDocumentationAsMarkdown(out, documentation, tags, filePathConverter);
	out.baseUri = baseUri;
	out.isTrusted = { enabledCommands: [OpenJsDocLinkCommand.id] };
	return out;
}

export function appendDocumentationAsMarkdown(
	out: vscode.MarkdownString,
	documentation: readonly Proto.SymbolDisplayPart[] | string | undefined,
	tags: readonly Proto.JSDocTagInfo[] | undefined,
	converter: IFilePathToResourceConverter,
): vscode.MarkdownString {
	if (documentation) {
		out.appendMarkdown(asPlainTextWithLinks(documentation, converter));
	}

	if (tags) {
		const tagsPreview = tagsToMarkdown(tags, converter);
		if (tagsPreview) {
			out.appendMarkdown('\n\n' + tagsPreview);
		}
	}

	out.isTrusted = { enabledCommands: [OpenJsDocLinkCommand.id] };

	return out;
}
