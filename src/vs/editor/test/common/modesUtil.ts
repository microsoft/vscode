/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as modes from 'vs/editor/common/modes';

export interface ITestToken {
	startIndex: number;
	type: string;
}

export interface ITestItem {
	line: string;
	tokens: ITestToken[];
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
