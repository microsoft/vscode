/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {createOnEnterAsserter, executeMonarchTokenizationTests} from 'vs/editor/test/common/modesUtil';
import {ILanguage, IRichLanguageConfiguration} from '../types';

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
	suite(name, () => {
		test('Tokenization', () => {
			executeMonarchTokenizationTests(name, language, <any>tests);
		});
	});
}

export function testOnEnter(name:string, conf: IRichLanguageConfiguration, callback:(assertOnEnter: IOnEnterAsserter)=>void): void {
	suite(name, () => {
		test('onEnter', () => {
			callback(createOnEnterAsserter('test', conf));
		});
	});
}
