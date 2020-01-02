/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';

function getTagBodyText(tag: Proto.JSDocTagInfo): string | undefined {
	if (!tag.text) {
		return undefined;
	}

	// Convert to markdown code block if it is not already one
	function makeCodeblock(text: string): string {
		if (text.match(/^\s*[~`]{3}/g)) {
			return text;
		}
		return '```\n' + text + '\n```';
	}

	switch (tag.name) {
		case 'example':
			// check for caption tags, fix for #79704
			const captionTagMatches = tag.text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
			if (captionTagMatches && captionTagMatches.index === 0) {
				return captionTagMatches[1] + '\n\n' + makeCodeblock(tag.text.substr(captionTagMatches[0].length));
			} else {
				return makeCodeblock(tag.text);
			}

		case 'default':
			return makeCodeblock(tag.text);
	}

	return tag.text;
}

function getTagDocumentation(tag: Proto.JSDocTagInfo): string | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'param':
		case 'template':
			const body = (tag.text || '').split(/^([\w\.]+)\s*-?\s*/);
			if (body && body.length === 3) {
				const param = body[1];
				const doc = body[2];
				const label = `*@${tag.name}* \`${param}\``;
				if (!doc) {
					return label;
				}
				return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` — ${doc}`);
			}
	}

	// Generic tag
	const label = `*@${tag.name}*`;
	const text = getTagBodyText(tag);
	if (!text) {
		return label;
	}
	return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` — ${text}`);
}

export function plain(parts: Proto.SymbolDisplayPart[]): string {
	if (!parts) {
		return '';
	}
	return parts.map(part => part.text).join('');
}

export function tagsMarkdownPreview(tags: Proto.JSDocTagInfo[]): string {
	return (tags || [])
		.map(getTagDocumentation)
		.join('  \n\n');
}

export function markdownDocumentation(
	documentation: Proto.SymbolDisplayPart[],
	tags: Proto.JSDocTagInfo[]
): vscode.MarkdownString {
	const out = new vscode.MarkdownString();
	addMarkdownDocumentation(out, documentation, tags);
	return out;
}

export function addMarkdownDocumentation(
	out: vscode.MarkdownString,
	documentation: Proto.SymbolDisplayPart[] | undefined,
	tags: Proto.JSDocTagInfo[] | undefined
): vscode.MarkdownString {
	if (documentation) {
		out.appendMarkdown(plain(documentation));
	}

	if (tags) {
		const tagsPreview = tagsMarkdownPreview(tags);
		if (tagsPreview) {
			out.appendMarkdown('\n\n' + tagsPreview);
		}
	}
	return out;
}
