/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { toErrorMessage, isErrorWithActions, createErrorWithActions } from '../../common/errorMessage.js';
import { IAction } from '../../common/actions.js';

suite('ErrorMessage', () => {

	test('toErrorMessage - null/undefined', () => {
		assert.strictEqual(toErrorMessage(null), 'An unknown error occurred. Please consult the log for more details.');
		assert.strictEqual(toErrorMessage(undefined), 'An unknown error occurred. Please consult the log for more details.');
	});

	test('toErrorMessage - string', () => {
		assert.strictEqual(toErrorMessage('A simple error'), 'A simple error');
	});

	test('toErrorMessage - Error', () => {
		const err = new Error('A standard error');
		assert.strictEqual(toErrorMessage(err), 'A standard error');
	});

	test('toErrorMessage - array of strings', () => {
		assert.strictEqual(toErrorMessage(['Error 1', 'Error 2']), 'Error 1 (2 errors in total)');
		assert.strictEqual(toErrorMessage(['Error 1']), 'Error 1');
	});

	test('toErrorMessage - nested array/coalesce', () => {
		assert.strictEqual(toErrorMessage([null, 'Error 1', undefined, 'Error 2']), 'Error 1 (2 errors in total)');
	});

	test('toErrorMessage - verbose with stack', () => {
		const err = new Error('A standard error');
		err.stack = 'Stack trace details';
		const msg = toErrorMessage(err, true);
		assert.ok(msg.includes('A standard error: Stack trace details'));
	});

	test('toErrorMessage - detail.error', () => {
		const err = { detail: { error: new Error('Detailed error') } };
		assert.strictEqual(toErrorMessage(err), 'Detailed error');
	});

	test('toErrorMessage - detail.exception', () => {
		const err = { detail: { exception: new Error('Detailed exception') } };
		assert.strictEqual(toErrorMessage(err), 'Detailed exception');
	});

	test('toErrorMessage - custom node error', () => {
		const err = new Error('Host not allowed');
		(err as any).code = 'ERR_UNC_HOST_NOT_ALLOWED';
		assert.strictEqual(toErrorMessage(err), "Host not allowed. Please update the 'security.allowedUNCHosts' setting if you want to allow this host.");
	});

	test('toErrorMessage - system error', () => {
		const err = new Error('System error');
		(err as any).code = 'ENOENT';
		(err as any).errno = -2;
		(err as any).syscall = 'open';
		assert.strictEqual(toErrorMessage(err), 'A system error occurred (System error)');
	});

	test('isErrorWithActions', () => {
		assert.strictEqual(isErrorWithActions(null), false);
		assert.strictEqual(isErrorWithActions(new Error()), false);

		const action: IAction = { id: 'test', label: 'Test', tooltip: '', class: '', enabled: true, run: async () => {} };
		const err = createErrorWithActions('Error with actions', [action]);
		assert.strictEqual(isErrorWithActions(err), true);
		assert.strictEqual(err.message, 'Error with actions');
		assert.strictEqual(err.actions.length, 1);
		assert.strictEqual(err.actions[0], action);
	});
});
