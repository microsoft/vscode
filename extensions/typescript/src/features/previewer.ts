/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Proto from '../protocol';
import { MarkdownString } from 'vscode';

export function plain(parts: Proto.SymbolDisplayPart[]): string {
	if (!parts) {
		return '';
	}
	return parts.map(part => part.text).join('');
}

export function tagsMarkdownPreview(tags: Proto.JSDocTagInfo[]): string {
	return (tags || [])
		.map(tag => {
			const label = `*@${tag.name}*`;
			if (!tag.text) {
				return label;
			}
			return label + (tag.text.match(/\r\n|\n/g) ? '  \n' + tag.text : ` — ${tag.text}`);
		})
		.join('  \n\n');
}

export function markdownDocumentation(
	documentation: Proto.SymbolDisplayPart[],
	tags: Proto.JSDocTagInfo[]
): MarkdownString {
	const out = new MarkdownString();
	out.appendMarkdown(plain(documentation));
	const tagsPreview = tagsMarkdownPreview(tags);
	if (tagsPreview) {
		out.appendMarkdown('\n\n' + tagsPreview);
	}
	return out;
}