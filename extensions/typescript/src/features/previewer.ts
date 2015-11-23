/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as Proto from '../protocol';

export interface IHTMLContentElement {
	formattedText?: string;
	text?: string;
	className?: string;
	style?: string;
	customStyle?: any;
	tagName?: string;
	children?: IHTMLContentElement[];
	isText?: boolean;
}

export function html(parts: Proto.SymbolDisplayPart[], className: string = ''): IHTMLContentElement {

	if (!parts) {
		return {};
	}

	let htmlParts = parts.map(part => {
		return <IHTMLContentElement>{
			tagName: 'span',
			text: part.text,
			className: part.kind
		};
	});

	return {
		tagName: 'div',
		className: 'ts-symbol ' + className,
		children: htmlParts
	};
}

export function plain(parts: Proto.SymbolDisplayPart[]): string {
	if (!parts) {
		return '';
	}
	return parts.map(part => part.text).join('');
}