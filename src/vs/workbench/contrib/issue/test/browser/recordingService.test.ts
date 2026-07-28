/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldShowScreenCapturePermissionSettings } from '../../browser/recordingService.js';

suite('Issue Reporter Recording Service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('defers to the native prompt after the first failed request', () => {
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('denied', false), false);
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('not-determined', false), false);
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('unknown', false), false);
	});

	test('shows settings guidance after a repeated failed request', () => {
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('denied', true), true);
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('not-determined', true), true);
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('unknown', true), true);
	});

	test('shows settings guidance immediately for restricted access', () => {
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('restricted', false), true);
	});

	test('does not show settings guidance when access is granted', () => {
		assert.strictEqual(shouldShowScreenCapturePermissionSettings('granted', true), false);
	});
});
