/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ILanguage} from './types';

export var language = <ILanguage> {
	displayName: 'R',
	name: 'r',
	defaultToken: '',

	lineComment: '#',
	blockCommentStart: '',
	blockCommentEnd: '',

	roxygen: [
		'@param',
		'@return',
		'@name',
		'@rdname',
		'@examples',
		'@include',
		'@docType',
		'@S3method',
		'@TODO',
		'@aliases',
		'@alias',
		'@assignee',
		'@author',
		'@callGraphDepth',
		'@callGraph',
		'@callGraphPrimitives',
		'@concept',
		'@exportClass',
		'@exportMethod',
		'@exportPattern',
		'@export',
		'@formals',
		'@format',
		'@importClassesFrom',
		'@importFrom',
		'@importMethodsFrom',
		'@import',
		'@keywords',
		'@method',
		'@nord',
		'@note',
		'@references',
		'@seealso',
		'@setClass',
		'@slot',
		'@source',
		'@title',
		'@usage'
	],

	constants: [
		'NULL',
		'FALSE',
		'TRUE',
		'NA',
		'Inf',
		'NaN ',
		'NA_integer_',
		'NA_real_',
		'NA_complex_',
		'NA_character_ ',
		'T',
		'F',
		'LETTERS',
		'letters',
		'month.abb',
		'month.name',
		'pi',
		'R.version.string'
	],

	keywords: [
		'break',
		'next',
		'return',
		'if',
		'else',
		'for',
		'in',
		'repeat',
		'while',
		'array',
		'category',
		'character',
		'complex',
		'double',
		'function',
		'integer',
		'list',
		'logical',
		'matrix',
		'numeric',
		'vector',
		'data.frame',
		'factor',
		'library',
		'require',
		'attach',
		'detach',
		'source'
	],

	special: [
		'\\n',
		'\\r',
		'\\t',
		'\\b',
		'\\a',
		'\\f',
		'\\v',
		'\\\'',
		'\\"',
		'\\\\'
	],

	brackets: [
		{ open: '{', close: '}', token: 'delimiter.curly' },
		{ open: '[', close: ']', token: 'delimiter.bracket' },
		{ open: '(', close: ')', token: 'delimiter.parenthesis' }
	],

	tokenizer: {
		root: [
			{ include: '@numbers' },
			{ include: '@strings' },

			[/[{}\[\]()]/, '@brackets'],

			{ include: '@operators' },

			[/#'/, 'comment.doc', '@roxygen'],
			[/(^#.*$)/, 'comment'],

			[/\s+/, 'white'],

			[/[,:;]/, 'delimiter'],

			[/@[a-zA-Z]\w*/, 'tag'],
			[/[a-zA-Z]\w*/, {
				cases: {
					'@keywords': 'keyword',
					'@constants': 'constant',
					'@default': 'identifier'
				}
			}]
		],

		// Recognize Roxygen comments
		roxygen: [
			[/@\w+/, {
				cases: {
					'@roxygen': 'tag',
					'@eos': { token: 'comment.doc', next: '@pop' },
					'@default': 'comment.doc'
				}
			}],
			[/\s+/, {
				cases: {
					'@eos': { token: 'comment.doc', next: '@pop' },
					'@default': 'comment.doc'
				}
			}],
			[/.*/, { token: 'comment.doc', next: '@pop' }]
		],

		// Recognize positives, negatives, decimals, imaginaries, and scientific notation
		numbers: [
			[/-?(\d*\.)?\d+([eE][+\-]?\d+)?/, 'number']
		],

		// Recognize operators
		operators: [
			[/<{1,2}-/, 'operator'],
			[/->{1,2}/, 'operator'],
			[/%[^%\s]+%/, 'operator'],
			[/\*\*/, 'operator'],
			[/%%/, 'operator'],
			[/&&/, 'operator'],
			[/\|\|/, 'operator'],
			[/<</, 'operator'],
			[/>>/, 'operator'],
			[/[-+=&|!<>^~*/:$]/, 'operator']
		],

		// Recognize strings, including those broken across lines
		strings: [
			[/'/, 'string.escape', '@stringBody'],
			[/"/, 'string.escape', '@dblStringBody']
		],
		stringBody: [
			[/\\./, {
				cases: {
					'@special': 'string',
					'@default': 'error-token'
				}
			}],
			[/'/, 'string.escape', '@popall'],
			[/./, 'string'],
		],
		dblStringBody: [
			[/\\./, {
				cases: {
					'@special': 'string',
					'@default': 'error-token'
				}
			}],
			[/"/, 'string.escape', '@popall'],
			[/./, 'string'],
		]
	}
};