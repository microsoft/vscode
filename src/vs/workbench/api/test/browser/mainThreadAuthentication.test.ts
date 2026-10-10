/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AuthenticationSession } from '../../../services/authentication/common/authentication.js';
import { Dto } from '../../../services/extensions/common/proxyIdentifier.js';
import { reviveAuthenticationSession } from '../../browser/mainThreadAuthentication.js';

suite('MainThreadAuthentication', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const iconComponents: UriComponents = { scheme: 'https', authority: 'example.com', path: '/avatar.png', query: '', fragment: '' };

	test('revives session URIs and preserves optional session fields', () => {
		const authorizationServer = URI.parse('https://enterprise.example.com/login/oauth');
		const withIcon: Dto<AuthenticationSession> = {
			id: 'session-with-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-with-icon', label: 'Has Icon', icon: iconComponents },
			authorizationServer: authorizationServer.toJSON(),
			idToken: 'id-token',
			expiresAfter: 3600
		};
		const withoutIcon: Dto<AuthenticationSession> = {
			id: 'session-without-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-without-icon', label: 'No Icon' }
		};

		assert.deepStrictEqual(
			[reviveAuthenticationSession(withIcon), reviveAuthenticationSession(withoutIcon)],
			[
				{ ...withIcon, account: { ...withIcon.account, icon: URI.from(iconComponents) }, authorizationServer },
				{ ...withoutIcon, account: { ...withoutIcon.account, icon: undefined }, authorizationServer: undefined }
			]
		);
	});
});
