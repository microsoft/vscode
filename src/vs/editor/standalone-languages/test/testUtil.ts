/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import types = require('../types');
import assert = require('assert');
import modesUtil = require('vs/editor/test/common/modesUtil');
import monarchCompile = require('vs/editor/common/modes/monarch/monarchCompile');
import MonarchDefinition = require('vs/editor/common/modes/monarch/monarchDefinition');
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';

export enum Bracket {
	None = 0,
	Open = 1,
	Close = -1
}

export interface IRelaxedToken {
	startIndex: number;
	type: string;
	bracket?: Bracket;
}
export interface ITestItem {
	line: string;
	tokens: IRelaxedToken[];
}

export interface IOnEnterAsserter {
	nothing(oneLineAboveText:string, beforeText:string, afterText:string): void;
	indents(oneLineAboveText:string, beforeText:string, afterText:string): void;
	outdents(oneLineAboveText:string, beforeText:string, afterText:string): void;
	indentsOutdents(oneLineAboveText:string, beforeText:string, afterText:string): void;
}

export function testTokenization(name:string, language: types.ILanguage, tests:ITestItem[][]): void {
	suite(language.displayName || name, () => {
		test('Tokenization', () => {
			modesUtil.executeMonarchTokenizationTests(name, language, <any>tests);
		});
	});
}

export function testOnEnter(name:string, language: types.ILanguage, callback:(assertOnEnter: IOnEnterAsserter)=>void): void {
	suite(language.displayName || name, () => {
		test('onEnter', () => {
			var lexer = monarchCompile.compile(language);
			var onEnterSupport = new OnEnterSupport('test', MonarchDefinition.createOnEnterSupportOptions(lexer));
			callback(modesUtil.createOnEnterAsserter('test', onEnterSupport));
		});
	});
}