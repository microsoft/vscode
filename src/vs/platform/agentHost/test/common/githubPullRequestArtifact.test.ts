/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { arePullRequestArtifactChecksReady, getPullRequestArtifactChecks, getPullRequestArtifactCheckState, getPullRequestArtifactThreads, isPullRequestArtifactCheckExcluded, isPullRequestArtifactMergeable, isPullRequestArtifactReadyForReview, parseGitHubPullRequestArtifact, readGitHubPullRequestArtifactWorkspaceSettings } from '../../common/githubPullRequestArtifact.js';
import { createPullRequestArtifactSnapshot } from './githubPullRequestArtifactTestUtils.js';

suite('GitHub pull request artifact rules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches only configured GitHub hosts and canonicalizes PR subpages', () => {
		assert.deepStrictEqual([
			parseGitHubPullRequestArtifact(URI.parse('https://www.github.com/Octo/Repo/pull/42/files?view=split#file'), 'https://api.github.com')?.resource.toString(),
			parseGitHubPullRequestArtifact(URI.parse('https://tenant.ghe.com/Octo/Repo/pull/42'), 'https://api.tenant.ghe.com')?.apiHost,
			parseGitHubPullRequestArtifact(URI.parse('https://github.example/Octo/Repo/pull/42'), 'https://github.example/api/v3')?.apiHost,
			parseGitHubPullRequestArtifact(URI.parse('https://elsewhere.example/Octo/Repo/pull/42'), 'https://api.github.com'),
			parseGitHubPullRequestArtifact(URI.parse('https://github.com/Octo/Repo/pull/0'), 'https://api.github.com'),
			parseGitHubPullRequestArtifact(URI.parse('https://github.com/Octo/Repo/issues/42'), 'https://api.github.com'),
			parseGitHubPullRequestArtifact(URI.parse('command:Octo/Repo/pull/42'), 'https://api.github.com'),
		], ['https://github.com/Octo/Repo/pull/42', 'api.tenant.ghe.com', 'github.example', undefined, undefined, undefined, undefined]);
	});

	test('counts unresolved threads with maintainer or Copilot feedback, not discussion or resolved history', () => {
		const threads = ['OWNER', 'MEMBER', 'COLLABORATOR', 'CONTRIBUTOR', 'NONE'].map(association => ({
			id: association, isResolved: false, comments: [{ id: association, author: { login: 'reviewer', association }, body: 'Feedback' }],
		}));
		const snapshot = createPullRequestArtifactSnapshot({
			reviewThreads: {
				status: 'ready', complete: true, value: [
					...threads,
					{ id: 'resolved', isResolved: true, comments: threads[0].comments },
					{ id: 'copilot', isResolved: false, comments: [{ id: 'bot', author: { login: 'copilot-pull-request-reviewer[bot]' } }] },
					{ id: 'copilot-id', isResolved: false, comments: [{ id: 'bot-id', author: { login: 'renamed', id: '175728472' } }] },
					{ id: 'unknown', isResolved: false, comments: [{ id: 'unknown' }] },
				]
			},
		});
		assert.deepStrictEqual(getPullRequestArtifactThreads(snapshot).map(thread => thread.id), ['OWNER', 'MEMBER', 'COLLABORATOR', 'copilot', 'copilot-id']);
	});

	test('classifies optional checks, legacy statuses, skipped checks, and unknown conclusions', () => {
		assert.deepStrictEqual([
			getPullRequestArtifactCheckState({ id: '1', name: 'Optional', type: 'checkRun', required: false, status: 'COMPLETED', conclusion: 'FAILURE' }),
			getPullRequestArtifactCheckState({ id: '2', name: 'Skipped', type: 'checkRun', status: 'COMPLETED', conclusion: 'SKIPPED' }),
			getPullRequestArtifactCheckState({ id: '3', name: 'Neutral', type: 'checkRun', status: 'COMPLETED', conclusion: 'NEUTRAL' }),
			getPullRequestArtifactCheckState({ id: '4', name: 'Unknown', type: 'checkRun', status: 'COMPLETED' }),
			getPullRequestArtifactCheckState({ id: '5', name: 'Queued', type: 'checkRun', status: 'QUEUED' }),
			getPullRequestArtifactCheckState({ id: '6', name: 'Status', type: 'statusContext', status: 'ERROR' }),
		], ['failed', 'passed', 'passed', 'pending', 'pending', 'failed']);
	});

	test('check-name patterns are case-sensitive, anchored, and treat regex characters literally', () => {
		assert.deepStrictEqual([
			isPullRequestArtifactCheckExcluded('Optional / macOS', ['Optional *']),
			isPullRequestArtifactCheckExcluded('optional / macOS', ['Optional *']),
			isPullRequestArtifactCheckExcluded('Build (Linux)', ['Build (Linux)']),
			isPullRequestArtifactCheckExcluded('Build Linux', ['Build (Linux)']),
			isPullRequestArtifactCheckExcluded('My Build', ['Build']),
			isPullRequestArtifactCheckExcluded('Build', []),
		], [true, false, true, false, false, false]);
	});

	test('exclusions relax only marking ready, not merging or the visible check set', () => {
		const base = createPullRequestArtifactSnapshot();
		const checks = {
			...base.checks, value: {
				...base.checks.value!, checks: [
					...base.checks.value!.checks,
					{ id: 'optional', name: 'Optional / Linux', type: 'checkRun' as const, required: false, status: 'COMPLETED', conclusion: 'FAILURE' },
				]
			}
		};
		const draft = createPullRequestArtifactSnapshot({ core: { ...base.core, value: { ...base.core.value!, draft: true } }, checks });
		const open = createPullRequestArtifactSnapshot({ checks });
		assert.deepStrictEqual({
			readyWithoutExclusions: isPullRequestArtifactReadyForReview(draft, []),
			readyWithExclusions: isPullRequestArtifactReadyForReview(draft, ['Optional *']),
			autoMerge: isPullRequestArtifactMergeable(open, true),
			manualMerge: isPullRequestArtifactMergeable(open, false),
			checks: getPullRequestArtifactChecks(draft).map(check => check.name),
		}, { readyWithoutExclusions: false, readyWithExclusions: true, autoMerge: false, manualMerge: true, checks: ['Build', 'Optional / Linux'] });
	});

	test('incomplete, stale, or previous-head data cannot authorize readiness', () => {
		const base = createPullRequestArtifactSnapshot();
		const variants = [
			{ ...base.checks, complete: false },
			{ ...base.checks, status: 'stale' as const },
			{ ...base.checks, headSha: 'previous' },
			{ ...base.checks, value: { ...base.checks.value!, headSha: 'previous' } },
			{ ...base.checks, value: { ...base.checks.value!, expectedSuitesComplete: false } },
			{ ...base.checks, value: { ...base.checks.value!, expectedSuites: [{ id: 'suite', name: 'Not reported', status: 'QUEUED', checkRunsReported: false }] } },
		];
		assert.deepStrictEqual(variants.map(checks => arePullRequestArtifactChecksReady({ ...base, checks })), variants.map(() => false));
	});

	test('surfaces failed suites even when no check runs were reported', () => {
		const base = createPullRequestArtifactSnapshot();
		const snapshot = {
			...base, checks: {
				...base.checks, value: {
					...base.checks.value!, expectedSuites: [
						{ id: 'suite', name: 'Invalid workflow', status: 'COMPLETED', conclusion: 'FAILURE', checkRunsReported: false },
					]
				}
			}
		};
		assert.deepStrictEqual(getPullRequestArtifactChecks(snapshot).map(check => [check.id, getPullRequestArtifactCheckState(check)]), [['build', 'passed'], ['suite:suite', 'failed']]);
	});

	test('merge gates respect draft state, feedback, permission, conflicts, and existing queues', () => {
		const base = createPullRequestArtifactSnapshot();
		const variants = [
			{ ...base, core: { ...base.core, value: { ...base.core.value!, draft: true } } },
			{ ...base, core: { ...base.core, value: { ...base.core.value!, state: 'closed' as const } } },
			{ ...base, reviewThreads: { status: 'loading' as const, complete: false } },
			...[
				{ viewerCanMerge: false }, { mergeable: 'CONFLICTING' as const }, { mergeStateStatus: 'BEHIND' },
				{ queueRequirementKnown: false }, { autoMergeEnabled: true }, { mergeQueueEntryId: 'queue' }, { reviewDecision: 'CHANGES_REQUESTED' },
			].map(overrides => ({ ...base, mergeability: { ...base.mergeability, value: { ...base.mergeability.value!, ...overrides } } })),
		];
		assert.deepStrictEqual([isPullRequestArtifactMergeable(base, true), ...variants.map(snapshot => isPullRequestArtifactMergeable(snapshot, true))], [true, ...variants.map(() => false)]);
	});

	test('validates serialized workspace exclusions without accepting malformed values', () => {
		const valid = { chat: 'chat', workingDirectory: 'file:///workspace', ignoredChecks: ['Optional *'] };
		assert.deepStrictEqual([
			readGitHubPullRequestArtifactWorkspaceSettings(valid),
			readGitHubPullRequestArtifactWorkspaceSettings({ ...valid, ignoredChecks: [42] }),
			readGitHubPullRequestArtifactWorkspaceSettings({ ...valid, chat: undefined }),
			readGitHubPullRequestArtifactWorkspaceSettings(null),
		], [valid, undefined, undefined, undefined]);
	});
});
