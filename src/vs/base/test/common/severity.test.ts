/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import Severity from '../../common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Severity', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fromValue', () => {
		assert.strictEqual(Severity.fromValue('error'), Severity.Error);
		assert.strictEqual(Severity.fromValue('Error'), Severity.Error);
		assert.strictEqual(Severity.fromValue('ERROR'), Severity.Error);

		assert.strictEqual(Severity.fromValue('warning'), Severity.Warning);
		assert.strictEqual(Severity.fromValue('Warning'), Severity.Warning);
		assert.strictEqual(Severity.fromValue('WARNING'), Severity.Warning);
		assert.strictEqual(Severity.fromValue('warn'), Severity.Warning);
		assert.strictEqual(Severity.fromValue('Warn'), Severity.Warning);
		assert.strictEqual(Severity.fromValue('WARN'), Severity.Warning);

		assert.strictEqual(Severity.fromValue('info'), Severity.Info);
		assert.strictEqual(Severity.fromValue('Info'), Severity.Info);
		assert.strictEqual(Severity.fromValue('INFO'), Severity.Info);

		assert.strictEqual(Severity.fromValue('ignore'), Severity.Ignore);
		assert.strictEqual(Severity.fromValue('Ignore'), Severity.Ignore);
		assert.strictEqual(Severity.fromValue('IGNORE'), Severity.Ignore);

		assert.strictEqual(Severity.fromValue(''), Severity.Ignore);
		assert.strictEqual(Severity.fromValue('random'), Severity.Ignore);
		assert.strictEqual(Severity.fromValue(undefined as any), Severity.Ignore);
		assert.strictEqual(Severity.fromValue(null as any), Severity.Ignore);
	});

	test('toString', () => {
		assert.strictEqual(Severity.toString(Severity.Error), 'error');
		assert.strictEqual(Severity.toString(Severity.Warning), 'warning');
		assert.strictEqual(Severity.toString(Severity.Info), 'info');
		assert.strictEqual(Severity.toString(Severity.Ignore), 'ignore');
	});
});
