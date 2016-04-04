/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IHTMLContentElementCode {
	language: string;
	value: string;
}

export interface IHTMLContentElement {
	/**
	 * supports **bold**, __italics__, and [[actions]]
	 */
	formattedText?:string;
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

function htmlContentElementCodeEqual(a:IHTMLContentElementCode, b:IHTMLContentElementCode): boolean {
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

function htmlContentElementEqual(a:IHTMLContentElement, b:IHTMLContentElement): boolean {
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

export function htmlContentElementArrEquals(a:IHTMLContentElement[], b:IHTMLContentElement[]): boolean {
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
