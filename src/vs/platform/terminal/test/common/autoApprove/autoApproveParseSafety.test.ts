/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldRequireConfirmationForAutoApproveParse } from '../../../common/autoApprove/autoApproveParseSafety.js';

suite('shouldRequireConfirmationForAutoApproveParse', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('requires confirmation for PowerShell parse errors', () => {
		assert.deepStrictEqual([
			shouldRequireConfirmationForAutoApproveParse('powershell', false),
			shouldRequireConfirmationForAutoApproveParse('powershell', true),
			shouldRequireConfirmationForAutoApproveParse('bash', false),
			shouldRequireConfirmationForAutoApproveParse('bash', true),
		], [
			false,
			true,
			false,
			false,
		]);
	});
});
