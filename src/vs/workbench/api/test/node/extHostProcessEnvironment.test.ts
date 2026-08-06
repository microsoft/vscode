/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFencedProcessEnvironment } from '../../node/extHostProcessEnvironment.js';

suite('ExtHostProcessEnvironment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const addedKey = 'VSCODE_TEST_FENCED_ENV_ADDED';
	const changedKey = 'VSCODE_TEST_FENCED_ENV_CHANGED';
	const deletedKey = 'VSCODE_TEST_FENCED_ENV_DELETED';

	setup(() => {
		delete process.env[addedKey];
		process.env[changedKey] = 'before';
		process.env[deletedKey] = 'before';
	});

	teardown(() => {
		delete process.env[addedKey];
		delete process.env[changedKey];
		delete process.env[deletedKey];
	});

	test('restores variables changed by a callback', () => {
		const result = runWithFencedProcessEnvironment(() => {
			process.env[addedKey] = 'inside';
			process.env[changedKey] = 'inside';
			delete process.env[deletedKey];
			return 'result';
		});

		assert.deepStrictEqual({
			result,
			added: process.env[addedKey],
			changed: process.env[changedKey],
			deleted: process.env[deletedKey]
		}, {
			result: 'result',
			added: undefined,
			changed: 'before',
			deleted: 'before'
		});
	});

	test('restores variables when a callback throws', () => {
		const error = new Error('expected');

		assert.throws(() => runWithFencedProcessEnvironment(() => {
			process.env[addedKey] = 'inside';
			throw error;
		}), candidate => candidate === error);
		assert.strictEqual(process.env[addedKey], undefined);
	});
});
