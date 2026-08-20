/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { matchesBrowserViewGroupFilter } from '../../common/browserViewGroup.js';

suite('BrowserViewGroup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches browser IDs and audiences', () => {
		const sessionAudience = [{ type: 'agent', sessionId: 'session' }] as const;
		const allAgentsAudience = [{ type: 'agent' }] as const;

		assert.deepStrictEqual({
			browserId: matchesBrowserViewGroupFilter('browser', sessionAudience, { browserIds: ['browser', 'other'] }),
			otherBrowserId: matchesBrowserViewGroupFilter('browser', sessionAudience, { browserIds: ['other'] }),
			sessionAudience: matchesBrowserViewGroupFilter('browser', sessionAudience, { audience: { type: 'agent', sessionId: 'session' } }),
			otherSessionAudience: matchesBrowserViewGroupFilter('browser', sessionAudience, { audience: { type: 'agent', sessionId: 'other' } }),
			allAgentsAudience: matchesBrowserViewGroupFilter('browser', allAgentsAudience, { audience: { type: 'agent', sessionId: 'session' } }),
			either: matchesBrowserViewGroupFilter('browser', sessionAudience, {
				browserIds: ['browser'],
				audience: { type: 'agent', sessionId: 'other' }
			}),
		}, {
			browserId: true,
			otherBrowserId: false,
			sessionAudience: true,
			otherSessionAudience: false,
			allAgentsAudience: true,
			either: true,
		});
	});
});
