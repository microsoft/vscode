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
		.map(tag => `*@${tag.name}*` + (tag.text ? ` — ${tag.text}` : ''))
		.join('  \n');
}

export function tagsPlainPreview(tags: Proto.JSDocTagInfo[]): string {
	return (tags || [])
		.map(tag => `@${tag.name}` + (tag.text ? ` — ${tag.text}` : ''))
		.join('\n');
}