/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';

suite('Windows Native Helpers', () => {
	test('windows-mutex', async () => {
		if (!isWindows) {
			return;
		}

		const mutex = await import('windows-mutex');
		assert.ok(mutex, 'Unable to load windows-mutex dependency.');
		assert.ok(typeof mutex.isActive === 'function', 'Unable to load windows-mutex dependency.');
	});

	test('windows-foreground-love', async () => {
		if (!isWindows) {
			return;
		}

		const foregroundLove = await import('windows-foreground-love');
		assert.ok(foregroundLove, 'Unable to load windows-foreground-love dependency.');
	});
});