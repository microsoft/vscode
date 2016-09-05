/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import * as modes from 'vs/editor/common/modes';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';
import {RichEditSupport, LanguageConfiguration} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {Token} from 'vs/editor/common/core/token';

export interface ITestToken {
	startIndex: number;
	type: string;
}

export interface ITestItem {
	line: string;
	tokens: ITestToken[];
}

export function assertWords(actual:string[], expected:string[], message?:string): void {
	assert.deepEqual(actual, expected, message);
}

export function assertTokenization(tokenizationSupport: modes.ITokenizationSupport, tests: ITestItem[]): void {
	var state = tokenizationSupport.getInitialState();
	for (var i = 0, len = tests.length; i < len; i++) {
		assert.ok(true, tests[i].line);
		var result = tokenizationSupport.tokenize(tests[i].line, state);
		if (tests[i].tokens) {
			assert.deepEqual(result.tokens, tests[i].tokens, JSON.stringify(result.tokens, null, '\t'));
		}

		state = result.endState;
	}
}

export interface IOnEnterAsserter {
	nothing(oneLineAboveText:string, beforeText:string, afterText:string): void;
	indents(oneLineAboveText:string, beforeText:string, afterText:string): void;
	outdents(oneLineAboveText:string, beforeText:string, afterText:string): void;
	indentsOutdents(oneLineAboveText:string, beforeText:string, afterText:string): void;
}

export function createOnEnterAsserter(modeId:string, conf: LanguageConfiguration): IOnEnterAsserter {
	var assertOne = (oneLineAboveText:string, beforeText:string, afterText:string, expected: modes.IndentAction) => {
		var model = Model.createFromString(
			[ oneLineAboveText, beforeText + afterText ].join('\n'),
			undefined,
			new MockMode(modeId)
		);
		var richEditSupport = new RichEditSupport(modeId, null, conf);
		var actual = richEditSupport.onEnter.onEnter(model, { lineNumber: 2, column: beforeText.length + 1 });
		if (expected === modes.IndentAction.None) {
			assert.equal(actual, null, oneLineAboveText + '\\n' + beforeText + '|' + afterText);
		} else {
			assert.equal(actual.indentAction, expected, oneLineAboveText + '\\n' + beforeText + '|' + afterText);
		}
		model.dispose();
	};
	return {
		nothing: (oneLineAboveText:string, beforeText:string, afterText:string): void => {
			assertOne(oneLineAboveText, beforeText, afterText, modes.IndentAction.None);
		},
		indents: (oneLineAboveText:string, beforeText:string, afterText:string): void => {
			assertOne(oneLineAboveText, beforeText, afterText, modes.IndentAction.Indent);
		},
		outdents: (oneLineAboveText:string, beforeText:string, afterText:string): void => {
			assertOne(oneLineAboveText, beforeText, afterText, modes.IndentAction.Outdent);
		},
		indentsOutdents: (oneLineAboveText:string, beforeText:string, afterText:string): void => {
			assertOne(oneLineAboveText, beforeText, afterText, modes.IndentAction.IndentOutdent);
		}
	};
}

export function executeTests(tokenizationSupport: modes.ITokenizationSupport, tests:ITestItem[][]): void {
	for (var i = 0, len = tests.length; i < len; i++) {
		assert.ok(true, 'TEST #' + i);
		executeTest(tokenizationSupport, tests[i]);
	}
}

function executeTest(tokenizationSupport: modes.ITokenizationSupport, tests:ITestItem[]): void {
	var state = tokenizationSupport.getInitialState();
	for (var i = 0, len = tests.length; i < len; i++) {
		assert.ok(true, tests[i].line);

		var result = tokenizationSupport.tokenize(tests[i].line, state);

		if (tests[i].tokens) {
			assertTokens(result.tokens, tests[i].tokens, 'Tokenizing line ' + tests[i].line);
		}

		state = result.endState;
	}
}

function assertTokens(actual:Token[], expected:ITestToken[], message?:string): void {
	assert.deepEqual(actual, expected, message + ': ' + JSON.stringify(actual, null, '\t'));
}
