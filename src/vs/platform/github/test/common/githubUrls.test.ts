/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getPullRequestUrlKey, parseGitHubCommitTarget, parseGitHubIssueUrl, parseGitHubLinkTarget, parseGitHubPullRequestUrl, parsePullRequestUrl } from '../../common/githubUrls.js';

suite('GitHub URL parsers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pull request keys preserve the host and number while normalizing case and trailing slashes', () => {
		assert.deepStrictEqual([
			' HTTPS://GITHUB.COM/Owner/Repo/PULL/42/// ',
			'https://tenant.ghe.com/Owner/Repo/pull/42/',
			'https://github.com/Owner/Repo/pull/43',
		].map(getPullRequestUrlKey), [
			'https://github.com/owner/repo/pull/42',
			'https://tenant.ghe.com/owner/repo/pull/42',
			'https://github.com/owner/repo/pull/43',
		]);
	});

	test('issue URLs allow public host variants and trailing paths, queries and fragments', () => {
		const urls = [
			'https://github.com/Owner/Repo/issues/42',
			'http://www.github.com/Owner/Repo/issues/42',
			'HTTPS://GITHUB.COM/Owner/Repo/ISSUES/42',
			'https://github.com/Owner/Repo/issues/42/',
			'https://github.com/Owner/Repo/issues/42/comments',
			'https://github.com/Owner/Repo/issues/42?tab=comments#issuecomment-1',
		];
		assert.deepStrictEqual(urls.map(parseGitHubIssueUrl), urls.map(() => ({ owner: 'Owner', repo: 'Repo', number: 42 })));
	});

	test('issue URLs require a positive safe number and a public GitHub host', () => {
		const urls = [
			'',
			'Owner/Repo#42',
			'https://github.com/Owner/Repo/pull/42',
			'https://github.com/Owner/Repo/issues/0',
			'https://github.com/Owner/Repo/issues/9007199254740992',
			'https://github.com/Owner/Repo/issues/42text',
			'https://github.com/Owner/Repo/issues/',
			'https://tenant.ghe.com/Owner/Repo/issues/42',
			'https://api.github.com/Owner/Repo/issues/42',
			'https://github.com.example/Owner/Repo/issues/42',
			'ftp://github.com/Owner/Repo/issues/42',
		];
		assert.deepStrictEqual(urls.map(parseGitHubIssueUrl), urls.map(() => undefined));
	});

	test('canonical pull request URLs preserve coordinates and an optional trailing slash', () => {
		assert.deepStrictEqual([
			parseGitHubPullRequestUrl('https://github.com/Owner/Repo/pull/42'),
			parseGitHubPullRequestUrl('https://github.com/Owner/Repo/pull/0042/'),
			parseGitHubPullRequestUrl('https://github.com/Owner/Repo/pull/0'),
		], [
			{ owner: 'Owner', repo: 'Repo', number: 42 },
			{ owner: 'Owner', repo: 'Repo', number: 42 },
			{ owner: 'Owner', repo: 'Repo', number: 0 },
		]);
	});

	test('canonical pull request URLs reject host variants and noncanonical suffixes', () => {
		const urls = [
			'',
			'Owner/Repo#42',
			'http://github.com/Owner/Repo/pull/42',
			'https://GITHUB.COM/Owner/Repo/pull/42',
			'https://www.github.com/Owner/Repo/pull/42',
			'https://tenant.ghe.com/Owner/Repo/pull/42',
			'https://github.com/Owner/Repo/issues/42',
			'https://github.com/Owner/Repo/pull/42?tab=files',
			'https://github.com/Owner/Repo/pull/42#discussion_r1',
			'https://github.com/Owner/Repo/pull/42/files',
			'https://github.com/Owner/Repo/pull/42//',
			'https://github.com/Owner/Repo/pull/-1',
		];
		assert.deepStrictEqual(urls.map(parseGitHubPullRequestUrl), urls.map(() => undefined));
	});

	test('resolves the API host a credential must match for every GitHub deployment', () => {
		assert.deepStrictEqual({
			dotCom: parsePullRequestUrl('https://github.com/octo/repo/pull/1')?.apiHost,
			www: parsePullRequestUrl('https://www.github.com/octo/repo/pull/1')?.apiHost,
			enterpriseCloud: parsePullRequestUrl('https://tenant.ghe.com/octo/repo/pull/1')?.apiHost,
			enterpriseServer: parsePullRequestUrl('https://ghe.corp.example/octo/repo/pull/1')?.apiHost,
			parsed: parsePullRequestUrl('https://tenant.ghe.com/octo/repo/pull/42'),
			notAPullRequest: parsePullRequestUrl('https://github.com/octo/repo/issues/1'),
			notAUrl: parsePullRequestUrl('octo/repo#1'),
		}, {
			dotCom: 'api.github.com',
			www: 'api.github.com',
			enterpriseCloud: 'api.tenant.ghe.com',
			enterpriseServer: 'ghe.corp.example',
			parsed: { owner: 'octo', repo: 'repo', number: 42, apiHost: 'api.tenant.ghe.com' },
			notAPullRequest: undefined,
			notAUrl: undefined,
		});
	});

	test('API-host pull request parsing preserves ports and accepts queries and fragments', () => {
		assert.deepStrictEqual(parsePullRequestUrl('http://GHE.LOCAL:8080/Owner/Repo/pull/0042/?tab=files#discussion_r1'), {
			owner: 'Owner',
			repo: 'Repo',
			number: 42,
			apiHost: 'ghe.local:8080',
		});
	});

	test('API-host pull request parsing requires a positive safe number and a complete path', () => {
		const urls = [
			'not a URL',
			'https://github.com/Owner/Repo/pull/0',
			'https://github.com/Owner/Repo/pull/9007199254740992',
			'https://github.com/Owner/Repo/pull/1e2',
			'https://github.com/Owner/Repo/pull/42/files',
			'https://github.com/Owner/Repo/pull/42//',
			'https://github.com/Owner/Repo/issues/42',
		];
		assert.deepStrictEqual(urls.map(parsePullRequestUrl), urls.map(() => undefined));
	});

	test('commit targets preserve the original URI and allow commit subpaths', () => {
		const resources = [
			URI.parse('https://github.com/Owner/Repo/commit/abc123'),
			URI.parse('https://GITHUB.COM/Owner/Repo/commit/abc123/files?view=split#diff-1'),
			URI.parse('http://github.com/Owner/Repo/commit/abc123/'),
		];
		assert.deepStrictEqual(resources.map(resource => {
			const target = parseGitHubCommitTarget(resource);
			return { ...target, sameResource: target?.resource === resource };
		}), resources.map(resource => ({ owner: 'Owner', repo: 'Repo', sha: 'abc123', resource, sameResource: true })));
	});

	test('commit targets do not require hexadecimal SHAs or an HTTPS scheme', () => {
		const resource = URI.parse('ssh://github.com/Owner/Repo/commit/ref-name');
		assert.deepStrictEqual(parseGitHubCommitTarget(resource), { owner: 'Owner', repo: 'Repo', sha: 'ref-name', resource });
	});

	test('commit targets require the exact public authority and a commit path', () => {
		const resources = [
			'https://www.github.com/Owner/Repo/commit/abc123',
			'https://github.com:443/Owner/Repo/commit/abc123',
			'https://tenant.ghe.com/Owner/Repo/commit/abc123',
			'https://github.com/Owner/Repo/commit/',
			'https://github.com/Owner/Repo/pull/42',
		].map(value => URI.parse(value));
		assert.deepStrictEqual(resources.map(parseGitHubCommitTarget), resources.map(() => undefined));
	});

	test('link targets parse resource kinds without imposing a host allowlist', () => {
		assert.deepStrictEqual([
			parseGitHubLinkTarget(URI.parse('https://github.com/Owner/Repo')),
			parseGitHubLinkTarget(URI.parse('https://ghe.local/Owner/Repo/')),
			parseGitHubLinkTarget(URI.parse('https://ghe.local/Owner/Repo/issues/42?tab=comments#issuecomment-1')),
			parseGitHubLinkTarget(URI.parse('https://ghe.local/Owner/Repo/pull/42/')),
		], [
			{ kind: 'repository', owner: 'Owner', repo: 'Repo' },
			{ kind: 'repository', owner: 'Owner', repo: 'Repo' },
			{ kind: 'issue', owner: 'Owner', repo: 'Repo', number: 42 },
			{ kind: 'pullRequest', owner: 'Owner', repo: 'Repo', number: 42 },
		]);
	});

	test('link targets preserve empty-segment filtering and numeric coercion', () => {
		assert.deepStrictEqual([
			parseGitHubLinkTarget(URI.parse('https://github.com//Owner//Repo//pull//0042//')),
			parseGitHubLinkTarget(URI.parse('https://github.com/Owner/Repo/pull/1e2')),
		], [
			{ kind: 'pullRequest', owner: 'Owner', repo: 'Repo', number: 42 },
			{ kind: 'pullRequest', owner: 'Owner', repo: 'Repo', number: 100 },
		]);
	});

	test('link targets require HTTPS and a supported path with a positive safe number', () => {
		const resources = [
			'http://github.com/Owner/Repo',
			'https://github.com/Owner',
			'https://github.com/Owner/Repo/commit/abc123',
			'https://github.com/Owner/Repo/issues/0',
			'https://github.com/Owner/Repo/issues/-1',
			'https://github.com/Owner/Repo/issues/1.5',
			'https://github.com/Owner/Repo/issues/9007199254740992',
			'https://github.com/Owner/Repo/pull/42/files',
		].map(value => URI.parse(value));
		assert.deepStrictEqual(resources.map(parseGitHubLinkTarget), resources.map(() => undefined));
	});
});
