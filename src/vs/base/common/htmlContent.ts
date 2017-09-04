/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { equals } from 'vs/base/common/arrays';
import { marked } from 'vs/base/common/marked/marked';

export interface IMarkdownString {
	value: string;
	isTrusted?: boolean;
}

export class MarkdownString implements IMarkdownString {

	value: string;
	isTrusted?: boolean;

	constructor(value: string = '') {
		this.value = value;
	}

	appendText(value: string): MarkdownString {
		// escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
		this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
		return this;
	}

	appendMarkdown(value: string): MarkdownString {
		this.value += value;
		return this;
	}

	appendCodeblock(langId: string, code: string): MarkdownString {
		this.value += '\n```';
		this.value += langId;
		this.value += '\n';
		this.value += code;
		this.value += '\n```\n';
		return this;
	}
}

export function isEmptyMarkdownString(oneOrMany: IMarkdownString | IMarkdownString[]): boolean {
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
	} else if (typeof thing === 'object') {
		return typeof (<IMarkdownString>thing).value === 'string'
			&& (typeof (<IMarkdownString>thing).isTrusted === 'boolean' || (<IMarkdownString>thing).isTrusted === void 0);
	}
	return false;
}

export function markedStringsEquals(a: IMarkdownString | IMarkdownString[], b: IMarkdownString | IMarkdownString[]): boolean {
	if (!a && !b) {
		return true;
	} else if (!a || !b) {
		return false;
	} else if (Array.isArray(a) && Array.isArray(b)) {
		return equals(a, b, markdownStringEqual);
	} else if (isMarkdownString(a) && isMarkdownString(b)) {
		return markdownStringEqual(a, b);
	} else {
		return false;
	}
}

function markdownStringEqual(a: IMarkdownString, b: IMarkdownString): boolean {
	if (a === b) {
		return true;
	} else if (!a || !b) {
		return false;
	} else {
		return a.value === b.value && a.isTrusted === b.isTrusted;
	}
}

export function removeMarkdownEscapes(text: string): string {
	if (!text) {
		return text;
	}
	return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}

export function containsCommandLink(value: string): boolean {
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
