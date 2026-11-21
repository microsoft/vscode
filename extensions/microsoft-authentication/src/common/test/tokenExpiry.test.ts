/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ACCESS_TOKEN_RENEWAL_WINDOW_MS, isAccessTokenNearExpiry } from '../tokenExpiry';

suite('isAccessTokenNearExpiry', () => {
	test('refreshes tokens inside the renewal window and leaves unknown expiry to MSAL', () => {
		const now = 1_000_000_000;
		const at = (offset: number) => isAccessTokenNearExpiry(new Date(now + offset), now);

		assert.deepStrictEqual({
			expired: at(-1),
			atExpiry: at(0),
			insideWindow: at(ACCESS_TOKEN_RENEWAL_WINDOW_MS - 1),
			atWindowBoundary: at(ACCESS_TOKEN_RENEWAL_WINDOW_MS),
			outsideWindow: at(ACCESS_TOKEN_RENEWAL_WINDOW_MS + 1),
			unknown: isAccessTokenNearExpiry(null, now),
		}, {
			expired: true,
			atExpiry: true,
			insideWindow: true,
			atWindowBoundary: true,
			outsideWindow: false,
			unknown: false,
		});
	});
});
