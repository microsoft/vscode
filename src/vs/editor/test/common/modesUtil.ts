/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {TPromise} from 'vs/base/common/winjs.base';
import servicesUtil = require('vs/editor/test/common/servicesTestUtils');
import modes = require('vs/editor/common/modes');
import monarchTypes = require('vs/editor/common/modes/monarch/monarchTypes');
import monarchCompile = require('vs/editor/common/modes/monarch/monarchCompile');
import monarchLexer = require('vs/editor/common/modes/monarch/monarchLexer');
import {createLineContext} from 'vs/editor/test/common/modesTestUtils';
import {Model} from 'vs/editor/common/model/model';

export interface IRelaxedToken {
	startIndex:number;
	type:string;
	bracket?:modes.Bracket;
}

export interface ITestItem {
	line: string;
	tokens: IRelaxedToken[];
}


export interface IOnEnterFunc {
	(line:string, offset:number, state?:modes.IState): modes.IEnterAction;
}

export interface IOnElectricCharacterFunc {
	(line:string, offset:number, state?:modes.IState): modes.IElectricAction;
}

export function createOnElectricCharacter(mode:modes.IMode): IOnElectricCharacterFunc {
	return function onElectricCharacter(line:string, offset:number, state?:modes.IState): modes.IElectricAction {
		state = state || mode.tokenizationSupport.getInitialState();
		var lineTokens = mode.tokenizationSupport.tokenize(line, state);
		return mode.electricCharacterSupport.onElectricCharacter(createLineContext(line, lineTokens), offset);
	};
}

export function assertWords(actual:string[], expected:string[], message?:string): void {
	assert.deepEqual(actual, expected, message);
}

export function createOnEnter(mode:modes.IMode): IOnEnterFunc {
	return function onEnter(line:string, offset:number, state?:modes.IState): modes.IEnterAction {
		state = state || mode.tokenizationSupport.getInitialState();
		var lineTokens = mode.tokenizationSupport.tokenize(line, state);
		return mode.electricCharacterSupport.onEnter(createLineContext(line, lineTokens), offset);
	};
}

export function load(modeId: string, preloadModes: string[] = [] ): TPromise<modes.IMode> {
	var toLoad:string[] = [].concat(preloadModes).concat([modeId]);

	var modeService = servicesUtil.createMockModeService();

	var promises = toLoad.map(modeId => modeService.getOrCreateMode(modeId));

	return TPromise.join(promises).then(modes => {
		return modes[modes.length -1];
	});
}

export function assertTokenization(tokenizationSupport: modes.ITokenizationSupport, tests: ITestItem[]): void {
	var state = tokenizationSupport.getInitialState();
	for (var i = 0, len = tests.length; i < len; i++) {
		assert.ok(true, tests[i].line);
		var result = tokenizationSupport.tokenize(tests[i].line, state);
		if (tests[i].tokens) {
			assert.deepEqual(generateRelaxedTokens(result.tokens, tests[i].tokens), tests[i].tokens, JSON.stringify(result.tokens, null, '\t'));
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

class SimpleMode implements modes.IMode {

	private _id:string;

	constructor(id:string) {
		this._id = id;
	}

	public getId(): string {
		return this._id;
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}

export function createOnEnterAsserter(modeId:string, onEnterSupport: modes.IOnEnterSupport): IOnEnterAsserter {
	var assertOne = (oneLineAboveText:string, beforeText:string, afterText:string, expected: modes.IndentAction) => {
		var model = new Model(
			[ oneLineAboveText, beforeText + afterText ].join('\n'),
			new SimpleMode(modeId)
		);
		var actual = onEnterSupport.onEnter(model, { lineNumber: 2, column: beforeText.length + 1 });
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


export function executeMonarchTokenizationTests(name:string, language:monarchTypes.ILanguage, tests:ITestItem[][]): void {
	var lexer = monarchCompile.compile(language);

	var modeService = servicesUtil.createMockModeService();

	var tokenizationSupport = monarchLexer.createTokenizationSupport(modeService, new SimpleMode('mock.mode'), lexer);

	executeTests(tokenizationSupport, tests);
}

function generateRelaxedTokens(actualTokens: modes.IToken[], expectedTokens: IRelaxedToken[]): IRelaxedToken[] {
	var r = actualTokens.map((token, index) => {
		// Remove bracket if it's missing in expectedTokens too
		if (expectedTokens[index] && typeof expectedTokens[index].bracket !== 'undefined') {
			return {
				startIndex: token.startIndex,
				type: token.type,
				bracket: token.bracket
			};
		} else {
			return {
				startIndex: token.startIndex,
				type: token.type
			};
		}
	});

	return r;
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

function assertTokens(actual:modes.IToken[], expected:IRelaxedToken[], message?:string): void {
	assert.deepEqual(generateRelaxedTokens(actual, expected), expected, message + ': ' + JSON.stringify(actual, null, '\t'));
}