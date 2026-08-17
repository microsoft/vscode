/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PullRequestCore, PullRequestRef, PullRequestSubscriptionOptions } from '../../common/githubPullRequestService.js';
import { GitHubHostCapabilities } from '../../common/githubTypes.js';
import { GitHubCredential } from '../../common/githubCredentialService.js';
import { IGitHubCapabilities } from '../../common/githubHostCapabilitiesService.js';
import { GitHubRequestError, GitHubTransport } from '../../common/githubTransport.js';
import { PullRequestQueryService } from '../../common/pullRequestQueryService.js';
import { nodeFetch } from './nodeFetch.js';
import { gitHubGraphQLResponse, gitHubGraphQLStep, gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from './programmableGitHubServer.js';

const availableCapabilities: GitHubHostCapabilities = {
	graphql: true,
	mergeQueue: true,
	internalMergeStatus: false,
	reviewThreads: true,
	checkContextRequiredness: true,
};

class TestCapabilitiesService implements IGitHubCapabilities {

	constructor(readonly value: GitHubHostCapabilities) { }

	getCapabilities(): Promise<GitHubHostCapabilities> {
		return Promise.resolve(this.value);
	}

	clear(): void { }
}

suite('PullRequestQueryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	function setup(server: ProgrammableGitHubServer, capabilities = availableCapabilities): {
		readonly query: PullRequestQueryService;
		readonly ref: PullRequestRef;
		readonly credential: GitHubCredential;
	} {
		const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };
		const signal = new AbortController().signal;
		const transport = disposables.add(new GitHubTransport(nodeFetch));
		return {
			query: new PullRequestQueryService(transport, new TestCapabilitiesService(capabilities), server.createEndpointService()),
			ref: { ...account, owner: 'octo', repo: 'repo', number: 7 },
			credential: { account, token: 'token', generation: 1, signal },
		};
	}

	test('normalizes core and complete independent REST conversation fragments', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/octo/repo/pulls/7', response: gitHubJsonResponse(rawCore('head-1'), { etag: '"core"' }) }),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7/comments',
					query: { per_page: 100 },
					response: gitHubJsonResponse([{ id: 1, node_id: 'IC_1', body: 'one', author_association: 'MEMBER', user: { id: 10, login: 'a' } }], {
						link: `<${server.apiBaseUrl}/repos/octo/repo/issues/7/comments?per_page=100&page=2>; rel="next"`,
					}),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7/comments',
					query: { per_page: 100, page: 2 },
					response: gitHubJsonResponse([{ id: 2, body: 'two', user: { id: 11, login: 'b' } }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/reviews',
					query: { per_page: 100 },
					response: gitHubJsonResponse([{ id: 3, state: 'APPROVED', body: 'approved', author_association: 'COLLABORATOR', user: { login: 'c' }, commit_id: 'head-1' }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/comments',
					query: { per_page: 100 },
					response: gitHubJsonResponse([{ id: 4, body: 'inline', path: 'src/a.ts', line: 3, user: { login: 'd' } }]),
				}),
			);
			const { query, ref, credential } = setup(server);
			const signal = new AbortController().signal;
			const options: PullRequestSubscriptionOptions = {
				priority: 'visible',
				conversation: {
					topLevelComments: true,
					submittedReviews: true,
					inlineComments: true,
					includeBodies: true,
				},
			};

			const coreResult = await query.fetch('core', ref, undefined, options, credential, signal);
			const normalizedCore = coreResult.fragment === 'core' ? coreResult.value : undefined;
			const comments = await query.fetch('topLevelComments', ref, normalizedCore, options, credential, signal);
			const reviews = await query.fetch('submittedReviews', ref, normalizedCore, options, credential, signal);
			const inline = await query.fetch('inlineComments', ref, normalizedCore, options, credential, signal);

			assert.deepStrictEqual({
				core: coreResult,
				comments,
				reviews,
				inline,
			}, {
				core: { fragment: 'core', value: core('head-1'), complete: true },
				comments: {
					fragment: 'topLevelComments',
					value: [
						{ id: '1', nodeId: 'IC_1', author: { id: '10', login: 'a', association: 'MEMBER' }, body: 'one', url: undefined, createdAt: undefined, updatedAt: undefined },
						{ id: '2', nodeId: undefined, author: { id: '11', login: 'b' }, body: 'two', url: undefined, createdAt: undefined, updatedAt: undefined },
					],
					complete: true,
				},
				reviews: {
					fragment: 'submittedReviews',
					value: [{ id: '3', nodeId: undefined, author: { login: 'c', association: 'COLLABORATOR' }, state: 'APPROVED', body: 'approved', commitId: 'head-1', submittedAt: undefined }],
					complete: true,
				},
				inline: {
					fragment: 'inlineComments',
					value: [{
						id: '4',
						nodeId: undefined,
						author: { login: 'd' },
						body: 'inline',
						url: undefined,
						createdAt: undefined,
						updatedAt: undefined,
						reviewId: undefined,
						replyToId: undefined,
						path: 'src/a.ts',
						line: 3,
						originalLine: undefined,
						side: undefined,
						commitId: undefined,
						originalCommitId: undefined,
					}],
					complete: true,
				},
			});
			server.assertSatisfied();
		});
	});

	test('fully paginates review threads and nested comments', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreads',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, { owner: 'octo', repo: 'repo', number: 7 }),
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								headRefOid: 'head-1',
								reviewThreads: {
									nodes: [{
										id: 'T1',
										isResolved: false,
										path: 'a.ts',
										diffSide: 'RIGHT',
										comments: {
											nodes: [{ id: 'C1', databaseId: 1, body: 'first', author: { login: 'a' } }],
											pageInfo: { hasNextPage: true, endCursor: 'comments-1' },
										},
									}],
									pageInfo: { hasNextPage: true, endCursor: 'threads-1' },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreadComments',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, { threadId: 'T1', after: 'comments-1' }),
					response: gitHubGraphQLResponse({
						node: {
							comments: {
								nodes: [{ id: 'C2', databaseId: 2, body: 'second', author: { login: 'b' } }],
								pageInfo: { hasNextPage: false, endCursor: null },
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreads',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, { owner: 'octo', repo: 'repo', number: 7, after: 'threads-1' }),
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								headRefOid: 'head-1',
								reviewThreads: {
									nodes: [{
										id: 'T2',
										isResolved: true,
										diffSide: 'LEFT',
										comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
									}],
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					}),
				}),
			);
			const { query, ref, credential } = setup(server);
			const result = await query.fetch(
				'reviewThreads',
				ref,
				core('head-1'),
				{ priority: 'visible', conversation: { reviewThreads: true, includeBodies: true } },
				credential,
				new AbortController().signal,
			);

			assert.deepStrictEqual(result, {
				fragment: 'reviewThreads',
				value: [
					{
						id: 'T1',
						isResolved: false,
						isOutdated: undefined,
						path: 'a.ts',
						diffSide: 'RIGHT',
						line: undefined,
						originalLine: undefined,
						comments: [
							graphQLComment('1', 'C1', 'a', 'first', 'RIGHT'),
							graphQLComment('2', 'C2', 'b', 'second', 'RIGHT'),
						],
					},
					{
						id: 'T2',
						isResolved: true,
						isOutdated: undefined,
						path: undefined,
						diffSide: 'LEFT',
						line: undefined,
						originalLine: undefined,
						comments: [],
					},
				],
				complete: true,
				headSha: 'head-1',
			});
			server.assertSatisfied();
		});
	});

	test('rejects review threads when the pull request head changes during pagination', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreads',
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								headRefOid: 'head-1',
								reviewThreads: {
									nodes: [],
									pageInfo: { hasNextPage: true, endCursor: 'threads-1' },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreads',
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								headRefOid: 'head-2',
								reviewThreads: {
									nodes: [],
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					}),
				}),
			);
			const { query, ref, credential } = setup(server);

			await assert.rejects(() => query.fetch(
				'reviewThreads',
				ref,
				core('head-1'),
				{ priority: 'visible', conversation: { reviewThreads: true } },
				credential,
				new AbortController().signal,
			), /old pull request head/);
			server.assertSatisfied();
		});
	});

	test('fully paginates current-head checks and normalizes mergeability', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: ['AgentHostPullRequestChecks', 'isRequired'],
					response: gitHubGraphQLResponse(checksPage('head-1', [{
						__typename: 'CheckRun',
						databaseId: 1,
						name: 'CI',
						status: 'COMPLETED',
						conclusion: 'SUCCESS',
						isRequired: true,
					}], true, 'checks-1')),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestChecks',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, { owner: 'octo', repo: 'repo', number: 7, after: 'checks-1' }),
					response: gitHubGraphQLResponse(checksPage('head-1', [{
						__typename: 'StatusContext',
						id: 'SC1',
						context: 'legacy',
						state: 'SUCCESS',
						isRequired: false,
					}], false)),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestExpectedCheckSuites',
					response: gitHubGraphQLResponse({
						repository: {
							object: {
								oid: 'head-1',
								checkSuites: {
									nodes: [{
										id: 'CS1',
										status: 'COMPLETED',
										conclusion: 'SUCCESS',
										app: { name: 'Build' },
										checkRuns: { totalCount: 1 },
									}],
									pageInfo: { hasNextPage: true, endCursor: 'suites-1' },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestExpectedCheckSuites',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, { owner: 'octo', repo: 'repo', headSha: 'head-1', after: 'suites-1' }),
					response: gitHubGraphQLResponse({
						repository: {
							object: {
								oid: 'head-1',
								checkSuites: {
									nodes: [{
										id: 'CS2',
										status: 'IN_PROGRESS',
										conclusion: null,
										app: { slug: 'analysis' },
										checkRuns: { totalCount: 0 },
									}],
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: ['AgentHostPullRequestMergeability', 'mergeQueue(branch: $baseBranch)'],
					response: gitHubGraphQLResponse({
						repository: {
							mergeCommitAllowed: true,
							squashMergeAllowed: true,
							rebaseMergeAllowed: false,
							mergeQueue: null,
							pullRequest: {
								headRefOid: 'head-1',
								baseRefOid: 'base',
								mergeable: 'MERGEABLE',
								mergeStateStatus: 'CLEAN',
								reviewDecision: 'APPROVED',
								viewerCanUpdateBranch: true,
								viewerCanMerge: true,
								viewerCanEnableAutoMerge: true,
								autoMergeRequest: null,
								mergeQueueEntry: null,
							},
						},
					}),
				}),
			);
			const { query, ref, credential } = setup(server);
			const signal = new AbortController().signal;
			const checks = await query.fetch('checks', ref, core('head-1'), { priority: 'interactive', checks: { required: true } }, credential, signal);
			const mergeability = await query.fetch('mergeability', ref, core('head-1'), { priority: 'interactive', mergeability: true }, credential, signal);

			assert.deepStrictEqual({
				checks,
				mergeability,
			}, {
				checks: {
					fragment: 'checks',
					value: {
						headSha: 'head-1',
						requirednessComplete: true,
						expectedSuites: [
							{ id: 'CS1', name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS', checkRunsReported: true },
							{ id: 'CS2', name: 'analysis', status: 'IN_PROGRESS', conclusion: undefined, checkRunsReported: false },
						],
						expectedSuitesComplete: true,
						checks: [
							{ id: '1', type: 'checkRun', name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS', required: true, detailsUrl: undefined, workflowName: undefined },
						],
					},
					complete: true,
					headSha: 'head-1',
				},
				mergeability: {
					fragment: 'mergeability',
					value: {
						headSha: 'head-1',
						baseSha: 'base',
						mergeable: 'MERGEABLE',
						mergeStateStatus: 'CLEAN',
						reviewDecision: 'APPROVED',
						viewerCanUpdate: true,
						viewerCanMerge: true,
						viewerCanEnableAutoMerge: true,
						allowedMergeMethods: ['MERGE', 'SQUASH'],
						autoMergeEnabled: false,
						mergeQueueEntryId: undefined,
						mergeQueueRequired: false,
						queueRequirementKnown: true,
					},
					complete: true,
					headSha: 'head-1',
				},
			});
			server.assertSatisfied();
		});
	});

	test('fails closed for fallback checks and stale-head GraphQL checks', async () => {
		await withServer(async server => {
			const unavailable: GitHubHostCapabilities = {
				graphql: false,
				mergeQueue: false,
				internalMergeStatus: false,
				reviewThreads: false,
				checkContextRequiredness: false,
			};
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/commits/head-1/check-runs',
					query: { per_page: 100 },
					response: gitHubJsonResponse({ check_runs: [{ id: 1, name: 'CI', status: 'completed', conclusion: 'success' }] }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/commits/head-1/status',
					query: { per_page: 100 },
					response: gitHubJsonResponse({ statuses: [{ id: 2, context: 'legacy', state: 'success' }] }),
				}),
			);
			const fallback = setup(server, unavailable);
			const result = await fallback.query.fetch(
				'checks',
				fallback.ref,
				core('head-1'),
				{ priority: 'background', checks: { required: true } },
				fallback.credential,
				new AbortController().signal,
			);
			assert.deepStrictEqual({
				complete: result.complete,
				value: result.fragment === 'checks' ? result.value : undefined,
			}, {
				complete: false,
				value: {
					headSha: 'head-1',
					requirednessComplete: false,
					expectedSuites: [],
					expectedSuitesComplete: false,
					checks: [
						{ id: '1', type: 'checkRun', name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: undefined },
						{ id: '2', type: 'statusContext', name: 'legacy', status: 'SUCCESS', detailsUrl: undefined },
					],
				},
			});
			server.assertSatisfied();
		});

		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				response: gitHubGraphQLResponse(checksPage('head-2', [], false)),
			}));
			const { query, ref, credential } = setup(server);
			await assert.rejects(
				() => query.fetch('checks', ref, core('head-1'), { priority: 'interactive', checks: { required: true } }, credential, new AbortController().signal),
				error => error instanceof GitHubRequestError && error.message.includes('old pull request head'),
			);
			server.assertSatisfied();
		});
	});
});

