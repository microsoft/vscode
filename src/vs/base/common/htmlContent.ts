/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

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
	code?: { language: string; value: string; };
}