/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { needsAccountIconLookup, serializeAccountIcon } from '../github';

suite('account avatar caching', () => {
	test('a pending session needs a lookup, and its serialized no-avatar result no longer needs one', () => {
		const pendingSession = {
			id: 'session1',
			account: { id: 'account1', label: 'Some One' },
			scopes: [],
			accessToken: 'token'
		};
		const noAvatarIcon = serializeAccountIcon(undefined, true);
		const cachedNoAvatarSession = {
			id: 'session1',
			account: { id: 'account1', label: 'Some One', icon: noAvatarIcon },
			scopes: [],
			accessToken: 'token'
		};

		assert.deepStrictEqual(
			[needsAccountIconLookup(pendingSession), noAvatarIcon, needsAccountIconLookup(cachedNoAvatarSession)],
			[true, null, false]
		);
	});

	test('a resolved avatar URI is serialized as-is and is never replaced by null', () => {
		const icon = vscode.Uri.parse('https://example.com/avatar.png');

		assert.deepStrictEqual(serializeAccountIcon(icon, true), {
			scheme: icon.scheme,
			authority: icon.authority,
			path: icon.path,
			query: icon.query,
			fragment: icon.fragment
		});
	});
});
