/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ASSISTED_APPROVAL_DONT_SHOW_AGAIN_KEY, AUTO_APPROVE_DONT_SHOW_AGAIN_KEY, AUTOPILOT_DONT_SHOW_AGAIN_KEY } from '../../common/chatPermissionStorageKeys.js';
import { hasShownElevatedWarning, resetShownWarnings } from '../../common/chatPermissionWarnings.js';
import { ChatPermissionLevel } from '../../common/constants.js';

suite('chatPermissionWarnings', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function storage(dismissedKey?: string): InMemoryStorageService {
		const s = store.add(new InMemoryStorageService());
		if (dismissedKey) {
			s.store(dismissedKey, true, StorageScope.PROFILE, StorageTarget.USER);
		}
		return s;
	}

	setup(() => resetShownWarnings());
	teardown(() => resetShownWarnings());

	test('non-elevated Default is never considered "warned"', () => {
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.Default, storage()), false);
	});

	test('an unconfirmed elevated level has not been warned', () => {
		const s = storage();
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.AutoApprove, s), false);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.Assisted, s), false);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.Autopilot, s), false);
	});

	test('confirming Autopilot suppresses the equal-reach Bypass warning', () => {
		const s = storage(AUTOPILOT_DONT_SHOW_AGAIN_KEY);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.AutoApprove, s), true);
	});

	test('confirming Bypass suppresses the equal-reach Autopilot warning', () => {
		const s = storage(AUTO_APPROVE_DONT_SHOW_AGAIN_KEY);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.Autopilot, s), true);
	});

	test('confirming Allow All suppresses the lower-reach Assisted permissions (Preview) warning', () => {
		const s = storage(AUTO_APPROVE_DONT_SHOW_AGAIN_KEY);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.Assisted, s), true);
	});

	test('confirming Assisted permissions (Preview) does not suppress the Allow All warning', () => {
		const s = storage(ASSISTED_APPROVAL_DONT_SHOW_AGAIN_KEY);
		assert.strictEqual(hasShownElevatedWarning(ChatPermissionLevel.AutoApprove, s), false);
	});
});
