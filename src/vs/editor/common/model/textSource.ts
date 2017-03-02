/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * The text source
 */
export interface ITextSource2 {
	/**
	 * The entire text length.
	 */
	readonly length: number;
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The number of lines ending with '\r\n'
	 */
	readonly totalCRCount: number;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}
