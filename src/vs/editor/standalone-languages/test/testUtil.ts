/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {createRichEditSupport} from 'vs/editor/common/modes/monarch/monarchDefinition';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {createOnEnterAsserter, executeMonarchTokenizationTests} from 'vs/editor/test/common/modesUtil';
import {ILanguage} from '../types';

export interface IRelaxedToken {
	startIndex: number;
	type: string;
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

export function testTokenization(name:string, language: ILanguage, tests:ITestItem[][]): void {
	suite(language.displayName || name, () => {
		test('Tokenization', () => {
			executeMonarchTokenizationTests(name, language, <any>tests);
		});
	});
}

export function testOnEnter(name:string, language: ILanguage, callback:(assertOnEnter: IOnEnterAsserter)=>void): void {
	suite(language.displayName || name, () => {
		test('onEnter', () => {
			var lexer = compile(language);
			var richEditSupport = new RichEditSupport('test', null, createRichEditSupport(lexer));
			callback(createOnEnterAsserter('test', richEditSupport));
		});
	});
}
