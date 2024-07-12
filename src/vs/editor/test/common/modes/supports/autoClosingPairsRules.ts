/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAutoClosingPair, IAutoClosingPairConditional } from 'vs/editor/common/languages/languageConfiguration';

export const javascriptAutoClosingPairsRules: IAutoClosingPairConditional[] = [
	{ open: '{', close: '}' },
	{ open: '[', close: ']' },
	{ open: '(', close: ')' },
	{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
	{ open: '"', close: '"', notIn: ['string'] },
	{ open: '`', close: '`', notIn: ['string', 'comment'] },
	{ open: '/**', close: ' */', notIn: ['string'] }
];

export const latexAutoClosingPairsRules: IAutoClosingPair[] = [
	{ open: '\\left(', close: '\\right)' },
	{ open: '\\left[', close: '\\right]' },
	{ open: '\\left\\{', close: '\\right\\}' },
	{ open: '\\bigl(', close: '\\bigr)' },
	{ open: '\\bigl[', close: '\\bigr]' },
	{ open: '\\bigl\\{', close: '\\bigr\\}' },
	{ open: '\\Bigl(', close: '\\Bigr)' },
	{ open: '\\Bigl[', close: '\\Bigr]' },
	{ open: '\\Bigl\\{', close: '\\Bigr\\}' },
	{ open: '\\biggl(', close: '\\biggr)' },
	{ open: '\\biggl[', close: '\\biggr]' },
	{ open: '\\biggl\\{', close: '\\biggr\\}' },
	{ open: '\\Biggl(', close: '\\Biggr)' },
	{ open: '\\Biggl[', close: '\\Biggr]' },
	{ open: '\\Biggl\\{', close: '\\Biggr\\}' },
	{ open: '\\(', close: '\\)' },
	{ open: '\\[', close: '\\]' },
	{ open: '\\{', close: '\\}' },
	{ open: '{', close: '}' },
	{ open: '[', close: ']' },
	{ open: '(', close: ')' },
	{ open: '`', close: '\'' },
];
