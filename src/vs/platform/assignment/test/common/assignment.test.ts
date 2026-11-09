/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isInternalAccount } from '../../common/assignment.js';

suite('Assignment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('an account is internal when it is staff or belongs to an internal organisation', () => {
		assert.deepStrictEqual({
			unknown: isInternalAccount(undefined, undefined),
			external: isInternalAccount(false, ['contoso']),
			staffOnly: isInternalAccount(true, ['contoso']),
			orgOnly: isInternalAccount(false, ['microsoft']),
			vscodeOrg: isInternalAccount(undefined, ['Visual-Studio-Code']),
			githubOrg: isInternalAccount(undefined, ['github']),
			copilotOrg: isInternalAccount(undefined, ['ms-copilot']),
		}, {
			unknown: false,
			external: false,
			staffOnly: true,
			orgOnly: true,
			vscodeOrg: true,
			githubOrg: true,
			copilotOrg: true,
		});
	});
});
