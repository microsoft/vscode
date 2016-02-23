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
		{ startIndex: 0, type: 'keyword.control.swift', bracket: 0 } /* '@noescape' */
	]}],
	//Keyword and Type Identifier
	[{
		line: 'class App: UI, UIApp, UIView {',
		tokens: [
		{ startIndex: 0, type: 'keyword.swift', bracket: 0 } /* 'class' */,
		{ startIndex: 5, type: '', bracket: 0 },
		{ startIndex: 6, type: 'type.identifier.swift', bracket: 0 } /* 'App' */,
		{ startIndex: 9, type: 'keyword.operator.swift', bracket: 0 } /* ':' */,
		{ startIndex: 10, type: '', bracket: 0 },
		{ startIndex: 11, type: 'type.identifier.swift', bracket: 0 } /* 'UI' */,
		{ startIndex: 13, type: 'keyword.operator.swift', bracket: 0 } /* ',' */,
		{ startIndex: 14, type: '', bracket: 0 },
		{ startIndex: 15, type: 'type.identifier.swift', bracket: 0 } /* 'UIApp' */,
		{ startIndex: 20, type: 'keyword.operator.swift', bracket: 0 } /* ',' */,
		{ startIndex: 21, type: '', bracket: 0 },
		{ startIndex: 22, type: 'type.identifier.swift', bracket: 0 } /* 'UIView' */,
		{ startIndex: 28, type: '', bracket: 0 },
		{ startIndex: 29, type: 'delimiter.curly.swift', bracket: 1 } /* '{' */
	]}],
	// Keyword, Identifier, and Type Identifier
	[{
		line: '    var window: UIWindow?',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 4, type: 'keyword.swift', bracket: 0 } /* 'var' */,
		{ startIndex: 7, type: '', bracket: 0 },
		{ startIndex: 8, type: 'identifier.swift', bracket: 0 } /* 'window' */,
		{ startIndex: 14, type: 'keyword.operator.swift', bracket: 0 } /* ':' */,
		{ startIndex: 15, type: '', bracket: 0 },
		{ startIndex: 16, type: 'type.identifier.swift', bracket: 0 } /* 'UIWindow' */,
		{ startIndex: 24, type: 'keyword.operator.swift', bracket: 0 } /* '?' */
	]}],
	//Comment
	[{
		line: '    // Comment',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 4, type: 'comment.swift', bracket: 0 } /* '// Comment' */
	]}],
	//Block Comment with Embedded Comment followed by code
	[{
		line: '    /* Comment //Embedded */ var y = 0b10',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 4, type: 'comment.swift', bracket: 0 }, // /* '/* Comment //Embedded */' */,
		{ startIndex: 28, type: '', bracket: 0 },
		{ startIndex: 29, type: 'keyword.swift', bracket: 0 } /* 'var' */,
		{ startIndex: 32, type: '', bracket: 0 },
		{ startIndex: 33, type: 'identifier.swift', bracket: 0 }	/* 'y' */,
		{ startIndex: 34, type: '', bracket: 0 },
		{ startIndex: 35, type: 'keyword.operator.swift', bracket: 0 } /* '=' */,
		{ startIndex: 36, type: '', bracket: 0 },
		{ startIndex: 37, type: 'number.binary.swift', bracket: 0 } /* '0b10' */
	]}],
	// Method signature (broken on two lines)
	[{
		line: '    public func app(app: App, opts:',
		tokens:[
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 4, type: 'keyword.swift', bracket: 0 } /* 'public' */,
		{ startIndex: 10, type: '', bracket: 0 },
		{ startIndex: 11, type: 'keyword.swift', bracket: 0 } /* 'func' */,
		{ startIndex: 15, type: '', bracket: 0 },
		{ startIndex: 16, type: 'identifier.swift', bracket: 0 } /* 'app' */,
		{ startIndex: 19, type: 'delimiter.parenthesis.swift', bracket: 1 } /* '(' */,
		{ startIndex: 20, type: 'identifier.swift', bracket: 0 }/* 'app' */,
		{ startIndex: 23, type: 'keyword.operator.swift', bracket: 0 } /* ':' */,
		{ startIndex: 24, type: '', bracket: 0 },
		{ startIndex: 25, type: 'type.identifier.swift', bracket: 0 } /* 'App' */,
		{ startIndex: 28, type: 'keyword.operator.swift', bracket: 0 } /* ',' */,
		{ startIndex: 29, type: '', bracket: 0 },
		{ startIndex: 30, type: 'identifier.swift', bracket: 0 } /* 'opts' */,
		{ startIndex: 34, type: 'keyword.operator.swift', bracket: 0 } /* ':' */,
	]}],
	// Method signature Continued
	[{
		line: '        [NSObject: AnyObject]?) -> Bool {',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 8, type: 'delimiter.square.swift', bracket: 1 } /* '[' */,
		{ startIndex: 9, type: 'type.identifier.swift', bracket: 0 } /* 'NSObject' */,
		{ startIndex: 17, type: 'keyword.operator.swift', bracket: 0 } /* ':' */,
		{ startIndex: 18, type: '', bracket: 0 },
		{ startIndex: 19, type: 'type.identifier.swift', bracket: 0 } /* 'AnyObject' */,
		{ startIndex: 28, type: 'delimiter.square.swift', bracket: -1 } /* ']' */,
		{ startIndex: 29, type: 'keyword.operator.swift', bracket: 0 } /* '?' */,
		{ startIndex: 30, type: 'delimiter.parenthesis.swift', bracket: -1 } /* ')' */,
		{ startIndex: 31, type: '', bracket: 0 },
		{ startIndex: 32, type: 'keyword.operator.swift', bracket: 0 } /* '->' */,
		{ startIndex: 34, type: '', bracket: 0 },
		{ startIndex: 35, type: 'type.identifier.swift', bracket: 0 } /* 'Bool' */,
		{ startIndex: 39, type: '', bracket: 0 },
		{ startIndex: 40, type: 'delimiter.curly.swift', bracket: 1 } /* '{' */
	]}],
	// String with escapes
	[{
		line: '        var `String` = "String w/ \\"escape\\""',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 8, type: 'keyword.swift', bracket: 0 } /* 'var' */,
		{ startIndex: 11, type: '', bracket: 0 },
		{ startIndex: 12, type: 'keyword.operator.swift', bracket: 1 } /* '`' */,
		{ startIndex: 13, type: 'identifier.swift', bracket: 0 } /* 'String' */,
		{ startIndex: 19, type: 'keyword.operator.swift', bracket: -1 } /* '`' */,
		{ startIndex: 20, type: '', bracket: 0 },
		{ startIndex: 21, type: 'keyword.operator.swift', bracket: 0 } /* '=' */,
		{ startIndex: 22, type: '', bracket: 0 },
		{ startIndex: 23, type: 'string.quote.swift', bracket: 1 } /* '"' */,
		{ startIndex: 24, type: 'string.swift', bracket: 0 } /* 'String w/ \\"escape\\""' */,
		{ startIndex: 44, type: 'string.quote.swift', bracket: -1 } /* '"' */,
	]}],
	// String with interpolated expression
	[{
		line: '        let message = "\\(y) times 2.5 is \\(Double(25) * 2.5)"',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 8, type: 'keyword.swift', bracket: 0 } /* 'let' */,
		{ startIndex: 11, type: '', bracket: 0 },
		{ startIndex: 12, type: 'identifier.swift', bracket: 0 } /* 'message' */,
		{ startIndex: 19, type: '', bracket: 0 },
		{ startIndex: 20, type: 'keyword.operator.swift', bracket: 0 } /* '=' */,
		{ startIndex: 21, type: '', bracket: 0 },
		{ startIndex: 22, type: 'string.quote.swift', bracket: 1 } /* '"' */,
		{ startIndex: 23, type: 'keyword.operator.swift', bracket: 1 } /* '\(' */,
		{ startIndex: 25, type: 'identifier.swift', bracket: 0 },
		{ startIndex: 26, type: 'keyword.operator.swift', bracket: -1 } /* ')' */,
		{ startIndex: 27, type: 'string.swift', bracket: 0 } /* ' times 2.5 is ' */,
		{ startIndex: 41, type: 'keyword.operator.swift', bracket: 1 } /* '\(' */,
		{ startIndex: 43, type: 'type.identifier.swift', bracket: 0 } /* 'Double' */,
		{ startIndex: 49, type: 'keyword.operator.swift', bracket: 1 } /* '(' */,
		{ startIndex: 50, type: 'number.swift', bracket: 0 } /* '25' */,
		{ startIndex: 52, type: 'keyword.operator.swift', bracket: -1 } /* ')' */,
		{ startIndex: 53, type: '', bracket: 0 },
		{ startIndex: 54, type: 'keyword.operator.swift', bracket: 0 } /* '*' */,
		{ startIndex: 55, type: '', bracket: 0 },
		{ startIndex: 56, type: 'number.float.swift', bracket: 0 } /* '2.5' */,
		{ startIndex: 59, type: 'keyword.operator.swift', bracket: -1 } /* ')' */,
		{ startIndex: 60, type: 'string.quote.swift', bracket: -1 } /* '"' */
	]}],
	// Method invocation/property accessor.
	[{
		line: '        let view = self.window!.contr as! UIView',
		tokens: [
		{ startIndex: 0, type: '', bracket: 0 },
		{ startIndex: 8, type: 'keyword.swift', bracket: 0 } /* 'let' */,
		{ startIndex: 11, type: '', bracket: 0 },
		{ startIndex: 12, type: 'identifier.swift', bracket: 0 } /* 'view' */,
		{ startIndex: 16, type: '', bracket: 0 },
		{ startIndex: 17, type: 'keyword.operator.swift', bracket: 0 } /* '=' */,
		{ startIndex: 18, type: '', bracket: 0 },
		{ startIndex: 19, type: 'keyword.swift', bracket: 0 } /* 'self' */,
		{ startIndex: 23, type: 'delimeter.swift', bracket: 0 } /* '.' */,
		{ startIndex: 24, type: 'type.identifier.swift', bracket: 0 } /* 'window' */,
		{ startIndex: 30, type: 'keyword.operator.swift', bracket: 0 } /* '!' */,
		{ startIndex: 31, type: 'delimeter.swift', bracket: 0 } /* '.' */,
		{ startIndex: 32, type: 'type.identifier.swift', bracket: 0 } /* 'contr' */,
		{ startIndex: 37, type: '', bracket: 0 },
		{ startIndex: 38, type: 'keyword.swift', bracket: 0 } /* 'as' */,
		{ startIndex: 40, type: 'keyword.operator.swift', bracket: 0 } /* '!' */,
		{ startIndex: 41, type: '', bracket: 0 },
		{ startIndex: 42, type: 'type.identifier.swift', bracket: 0 } /* 'UIView' */
	]}]
]);