function rawCore(headSha: string): object {
	return {
		node_id: 'PR_7',
		number: 7,
		title: 'PR title',
		body: 'PR body',
		html_url: 'https://github.example.test/new-owner/new-repo/pull/7',
		state: 'open',
		merged: false,
		draft: false,
		user: { id: 1, login: 'author' },
		head: { sha: headSha, ref: 'feature', repo: { full_name: 'fork-owner/new-repo' } },
		maintainer_can_modify: true,
		base: {
			sha: 'base',
			ref: 'main',
			repo: { node_id: 'R_1', full_name: 'new-owner/new-repo' },
		},
	};
}

function core(headSha: string): PullRequestCore {
	return {
		id: 'PR_7',
		repositoryId: 'R_1',
		repositoryNameWithOwner: 'new-owner/new-repo',
		number: 7,
		title: 'PR title',
		body: 'PR body',
		url: 'https://github.example.test/new-owner/new-repo/pull/7',
		state: 'open',
		draft: false,
		headSha,
		headRef: 'feature',
		headRepositoryNameWithOwner: 'fork-owner/new-repo',
		maintainerCanModify: true,
		baseSha: 'base',
		baseRef: 'main',
		author: { id: '1', login: 'author' },
		createdAt: undefined,
		updatedAt: undefined,
		closedAt: undefined,
		mergedAt: undefined,
	};
}

function graphQLComment(id: string, nodeId: string, login: string, body: string, side: string): object {
	return {
		id,
		nodeId,
		author: { login },
		body,
		url: undefined,
		createdAt: undefined,
		updatedAt: undefined,
		path: undefined,
		line: undefined,
		originalLine: undefined,
		side,
		commitId: undefined,
		originalCommitId: undefined,
	};
}

function checksPage(headSha: string, nodes: readonly object[], hasNextPage: boolean, endCursor: string | null = null): object {
	return {
		repository: {
			pullRequest: {
				headRefOid: headSha,
				commits: {
					nodes: [{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes,
									pageInfo: { hasNextPage, endCursor },
								},
							},
						},
					}],
				},
			},
		},
	};
}
