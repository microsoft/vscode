/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { equals } from 'vs/base/common/arrays';
import { marked } from 'vs/base/common/marked/marked';

/**
 * MarkedString can be used to render human readable text. It is either a markdown string
 * or a code-block that provides a language and a code snippet. Note that
 * markdown strings will be sanitized - that means html will be escaped.
 */
export type MarkedString = string;

export function markedStringsEquals(a: MarkedString | MarkedString[], b: MarkedString | MarkedString[]): boolean {
	if (!a && !b) {
		return true;
	} else if (!a || !b) {
		return false;
	} else if (typeof a === 'string' && typeof b === 'string') {
		return a === b;
	} else if (Array.isArray(a) && Array.isArray(b)) {
		return equals(a, b);
	} else {
		return false;
	}
}

export function textToMarkedString(text: string): MarkedString {
	return text.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
}

export function removeMarkdownEscapes(text: string): string {
	if (!text) {
		return text;
	}
	return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}

export function containsCommandLink(value: MarkedString): boolean {
	let uses = false;
	const renderer = new marked.Renderer();
	renderer.link = (href, title, text): string => {
		if (href.match(/^command:/i)) {
			uses = true;
		}
		return 'link';
	};
	marked(value, { renderer });
	return uses;
}
