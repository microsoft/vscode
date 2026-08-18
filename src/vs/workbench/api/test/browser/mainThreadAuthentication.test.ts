/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AuthenticationSession } from '../../../services/authentication/common/authentication.js';
import { Dto } from '../../../services/extensions/common/proxyIdentifier.js';
import { reviveSessionAccountIcon } from '../../browser/mainThreadAuthentication.js';

suite('MainThreadAuthentication', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const iconComponents: UriComponents = { scheme: 'https', authority: 'example.com', path: '/avatar.png', query: '', fragment: '' };

	test('reviveSessionAccountIcon revives a session\'s account icon into a URI and leaves a missing icon undefined', () => {
		const withIcon: Dto<AuthenticationSession> = {
			id: 'session-with-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-with-icon', label: 'Has Icon', icon: iconComponents }
		};
		const withoutIcon: Dto<AuthenticationSession> = {
			id: 'session-without-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-without-icon', label: 'No Icon' }
		};

		assert.deepStrictEqual(
			[reviveSessionAccountIcon(withIcon), reviveSessionAccountIcon(withoutIcon)],
			[
				{ ...withIcon, account: { ...withIcon.account, icon: URI.from(iconComponents) } },
				{ ...withoutIcon, account: { ...withoutIcon.account, icon: undefined } }
			]
		);
	});
});
