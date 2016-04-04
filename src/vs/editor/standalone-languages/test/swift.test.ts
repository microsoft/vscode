/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/swift';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('swift', language, [

	// Attributes
	[{
	line: '@noescape',
	tokens: [
		{ startIndex: 0, type: 'keyword.control.swift' } /* '@noescape' */
	]}],
	//Keyword and Type Identifier
	[{
		line: 'class App: UI, UIApp, UIView {',
		tokens: [
		{ startIndex: 0, type: 'keyword.swift' } /* 'class' */,
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'type.identifier.swift' } /* 'App' */,
		{ startIndex: 9, type: 'keyword.operator.swift' } /* ':' */,
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'type.identifier.swift' } /* 'UI' */,
		{ startIndex: 13, type: 'keyword.operator.swift' } /* ',' */,
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'type.identifier.swift' } /* 'UIApp' */,
		{ startIndex: 20, type: 'keyword.operator.swift' } /* ',' */,
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'type.identifier.swift' } /* 'UIView' */,
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'delimiter.curly.swift' } /* '{' */
	]}],
	// Keyword, Identifier, and Type Identifier
	[{
		line: '    var window: UIWindow?',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.swift' } /* 'var' */,
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.swift' } /* 'window' */,
		{ startIndex: 14, type: 'keyword.operator.swift' } /* ':' */,
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'type.identifier.swift' } /* 'UIWindow' */,
		{ startIndex: 24, type: 'keyword.operator.swift' } /* '?' */
	]}],
	//Comment
	[{
		line: '    // Comment',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.swift' } /* '// Comment' */
	]}],
	//Block Comment with Embedded Comment followed by code
	[{
		line: '    /* Comment //Embedded */ var y = 0b10',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.swift' }, // /* '/* Comment //Embedded */' */,
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'keyword.swift' } /* 'var' */,
		{ startIndex: 32, type: '' },
		{ startIndex: 33, type: 'identifier.swift' }	/* 'y' */,
		{ startIndex: 34, type: '' },
		{ startIndex: 35, type: 'keyword.operator.swift' } /* '=' */,
		{ startIndex: 36, type: '' },
		{ startIndex: 37, type: 'number.binary.swift' } /* '0b10' */
	]}],
	// Method signature (broken on two lines)
	[{
		line: '    public func app(app: App, opts:',
		tokens:[
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.swift' } /* 'public' */,
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.swift' } /* 'func' */,
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'identifier.swift' } /* 'app' */,
		{ startIndex: 19, type: 'delimiter.parenthesis.swift' } /* '(' */,
		{ startIndex: 20, type: 'identifier.swift' }/* 'app' */,
		{ startIndex: 23, type: 'keyword.operator.swift' } /* ':' */,
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'type.identifier.swift' } /* 'App' */,
		{ startIndex: 28, type: 'keyword.operator.swift' } /* ',' */,
		{ startIndex: 29, type: '' },
		{ startIndex: 30, type: 'identifier.swift' } /* 'opts' */,
		{ startIndex: 34, type: 'keyword.operator.swift' } /* ':' */,
	]}],
	// Method signature Continued
	[{
		line: '        [NSObject: AnyObject]?) -> Bool {',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.square.swift' } /* '[' */,
		{ startIndex: 9, type: 'type.identifier.swift' } /* 'NSObject' */,
		{ startIndex: 17, type: 'keyword.operator.swift' } /* ':' */,
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'type.identifier.swift' } /* 'AnyObject' */,
		{ startIndex: 28, type: 'delimiter.square.swift' } /* ']' */,
		{ startIndex: 29, type: 'keyword.operator.swift' } /* '?' */,
		{ startIndex: 30, type: 'delimiter.parenthesis.swift' } /* ')' */,
		{ startIndex: 31, type: '' },
		{ startIndex: 32, type: 'keyword.operator.swift' } /* '->' */,
		{ startIndex: 34, type: '' },
		{ startIndex: 35, type: 'type.identifier.swift' } /* 'Bool' */,
		{ startIndex: 39, type: '' },
		{ startIndex: 40, type: 'delimiter.curly.swift' } /* '{' */
	]}],
	// String with escapes
	[{
		line: '        var `String` = "String w/ \\"escape\\""',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'keyword.swift' } /* 'var' */,
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'keyword.operator.swift' } /* '`' */,
		{ startIndex: 13, type: 'identifier.swift' } /* 'String' */,
		{ startIndex: 19, type: 'keyword.operator.swift' } /* '`' */,
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'keyword.operator.swift' } /* '=' */,
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'string.quote.swift' } /* '"' */,
		{ startIndex: 24, type: 'string.swift' } /* 'String w/ \\"escape\\""' */,
		{ startIndex: 44, type: 'string.quote.swift' } /* '"' */,
	]}],
	// String with interpolated expression
	[{
		line: '        let message = "\\(y) times 2.5 is \\(Double(25) * 2.5)"',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'keyword.swift' } /* 'let' */,
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'identifier.swift' } /* 'message' */,
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'keyword.operator.swift' } /* '=' */,
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'string.quote.swift' } /* '"' */,
		{ startIndex: 23, type: 'keyword.operator.swift' } /* '\(' */,
		{ startIndex: 25, type: 'identifier.swift' },
		{ startIndex: 26, type: 'keyword.operator.swift' } /* ')' */,
		{ startIndex: 27, type: 'string.swift' } /* ' times 2.5 is ' */,
		{ startIndex: 41, type: 'keyword.operator.swift' } /* '\(' */,
		{ startIndex: 43, type: 'type.identifier.swift' } /* 'Double' */,
		{ startIndex: 49, type: 'keyword.operator.swift' } /* '(' */,
		{ startIndex: 50, type: 'number.swift' } /* '25' */,
		{ startIndex: 52, type: 'keyword.operator.swift' } /* ')' */,
		{ startIndex: 53, type: '' },
		{ startIndex: 54, type: 'keyword.operator.swift' } /* '*' */,
		{ startIndex: 55, type: '' },
		{ startIndex: 56, type: 'number.float.swift' } /* '2.5' */,
		{ startIndex: 59, type: 'keyword.operator.swift' } /* ')' */,
		{ startIndex: 60, type: 'string.quote.swift' } /* '"' */
	]}],
	// Method invocation/property accessor.
	[{
		line: '        let view = self.window!.contr as! UIView',
		tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'keyword.swift' } /* 'let' */,
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'identifier.swift' } /* 'view' */,
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'keyword.operator.swift' } /* '=' */,
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'keyword.swift' } /* 'self' */,
		{ startIndex: 23, type: 'delimeter.swift' } /* '.' */,
		{ startIndex: 24, type: 'type.identifier.swift' } /* 'window' */,
		{ startIndex: 30, type: 'keyword.operator.swift' } /* '!' */,
		{ startIndex: 31, type: 'delimeter.swift' } /* '.' */,
		{ startIndex: 32, type: 'type.identifier.swift' } /* 'contr' */,
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'keyword.swift' } /* 'as' */,
		{ startIndex: 40, type: 'keyword.operator.swift' } /* '!' */,
		{ startIndex: 41, type: '' },
		{ startIndex: 42, type: 'type.identifier.swift' } /* 'UIView' */
	]}]
]);

