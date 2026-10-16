/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentHeadBranchPullRequest, withAgentSessionGitHubReferences } from '../../common/meta/agentSessionGitHubReferences.js';
import { SESSION_META_GITHUB_DATA_KEY, withSessionGitHubState, withSessionGitState, type SessionMeta } from '../../common/state/sessionState.js';

suite('Agent session GitHub references', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const url = 'https://github.com/owner/repo/pull/42';
	const reference = { referenceType: 'pr', repository: 'owner/repo', number: 42, title: 'A pull request', url, relations: ['headBranch'] };
	const expected = { owner: 'owner', repo: 'repo', number: 42, title: 'A pull request', url };
	const read = (entry: object) => readAgentHeadBranchPullRequest({ _meta: { 'copilot.githubReferences': [entry] } });

	test('reads canonical head-branch metadata and tolerates unknown fields and relations', () => {
		assert.deepStrictEqual(read({ ...reference, extra: true, relations: ['headBranch', 'future'], state: 'draft' }), { ...expected, state: 'draft' });
	});

	test('does not infer a branch PR from attached or created references', () => {
		assert.deepStrictEqual(['attached', 'created'].map(relation => read({ ...reference, relations: [relation] })), [undefined, undefined]);
	});

	test('validates entries individually and ignores an unknown optional state', () => {
		assert.deepStrictEqual(readAgentHeadBranchPullRequest({ _meta: { 'copilot.githubReferences': [null, {}, { ...reference, state: 'future' }] } }), expected);
	});

	test('accepts GitHub Enterprise origins', () => {
		assert.deepStrictEqual(read({ ...reference, url: 'https://ghe.example.com/owner/repo/pull/42' }), { ...expected, url: 'https://ghe.example.com/owner/repo/pull/42' });
	});

	for (const [name, entry] of Object.entries({
		'wrong kind': { ...reference, referenceType: 'issue' },
		'wrong repository': { ...reference, repository: 'other/repo' },
		'wrong number': { ...reference, number: 43 },
		'non-numeric number': { ...reference, number: '42' },
		'missing title': { ...reference, title: undefined },
		'non-array relations': { ...reference, relations: 'headBranch' },
		'credentials': { ...reference, url: 'https://user:password@github.com/owner/repo/pull/42' },
		'query': { ...reference, url: `${url}?token=secret` },
		'fragment': { ...reference, url: `${url}#comment` },
		'extra path': { ...reference, url: `${url}/files` },
		'dot segments': { ...reference, url: 'https://github.com/ignored/../owner/repo/pull/42' },
		'whitespace': { ...reference, url: ` ${url}` },
		'leading zero': { ...reference, url: 'https://github.com/owner/repo/pull/042' },
		'unsafe number': { ...reference, number: 9007199254740992, url: 'https://github.com/owner/repo/pull/9007199254740992' },
		'non-web scheme': { ...reference, url: 'file:///owner/repo/pull/42' },
	})) {
		test(`rejects ${name}`, () => assert.strictEqual(read(entry), undefined));
	}

	test('absent and malformed extensions are optional', () => {
		assert.deepStrictEqual([undefined, null, {}, [], 'invalid'].map(value => readAgentHeadBranchPullRequest({ _meta: { 'copilot.githubReferences': value } })), Array(5).fill(undefined));
	});

	test('VS Code folder metadata takes precedence, including an empty map', () => {
		assert.strictEqual(readAgentHeadBranchPullRequest({ _meta: { [SESSION_META_GITHUB_DATA_KEY]: {}, 'copilot.githubReferences': [reference] } }), undefined);
	});

	function hostMetadata(branchName = 'feature'): SessionMeta | undefined {
		return withSessionGitHubState(withSessionGitState({ unrelated: { keep: true } }, { branchName }), 'file:///repo', {
			owner: 'owner', repo: 'repo', pullRequestUrls: [url, 'https://github.com/owner/repo/pull/41'],
			pullRequestBranchName: 'feature', pullRequestState: 'merged', pullRequestStateUrl: url,
		});
	}

	test('publishes only the primary checkout PR with a matching branch and status', () => {
		const source = { workingDirectories: ['file:///repo'], _meta: hostMetadata() };
		const result = withAgentSessionGitHubReferences(source);
		assert.deepStrictEqual(result._meta, {
			...source._meta,
			'copilot.githubReferences': [{ ...reference, title: '', state: 'merged' }],
		});
		assert.strictEqual(withAgentSessionGitHubReferences(result), result);
	});

	test('clears stale branch metadata without deleting unrelated keys', () => {
		const source = { workingDirectories: ['file:///repo'], _meta: hostMetadata('other') };
		assert.deepStrictEqual(withAgentSessionGitHubReferences({ ...source, _meta: { ...source._meta, 'copilot.githubReferences': [reference] } }), source);
	});

	test('does not publish another folder or an unverified legacy branch association', () => {
		const meta = hostMetadata();
		const legacy = withSessionGitHubState(meta, 'file:///repo', { owner: 'owner', repo: 'repo', pullRequestUrls: [url] });
		assert.deepStrictEqual([
			withAgentSessionGitHubReferences({ workingDirectories: ['file:///other'], _meta: meta })._meta?.['copilot.githubReferences'],
			withAgentSessionGitHubReferences({ workingDirectories: ['file:///repo'], _meta: legacy })._meta?.['copilot.githubReferences'],
		], [undefined, undefined]);
	});

	test('does not attribute status from a different PR', () => {
		const _meta = withSessionGitHubState(withSessionGitState(undefined, { branchName: 'feature' }), 'file:///repo', {
			owner: 'owner', repo: 'repo', pullRequestUrls: [url], pullRequestBranchName: 'feature',
			pullRequestState: 'closed', pullRequestStateUrl: 'https://github.com/owner/repo/pull/41',
		});
		assert.deepStrictEqual(withAgentSessionGitHubReferences({ workingDirectories: ['file:///repo'], _meta })._meta?.['copilot.githubReferences'], [{ ...reference, title: '' }]);
	});

	test('does not parse a working directory when there is no GitHub association to publish', () => {
		const source = { workingDirectories: ['foo bar:/x'], _meta: withSessionGitState(undefined, { branchName: 'feature' }) };
		assert.strictEqual(withAgentSessionGitHubReferences(source), source);
	});

	test('publishes and clears only the head-branch relation in a mixed reference list', () => {
		const attached = { ...reference, number: 7, url: 'https://github.com/owner/repo/pull/7', relations: ['headBranch', 'attached'], future: true };
		const created = { ...reference, relations: ['created'], future: { keep: true } };
		const issue = { referenceType: 'issue', repository: 'owner/repo', number: 9, title: 'Issue', url: 'https://github.com/owner/repo/issues/9', relations: ['attached'] };
		const unknown = { referenceType: 'future', relations: ['future'], keep: true };
		const source = { workingDirectories: ['file:///repo'], _meta: { ...hostMetadata(), 'copilot.githubReferences': [attached, created, issue, unknown] } };
		const published = withAgentSessionGitHubReferences(source);
		const cleared = withAgentSessionGitHubReferences({ ...published, _meta: withSessionGitState(published._meta, { branchName: 'other' }) });
		assert.deepStrictEqual([
			published._meta?.['copilot.githubReferences'],
			cleared._meta?.['copilot.githubReferences'],
		], [
			[{ ...created, title: '', state: 'merged', relations: ['headBranch', 'created'] }, { ...attached, relations: ['attached'] }, issue, unknown],
			[{ ...created, title: '', state: 'merged' }, { ...attached, relations: ['attached'] }, issue, unknown],
		]);
	});
});
