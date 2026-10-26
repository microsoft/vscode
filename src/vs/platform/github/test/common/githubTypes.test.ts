/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubAuthorizationContext, isEqualAuthorization } from '../../common/githubTypes.js';

suite('GitHub authorization equality', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const authorization: GitHubAuthorizationContext = {
		providerId: 'github', sessionId: 'session', accountId: 'account',
		authorizationServer: 'https://github.com', scopes: ['read:user', 'repo'],
	};

	test('ignores scope order without mutating either grant', () => {
		const first = { ...authorization, scopes: Object.freeze(['repo', 'read:user']) };
		const second = { ...authorization, scopes: Object.freeze(['read:user', 'repo']) };
		assert.deepStrictEqual({
			same: isEqualAuthorization(first, first),
			equal: isEqualAuthorization(first, second),
			reversed: isEqualAuthorization(second, first),
			firstScopes: first.scopes,
			secondScopes: second.scopes,
		}, {
			same: true, equal: true, reversed: true,
			firstScopes: ['repo', 'read:user'], secondScopes: ['read:user', 'repo'],
		});
	});

	test('compares every grant identity field and the complete scope list', () => {
		const changes: Partial<GitHubAuthorizationContext>[] = [
			{ providerId: 'github-enterprise' },
			{ sessionId: 'other-session' },
			{ accountId: 'other-account' },
			{ accountId: undefined },
			{ authorizationServer: 'https://enterprise.test' },
			{ authorizationServer: undefined },
			{ scopes: ['read:user'] },
			{ scopes: ['read:user', 'repo', 'user:email'] },
			{ scopes: ['read:user', 'workflow'] },
		];
		assert.deepStrictEqual(changes.map(change => {
			const other = { ...authorization, ...change };
			return [isEqualAuthorization(authorization, other), isEqualAuthorization(other, authorization)];
		}), changes.map(() => [false, false]));
	});

	test('allows both grants to omit account and issuer provenance', () => {
		const first: GitHubAuthorizationContext = { providerId: 'github', sessionId: 'session', scopes: [] };
		const second = { ...first, accountId: undefined, authorizationServer: undefined, scopes: [] };
		assert.strictEqual(isEqualAuthorization(first, second), true);
	});
});
