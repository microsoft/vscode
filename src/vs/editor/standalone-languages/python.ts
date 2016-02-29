/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ILanguage} from './types';

export var language = <ILanguage> {
	displayName: '',
	name: 'python',
	defaultToken: '',

	lineComment: '#',
	blockCommentStart: '\'\'\'',
	blockCommentEnd: '\'\'\'',

	keywords: [
		'and',
		'as',
		'assert',
		'break',
		'class',
		'continue',
		'def',
		'del',
		'elif',
		'else',
		'except',
		'exec',
		'finally',
		'for',
		'from',
		'global',
		'if',
		'import',
		'in',
		'is',
		'lambda',
		'None',
		'not',
		'or',
		'pass',
		'print',
		'raise',
		'return',
		'self',
		'try',
		'while',
		'with',
		'yield',

		'int',
		'float',
		'long',
		'complex',
		'hex',

		'abs',
		'all',
		'any',
		'apply',
		'basestring',
		'bin',
		'bool',
		'buffer',
		'bytearray',
		'callable',
		'chr',
		'classmethod',
		'cmp',
		'coerce',
		'compile',
		'complex',
		'delattr',
		'dict',
		'dir',
		'divmod',
		'enumerate',
		'eval',
		'execfile',
		'file',
		'filter',
		'format',
		'frozenset',
		'getattr',
		'globals',
		'hasattr',
		'hash',
		'help',
		'id',
		'input',
		'intern',
		'isinstance',
		'issubclass',
		'iter',
		'len',
		'locals',
		'list',
		'map',
		'max',
		'memoryview',
		'min',
		'next',
		'object',
		'oct',
		'open',
		'ord',
		'pow',
		'print',
		'property',
		'reversed',
		'range',
		'raw_input',
		'reduce',
		'reload',
		'repr',
		'reversed',
		'round',
		'set',
		'setattr',
		'slice',
		'sorted',
		'staticmethod',
		'str',
		'sum',
		'super',
		'tuple',
		'type',
		'unichr',
		'unicode',
		'vars',
		'xrange',
		'zip',

		'True',
		'False',

		'__dict__',
		'__methods__',
		'__members__',
		'__class__',
		'__bases__',
		'__name__',
		'__mro__',
		'__subclasses__',
		'__init__',
		'__import__'
	],

	brackets: [
		{ open: '{', close: '}', token: 'delimiter.curly' },
		{ open: '[', close: ']', token: 'delimiter.bracket' },
		{ open: '(', close: ')', token: 'delimiter.parenthesis' }
	],

	// Cause an automatic indent to occur after lines ending in :.
	// enhancedBrackets: [ { open: /.*:\s*$/,  closeComplete: 'else:' } ],

	tokenizer: {
	root: [
			{ include: '@whitespace' },
			{ include: '@numbers' },
			{ include: '@strings' },

			[/[,:;]/, 'delimiter'],
			[/[{}\[\]()]/, '@brackets'],

			[/@[a-zA-Z]\w*/, 'tag'],
			[/[a-zA-Z]\w*/, { cases: { '@keywords': 'keyword',
										'@default': 'identifier' } }]
	],

	// Deal with white space, including single and multi-line comments
	whitespace: [
		[/\s+/, 'white'],
		[/(^#.*$)/, 'comment'],
		[/('''.*''')|(""".*""")/, 'string'],
		[/'''.*$/, 'string', '@endDocString'],
		[/""".*$/, 'string', '@endDblDocString']
	],
	endDocString: [
		[/\\'/, 'string'],
		[/.*'''/, 'string', '@popall'],
		[/.*$/, 'string']
	],
	endDblDocString: [
		[/\\"/, 'string'],
		[/.*"""/, 'string', '@popall'],
		[/.*$/, 'string']
	],

	// Recognize hex, negatives, decimals, imaginaries, longs, and scientific notation
	numbers: [
		[/-?0x([abcdef]|[ABCDEF]|\d)+[lL]?/, 'number.hex'],
		[/-?(\d*\.)?\d+([eE][+\-]?\d+)?[jJ]?[lL]?/, 'number']
	],

	// Recognize strings, including those broken across lines with \ (but not without)
	strings: [
		[/'$/, 'string.escape', '@popall'],
		[/'/, 'string.escape', '@stringBody'],
		[/"$/, 'string.escape', '@popall'],
		[/"/, 'string.escape', '@dblStringBody']
	],
	stringBody: [
		[/\\./, 'string'],
		[/'/, 'string.escape', '@popall'],
		[/.(?=.*')/, 'string'],
		[/.*\\$/, 'string'],
		[/.*$/, 'string', '@popall']
	],
	dblStringBody: [
		[/\\./, 'string'],
		[/"/, 'string.escape', '@popall'],
		[/.(?=.*")/, 'string'],
		[/.*\\$/, 'string'],
		[/.*$/, 'string', '@popall']
	]
	}
};