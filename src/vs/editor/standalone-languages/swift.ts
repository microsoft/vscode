/*---------------------------------------------------------------------------------------------
 *  Copyright (C) David Owens II, owensd.io. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ILanguage} from './types';

export var language = <ILanguage> {
	displayName: 'Swift',
	name: 'swift',
	defaultToken: '',

	lineComment: '//',
	blockCommentStart: '/*',
	blockCommentEnd: '*/',

	// TODO(owensd): Support the full range of unicode valid identifiers.
	identifier: /[a-zA-Z_][\w$]*/,
	// TODO(owensd): Support the @availability macro properly.
	attributes: [
		'@autoclosure', '@noescape', '@noreturn', '@NSApplicationMain', '@NSCopying', '@NSManaged',
		'@objc', '@UIApplicationMain', '@noreturn', '@availability', '@IBAction', '@IBDesignable', '@IBInspectable', '@IBOutlet'
	],
	accessmodifiers: [ 'public', 'private', 'internal' ],
	keywords: [
		'__COLUMN__', '__FILE__', '__FUNCTION__', '__LINE__', 'as', 'as!', 'as?', 'associativity', 'break', 'case', 'catch',
		'class', 'continue', 'convenience', 'default', 'deinit', 'didSet', 'do', 'dynamic', 'dynamicType',
		'else', 'enum', 'extension', 'fallthrough', 'final', 'for', 'func', 'get', 'guard', 'if', 'import', 'in', 'infix',
		'init', 'inout', 'internal', 'is', 'lazy', 'left', 'let', 'mutating', 'nil', 'none', 'nonmutating', 'operator',
		'optional', 'override', 'postfix', 'precedence', 'prefix', 'private', 'protocol', 'Protocol', 'public',
		'repeat', 'required', 'return', 'right', 'self', 'Self', 'set', 'static', 'struct', 'subscript', 'super', 'switch',
		'throw', 'throws', 'try', 'try!', 'Type', 'typealias', 'unowned', 'var', 'weak', 'where', 'while', 'willSet', 'FALSE', 'TRUE'
	],

	symbols: /[=(){}\[\].,:;@#\_&\-<>`?!+*\\\/]/,

	// Moved . to operatorstart so it can be a delimiter
	operatorstart: /[\/=\-+!*%<>&|^~?\u00A1-\u00A7\u00A9\u00AB\u00AC\u00AE\u00B0-\u00B1\u00B6\u00BB\u00BF\u00D7\u00F7\u2016-\u2017\u2020-\u2027\u2030-\u203E\u2041-\u2053\u2055-\u205E\u2190-\u23FF\u2500-\u2775\u2794-\u2BFF\u2E00-\u2E7F\u3001-\u3003\u3008-\u3030]/,
	operatorend: /[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE00-\uFE0F\uFE20-\uFE2F\uE0100-\uE01EF]/,
	operators: /(@operatorstart)((@operatorstart)|(@operatorend))*/,

	// TODO(owensd): These are borrowed from C#; need to validate correctness for Swift.
	escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	tokenizer: {
		root: [
			{ include: '@comment' },
			{ include: '@attribute' },
			{ include: '@literal' },
			{ include: '@keyword' },
			{ include: '@invokedmethod' },
			{ include: '@symbol' },
		],

		symbol: [
			[/[{}()\[\]]/, '@brackets'],
			[/[<>](?!@symbols)/, '@brackets'],
			[/[.]/, 'delimiter'],
			[/@operators/, 'keyword.operator'],
			[/@symbols/, 'keyword.operator']
		],


		comment: [
			[ /\/\/\/.*$/, 'comment.doc' ],
			[ /\/\*\*/, 'comment.doc', '@commentdocbody' ],
			[ /\/\/.*$/, 'comment' ],
			[ /\/\*/, 'comment', '@commentbody' ]
		],
		commentdocbody: [
			[ /\/\*/, 'comment', '@commentbody' ],
			[ /\*\//, 'comment.doc', '@pop' ],
			[ /\:[a-zA-Z]+\:/, 'comment.doc.param' ],
			[ /./, 'comment.doc' ]
		],
		commentbody: [
			[ /\/\*/, 'comment', '@commentbody' ],
			[ /\*\//, 'comment', '@pop' ],
			[ /./, 'comment' ]
		],

		attribute: [
			[ /\@@identifier/, { cases: { '@attributes': 'keyword.control', '@default': '' } } ]
		],

		literal: [
			[ /"/, { token: 'string.quote', bracket: '@open', next: '@stringlit' } ],
			[ /0[b]([01]_?)+/, 'number.binary' ],
			[ /0[o]([0-7]_?)+/, 'number.octal' ],
			[ /0[x]([0-9a-fA-F]_?)+([pP][\-+](\d_?)+)?/, 'number.hex' ],
			[ /(\d_?)*\.(\d_?)+([eE][\-+]?(\d_?)+)?/, 'number.float'],
			[ /(\d_?)+/, 'number' ]
		],

		stringlit: [
			[ /\\\(/, { token: 'keyword.operator', bracket: '@open', next: '@interpolatedexpression' } ],
			[ /@escapes/, 'string' ],
			[ /\\./, 'string.escape.invalid' ],
			[ /"/, { token: 'string.quote', bracket: '@close', next: '@pop' } ],
			[ /./, 'string' ]
		],

		interpolatedexpression: [
			[ /\(/, { token: 'keyword.operator', bracket: '@open', next: '@interpolatedexpression' } ],
			[ /\)/, { token: 'keyword.operator', bracket: '@close', next: '@pop' } ],
			{ include: '@literal' },
			{ include: '@keyword' },
			{ include: '@symbol' }
		],

		keyword: [
			[ /`/, { token: 'keyword.operator', bracket: '@open', next: '@escapedkeyword' } ],
			[ /@identifier/, { cases: { '@keywords': 'keyword', '[A-Z][\a-zA-Z0-9$]*': 'type.identifier', '@default': 'identifier' } }]
		],

		escapedkeyword: [
			[ /`/, { token: 'keyword.operator', bracket: '@close', next: '@pop' } ],
			[ /./, 'identifier' ]
		],

//		symbol: [
//			[ /@symbols/, 'keyword.operator' ],
//			[ /@operators/, 'keyword.operator' ]
//		],

		invokedmethod: [
			[/([.])(@identifier)/, { cases: { '$2': ['delimeter', 'type.identifier'], '@default': '' } }],
		]
	}
};
