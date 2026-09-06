/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { errorResult, invokeFunctionResultToToolResult } from '../../../electron-browser/tools/browserToolHelpers.js';

suite('browserToolHelpers - failure reporting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a failed invocation reports the failure and names it in the completed state', () => {
		const result = invokeFunctionResultToToolResult({ error: 'No browser page found', summary: 'Screenshot failed' });

		assert.strictEqual(result.toolResultError, 'No browser page found');
		assert.ok(result.toolResultMessage, 'a failed call must not reuse the present-tense invocation message');
	});

	test('an empty error message still reports a failure', () => {
		// `throw ''` and `new Error()` both produce one, and a falsy check would
		// report the call as successful.
		const result = invokeFunctionResultToToolResult({ error: '', summary: 'Screenshot failed' });

		assert.ok(result.toolResultError, 'an empty error message is still a failure');
		assert.ok(result.toolResultMessage);
	});

	test('a successful invocation reports neither', () => {
		const result = invokeFunctionResultToToolResult({ result: 'ok', summary: 'Captured screenshot' });

		assert.strictEqual(result.toolResultError, undefined);
		assert.strictEqual(result.toolResultMessage, undefined);
	});

	test('errorResult reports the failure and names it', () => {
		const result = errorResult('No page ID provided.');

		assert.strictEqual(result.toolResultError, 'No page ID provided.');
		assert.ok(result.toolResultMessage);
	});
});
