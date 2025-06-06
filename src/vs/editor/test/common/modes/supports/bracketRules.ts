/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharacterPair } from '../../../../common/languages/languageConfiguration.js';

const standardBracketRules: CharacterPair[] = [
	['{', '}'],
	['[', ']'],
	['(', ')']
];

export const rubyBracketRules = standardBracketRules;

export const cppBracketRules = standardBracketRules;

export const goBracketRules = standardBracketRules;

export const phpBracketRules = standardBracketRules;

export const vbBracketRules = standardBracketRules;

export const luaBracketRules = standardBracketRules;

export const htmlBracketRules: CharacterPair[] = [
	['<!--', '-->'],
	['{', '}'],
	['(', ')']
];

export const typescriptBracketRules: CharacterPair[] = [
	['${', '}'],
	['{', '}'],
	['[', ']'],
	['(', ')']
];

export const latexBracketRules: CharacterPair[] = [
	['{', '}'],
	['[', ']'],
	['(', ')'],
	['[', ')'],
	['(', ']'],
	['\\left(', '\\right)'],
	['\\left(', '\\right.'],
	['\\left.', '\\right)'],
	['\\left[', '\\right]'],
	['\\left[', '\\right.'],
	['\\left.', '\\right]'],
	['\\left\\{', '\\right\\}'],
	['\\left\\{', '\\right.'],
	['\\left.', '\\right\\}'],
	['\\left<', '\\right>'],
	['\\bigl(', '\\bigr)'],
	['\\bigl[', '\\bigr]'],
	['\\bigl\\{', '\\bigr\\}'],
	['\\Bigl(', '\\Bigr)'],
	['\\Bigl[', '\\Bigr]'],
	['\\Bigl\\{', '\\Bigr\\}'],
	['\\biggl(', '\\biggr)'],
	['\\biggl[', '\\biggr]'],
	['\\biggl\\{', '\\biggr\\}'],
	['\\Biggl(', '\\Biggr)'],
	['\\Biggl[', '\\Biggr]'],
	['\\Biggl\\{', '\\Biggr\\}'],
	['\\langle', '\\rangle'],
	['\\lvert', '\\rvert'],
	['\\lVert', '\\rVert'],
	['\\left|', '\\right|'],
	['\\left\\vert', '\\right\\vert'],
	['\\left\\|', '\\right\\|'],
	['\\left\\Vert', '\\right\\Vert'],
	['\\left\\langle', '\\right\\rangle'],
	['\\left\\lvert', '\\right\\rvert'],
	['\\left\\lVert', '\\right\\rVert'],
	['\\bigl\\langle', '\\bigr\\rangle'],
	['\\bigl|', '\\bigr|'],
	['\\bigl\\vert', '\\bigr\\vert'],
	['\\bigl\\lvert', '\\bigr\\rvert'],
	['\\bigl\\|', '\\bigr\\|'],
	['\\bigl\\lVert', '\\bigr\\rVert'],
	['\\bigl\\Vert', '\\bigr\\Vert'],
	['\\Bigl\\langle', '\\Bigr\\rangle'],
	['\\Bigl|', '\\Bigr|'],
	['\\Bigl\\lvert', '\\Bigr\\rvert'],
	['\\Bigl\\vert', '\\Bigr\\vert'],
	['\\Bigl\\|', '\\Bigr\\|'],
	['\\Bigl\\lVert', '\\Bigr\\rVert'],
	['\\Bigl\\Vert', '\\Bigr\\Vert'],
	['\\biggl\\langle', '\\biggr\\rangle'],
	['\\biggl|', '\\biggr|'],
	['\\biggl\\lvert', '\\biggr\\rvert'],
	['\\biggl\\vert', '\\biggr\\vert'],
	['\\biggl\\|', '\\biggr\\|'],
	['\\biggl\\lVert', '\\biggr\\rVert'],
	['\\biggl\\Vert', '\\biggr\\Vert'],
	['\\Biggl\\langle', '\\Biggr\\rangle'],
	['\\Biggl|', '\\Biggr|'],
	['\\Biggl\\lvert', '\\Biggr\\rvert'],
	['\\Biggl\\vert', '\\Biggr\\vert'],
	['\\Biggl\\|', '\\Biggr\\|'],
	['\\Biggl\\lVert', '\\Biggr\\rVert'],
	['\\Biggl\\Vert', '\\Biggr\\Vert']
];

