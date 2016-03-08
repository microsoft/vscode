/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ILanguage} from './types';

export var language = <ILanguage> {
	displayName: 'XML',
	name: 'xml',
	defaultToken: '',

	ignoreCase: true,

	lineComment: '', // no line comment in xml
	blockCommentStart: '<!--',
	blockCommentEnd: '-->',

	// Useful regular expressions
	qualifiedName: /(?:[\w\.\-]+:)?[\w\.\-]+/,

	// enhancedBrackets: [{
	// 	tokenType: 'tag.tag-$1.xml',
	// 	openTrigger: '>',
	// 	open: /<(\w[\w\d]*)([^\/>]*(?!\/)>)[^<>]*$/i,
	// 	closeComplete: '</$1>',
	// 	closeTrigger: '>',
	// 	close: /<\/(\w[\w\d]*)\s*>$/i
	// }],

	autoClosingPairs:  [['\'', '\''], ['"', '"'] ],

	tokenizer: {
		root: [
			[/[^<&]+/, ''],

			{ include: '@whitespace' },

			// Standard opening tag
			[/(<)(@qualifiedName)/, [
				{ token: 'delimiter.start', bracket: '@open' },
				{ token: 'tag.tag-$2', bracket: '@open', next: '@tag.$2' }]],

			// Standard closing tag
			[/(<\/)(@qualifiedName)(\s*)(>)/, [
				{ token: 'delimiter.end', bracket: '@open' },
				{ token: 'tag.tag-$2', bracket: '@close' },
				'',
				{ token: 'delimiter.end', bracket: '@close' }]],

			// Meta tags - instruction
			[/(<\?)(@qualifiedName)/, [
				{ token: 'delimiter.start', bracket: '@open' },
				{ token: 'metatag.instruction', next: '@tag' }]],

			// Meta tags - declaration
			[/(<\!)(@qualifiedName)/, [
				{ token: 'delimiter.start', bracket: '@open' },
				{ token: 'metatag.declaration', next: '@tag' }]],

			// CDATA
			[/<\!\[CDATA\[/, { token: 'delimiter.cdata', bracket: '@open', next: '@cdata' }],

			[/&\w+;/, 'string.escape'],
		],

		cdata: [
			[/[^\]]+/, ''],
			[/\]\]>/, { token: 'delimiter.cdata', bracket: '@close', next: '@pop' }],
			[/\]/, '']
		],

		tag: [
			[/[ \t\r\n]+/, '' ],
			[/(@qualifiedName)(\s*=\s*)("[^"]*"|'[^']*')/, ['attribute.name', '', 'attribute.value']],
			[/(@qualifiedName)(\s*=\s*)("[^">?\/]*|'[^'>?\/]*)(?=[\?\/]\>)/, ['attribute.name', '', 'attribute.value']],
			[/(@qualifiedName)(\s*=\s*)("[^">]*|'[^'>]*)/, ['attribute.name', '', 'attribute.value']],
			[/@qualifiedName/, 'attribute.name'],
			[/\?>/, { token: 'delimiter.start', bracket: '@close', next: '@pop' }],
			[/(\/)(>)/, [
				{ token: 'tag.tag-$S2', bracket: '@close' },
				{ token: 'delimiter.start', bracket: '@close', next: '@pop' }]],
			[/>/, { token: 'delimiter.start', bracket: '@close', next: '@pop' }],
		],

		whitespace: [
			[/[ \t\r\n]+/, ''],
			[/<!--/, { token: 'comment', bracket: '@open', next: '@comment' }]
		],

		comment: [
			[/[^<\-]+/, 'comment.content' ],
			[/-->/,  { token: 'comment', bracket: '@close', next: '@pop' } ],
			[/<!--/, 'comment.content.invalid'],
			[/[<\-]/, 'comment.content' ]
		],
	},
};