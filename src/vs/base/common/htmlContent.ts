/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/**
 * MarkedString can be used to render human readable text. It is either a markdown string
 * or a code-block that provides a language and a code snippet. Note that
 * markdown strings will be sanitized - that means html will be escaped.
 */
export type MarkedString = string | { readonly language: string; readonly value: string };

export interface IHTMLContentElementCode {
	language: string;
	value: string;
}

export function markedStringsEquals(a: MarkedString | MarkedString[], b: MarkedString | MarkedString[]): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		return markedStringArrEquals(<MarkedString[]>a, <MarkedString[]>b);
	}
	return markedStringEqual(<MarkedString>a, <MarkedString>b);
}


function markedStringArrEquals(a: MarkedString[], b: MarkedString[]): boolean {
	let aLen = a.length,
		bLen = b.length;

	if (aLen !== bLen) {
		return false;
	}

	for (let i = 0; i < aLen; i++) {
		if (!markedStringEqual(a[i], b[i])) {
			return false;
		}
	}

	return true;
}
function markedStringEqual(a: MarkedString, b: MarkedString): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	if (typeof a === 'string') {
		return typeof b === 'string' && a === b;
	}
	return (
		a['language'] === b['language']
		&& a['value'] === b['value']
	);
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

export interface IHTMLContentElement {
	/**
	 * supports **bold**, __italics__, and [[actions]]
	 */
	formattedText?: string;
	text?: string;
	className?: string;
	style?: string;
	customStyle?: any;
	tagName?: string;
	children?: IHTMLContentElement[];
	isText?: boolean;
	role?: string;
	markdown?: string;
	code?: IHTMLContentElementCode;
}

function htmlContentElementCodeEqual(a: IHTMLContentElementCode, b: IHTMLContentElementCode): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.language === b.language
		&& a.value === b.value
	);
}

function htmlContentElementEqual(a: IHTMLContentElement, b: IHTMLContentElement): boolean {
	return (
		a.formattedText === b.formattedText
		&& a.text === b.text
		&& a.className === b.className
		&& a.style === b.style
		&& a.customStyle === b.customStyle
		&& a.tagName === b.tagName
		&& a.isText === b.isText
		&& a.role === b.role
		&& a.markdown === b.markdown
		&& htmlContentElementCodeEqual(a.code, b.code)
		&& htmlContentElementArrEquals(a.children, b.children)
	);
}

export function htmlContentElementArrEquals(a: IHTMLContentElement[], b: IHTMLContentElement[]): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}

	let aLen = a.length,
		bLen = b.length;

	if (aLen !== bLen) {
		return false;
	}

	for (let i = 0; i < aLen; i++) {
		if (!htmlContentElementEqual(a[i], b[i])) {
			return false;
		}
	}

	return true;
}
