/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as Proto from '../protocol';

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

function tagsPlainPreview(tags: Proto.JSDocTagInfo[]): string {
	return (tags || [])
		.map(tag => {
			const label = `@${tag.name}`;
			if (!tag.text) {
				return label;
			}
			return label + (tag.text.match(/\r\n|\n/g) ? '\n' + tag.text : ` — ${tag.text}`);
		})
		.join('\n\ngit');
}

export function plainDocumentation(documentation: Proto.SymbolDisplayPart[], tags: Proto.JSDocTagInfo[]): string {
	const parts = [plain(documentation), tagsPlainPreview(tags)];
	return parts.filter(x => x).join('\n\n');
}