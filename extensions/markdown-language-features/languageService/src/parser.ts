/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Slugifier } from './slugify';
import { ITextDocument } from './types/textDocument';

export interface Token {
	readonly type: string;
	readonly markup: string;
	readonly map: number[] | null;
}

export interface IMdParser {
	readonly slugifier: Slugifier;

	tokenize(document: ITextDocument): Promise<Token[]>;
}
