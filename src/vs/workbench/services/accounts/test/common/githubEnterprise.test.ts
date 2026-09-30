/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getGitHubEnterpriseUri } from '../../common/githubEnterprise.js';

suite('GitHub Enterprise session provenance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a missing issuer has no enterprise base', () => {
		assert.strictEqual(getGitHubEnterpriseUri(undefined), undefined);
	});

	test('derives enterprise cloud and server bases from the OAuth issuer', () => {
		assert.deepStrictEqual([
			'https://a.ghe.com/login/oauth',
			'https://b.ghe.com/login/oauth',
			'http://ghe.local:8080/Team/login/oauth',
			'HTTPS://GHE.LOCAL:443/Team/login/oauth',
			'https://ghe.local:443/team/login/oauth',
			'http://[::1]:8080/login/oauth',
		].map(value => getGitHubEnterpriseUri(URI.parse(value))?.toString()), [
			'https://a.ghe.com/',
			'https://b.ghe.com/',
			'http://ghe.local:8080/Team',
			'https://ghe.local:443/Team',
			'https://ghe.local:443/team',
			'http://[::1]:8080/',
		]);
	});

	test('preserves escaped base paths and explicit default ports', () => {
		assert.strictEqual(
			getGitHubEnterpriseUri(URI.parse('https://GHE.LOCAL:443/Team%20One%25/login/oauth'))?.toString(),
			'https://ghe.local:443/Team%20One%25',
		);
	});

	test('public GitHub issuers do not identify an enterprise base', () => {
		const issuers = [
			'https://github.com/login/oauth',
			'https://github.com.:443/login/oauth',
			'https://api.github.com/login/oauth',
			'https://www.github.com/login/oauth',
		];
		assert.deepStrictEqual(issuers.map(value => getGitHubEnterpriseUri(URI.parse(value))), issuers.map(() => undefined));
	});

	test('rejects invalid or non-OAuth provenance', () => {
		const issuers = [
			'https://ghe.local',
			'https://ghe.local/not-an-oauth-server',
			'ftp://ghe.local/login/oauth',
			'https://ghe.local:bad/login/oauth',
			'https://user@ghe.local/login/oauth',
			'https://ghe.local/base//login/oauth',
			'https://ghe.local/../base/login/oauth',
			'https://ghe.local/base/login/oauth?tenant=a',
			'https://ghe.local/base/login/oauth#fragment',
			'https://ghe.local/base/login/oauth//',
		];
		assert.deepStrictEqual(issuers.map(value => getGitHubEnterpriseUri(URI.parse(value))), issuers.map(() => undefined));
	});
});
