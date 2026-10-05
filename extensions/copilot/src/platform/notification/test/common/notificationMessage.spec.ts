/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { getSafeNotificationMessage } from '../../common/notificationMessage';

suite('Notification security', () => {
	test('selects the exact fallback for link syntax or command schemes and preserves other text', () => {
		const fallback = 'Unable to complete the operation.';
		const ordinary = ['', ' ordinary [file].ts ', 'https://example.com', 'command.ts', 'a] (b'];
		const suspicious = [
			'[Open](command:test.noop)',
			'[Help](https://example.com)',
			'\\[Open\\](CoMmAnD:test.noop)',
			'broken](',
			'command:',
			'prefix COMMAND:test.noop suffix',
		];
		expect([...ordinary, ...suspicious].map(message => getSafeNotificationMessage(message, fallback)))
			.toEqual([...ordinary, ...suspicious.map(() => fallback)]);
	});
});
