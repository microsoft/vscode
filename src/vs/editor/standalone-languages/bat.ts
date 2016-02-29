/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ILanguage} from './types';

export var language = <ILanguage> {
	displayName:    'Batch',
	name:           'bat',
	defaultToken: '',
	ignoreCase: true,

	lineComment: 'REM',

	autoClosingPairs: [	['{','}' ], 	['[',']' ],	['(',')' ],	['"','"' ]], // Exclude '

	brackets: [
		{ token: 'punctuation.bracket', open: '{', close: '}' },
		{ token: 'punctuation.parenthesis', open: '(', close: ')' },
		{ token: 'punctuation.square', open: '[', close: ']' }
	],

	// enhancedBrackets: [
	// 		{
	// 			openTrigger: 'l',
	// 			open: /setlocal$/i,
	// 			closeComplete: 'endlocal',
	// 			matchCase: true,
	// 			closeTrigger: 'l',
	// 			close: /endlocal$/i,
	// 			tokenType: 'keyword.tag-setlocal'
	// 		}
	// 	],

	keywords: /call|defined|echo|errorlevel|exist|for|goto|if|pause|set|shift|start|title|not|pushd|popd/,

	// we include these common regular expressions
	symbols:  /[=><!~?&|+\-*\/\^;\.,]+/,
	escapes:  /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	// The main tokenizer for our languages
	tokenizer: {
		root: [

			[/^(\s*)(rem(?:\s.*|))$/, ['','comment']],

			[/(\@?)(@keywords)(?!\w)/, [{token:'support.function'}, {token:'support.function.$2'}]],

			// whitespace
			[/[ \t\r\n]+/, ''],

			// blocks
			[/setlocal(?!\w)/, { token: 'support.function.tag-setlocal', bracket: '@open' }],
			[/endlocal(?!\w)/, { token: 'support.function.tag-setlocal', bracket: '@close' }],

			// words
			[/[a-zA-Z_]\w*/, ''],

			// labels
			[/:\w*/, 'metatag'],

			// variables
			[/%[^%]+%/, 'variable'],
			[/%%[\w]+(?!\w)/, 'variable'],

			// punctuations
			[/[{}()\[\]]/, '@brackets'],
			[/@symbols/, 'punctuation'],

			// numbers
			[/\d*\.\d+([eE][\-+]?\d+)?/, 'constant.numeric.float'],
			[/0[xX][0-9a-fA-F_]*[0-9a-fA-F]/, 'constant.numeric.hex'],
			[/\d+/, 'constant.numeric'],

			// punctuation: after number because of .\d floats
			[/[;,.]/, 'punctuation'],

			// strings:
			[/"/,  'string', '@string."' ],
			[/'/, 'string', '@string.\''],
		],

		string: [
			[/[^\\"'%]+/, { cases: { '@eos': {token:'string', next:'@popall'}, '@default': 'string' }}],
			[/@escapes/, 'string.escape'],
			[/\\./, 'string.escape.invalid'],
			[/%[\w ]+%/, 'variable'],
			[/%%[\w]+(?!\w)/, 'variable'],
			[/["']/,     { cases: { '$#==$S2' : { token: 'string', next: '@pop' },
							'@default': 'string' }} ],
			[/$/, 'string', '@popall']
		],

	}
};