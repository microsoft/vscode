/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IRequestService } from '../../../request/common/request.js';
import { NullLogService } from '../../../log/common/log.js';
import { makeGitHubAPIRequest, makeGitHubGraphQLRequest, IGitHubAPIRequestOptions, IGitHubGraphQLRequestOptions } from '../../common/githubAPI.js';
import { GitHubService, IGitHubWorkflowJob, IGitHubCustomAgentsResponse } from '../../common/githubService.js';

class TestRequestService implements IRequestService {
	_serviceBrand: undefined;

	constructor(private mockResponse: any) { }

	async request(): Promise<IRequestContext> {
		return {
			res: {
				statusCode: 200,
				headers: {}
			},
			// eslint-disable-next-line local/code-no-any-casts
		stream: {
				on: (event: string, callback: (data?: Buffer) => void) => {
					if (event === 'data') {
						callback(Buffer.from(JSON.stringify(this.mockResponse)));
					}
					if (event === 'end') {
						callback();
					}
				},
				once: () => { },
				removeListener: () => { }
			} as any
		};
	}

	async resolveProxy(): Promise<string | undefined> {
		return undefined;
	}

	async lookupAuthorization(): Promise<any> {
		return undefined;
	}

	async lookupKerberosAuthorization(): Promise<string | undefined> {
		return undefined;
	}

	async loadCertificates(): Promise<string[]> {
		return [];
	}
}

suite('GitHub API', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('makeGitHubAPIRequest', () => {
		test('should return typed response', async () => {
			const mockResponse = { id: 123, name: 'test-job' };
			const requestService = new TestRequestService(mockResponse);
			const logService = new NullLogService();

			const options: IGitHubAPIRequestOptions = {
				url: 'https://api.github.com/test',
				token: 'test-token',
				method: 'GET'
			};

			const result = await makeGitHubAPIRequest<typeof mockResponse>(
				requestService,
				logService,
				options,
				CancellationToken.None
			);

			assert.strictEqual(result.id, 123);
			assert.strictEqual(result.name, 'test-job');
		});

		test('should throw error on null response', async () => {
			const requestService = new TestRequestService(null);
			const logService = new NullLogService();

			const options: IGitHubAPIRequestOptions = {
				url: 'https://api.github.com/test',
				token: 'test-token',
				method: 'GET'
			};

			await assert.rejects(
				makeGitHubAPIRequest(requestService, logService, options, CancellationToken.None),
				/GitHub API returned null response/
			);
		});
	});

	suite('makeGitHubGraphQLRequest', () => {
		test('should return typed GraphQL response', async () => {
			const mockData = { user: { login: 'testuser' } };
			const mockResponse = { data: mockData };
			const requestService = new TestRequestService(mockResponse);
			const logService = new NullLogService();

			const options: IGitHubGraphQLRequestOptions = {
				query: 'query { user { login } }',
				token: 'test-token'
			};

			const result = await makeGitHubGraphQLRequest<typeof mockData>(
				requestService,
				logService,
				options,
				CancellationToken.None
			);

			assert.deepStrictEqual(result, mockData);
		});

		test('should throw error on GraphQL errors', async () => {
			const mockResponse = {
				data: null,
				errors: [{ message: 'Test error' }]
			};
			const requestService = new TestRequestService(mockResponse);
			const logService = new NullLogService();

			const options: IGitHubGraphQLRequestOptions = {
				query: 'query { user { login } }',
				token: 'test-token'
			};

			await assert.rejects(
				makeGitHubGraphQLRequest(requestService, logService, options, CancellationToken.None),
				/GitHub GraphQL API returned errors: Test error/
			);
		});
	});
});

suite('GitHubService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getJobByJobIdWithToken should return typed job', async () => {
		const mockJob: IGitHubWorkflowJob = {
			id: 123,
			run_id: 456,
			run_url: 'https://api.github.com/repos/test/repo/actions/runs/456',
			node_id: 'test-node-id',
			head_sha: 'abc123',
			url: 'https://api.github.com/repos/test/repo/actions/jobs/123',
			html_url: 'https://github.com/test/repo/actions/runs/456/jobs/123',
			status: 'completed',
			conclusion: 'success',
			started_at: '2023-01-01T00:00:00Z',
			completed_at: '2023-01-01T00:05:00Z',
			name: 'test-job',
			check_run_url: 'https://api.github.com/repos/test/repo/check-runs/123',
			labels: ['ubuntu-latest'],
			runner_id: 1,
			runner_name: 'test-runner',
			runner_group_id: 1,
			runner_group_name: 'Default'
		};

		const requestService = new TestRequestService(mockJob);
		const logService = new NullLogService();
		const service = new GitHubService(requestService, logService);

		const result = await service.getJobByJobIdWithToken(
			'test',
			'repo',
			123,
			'test-token',
			CancellationToken.None
		);

		assert.strictEqual(result.id, 123);
		assert.strictEqual(result.name, 'test-job');
		assert.strictEqual(result.status, 'completed');
	});

	test('getCustomAgents should return typed agents', async () => {
		const mockResponse: IGitHubCustomAgentsResponse = {
			agents: [
				{ name: 'agent1', description: 'Test agent 1' },
				{ name: 'agent2', description: 'Test agent 2', tools: ['tool1'] }
			]
		};

		const requestService = new TestRequestService(mockResponse);
		const logService = new NullLogService();
		const service = new GitHubService(requestService, logService);

		const result = await service.getCustomAgents(
			'test',
			'repo',
			'test-token',
			CancellationToken.None
		);

		assert.strictEqual(result.agents.length, 2);
		assert.strictEqual(result.agents[0].name, 'agent1');
		assert.strictEqual(result.agents[1].tools?.length, 1);
	});

	test('getCustomAgents should throw on invalid response structure', async () => {
		const mockResponse = { invalid: 'response' };

		const requestService = new TestRequestService(mockResponse);
		const logService = new NullLogService();
		const service = new GitHubService(requestService, logService);

		await assert.rejects(
			service.getCustomAgents('test', 'repo', 'test-token', CancellationToken.None),
			/Invalid response from GitHub API: missing agents property/
		);
	});
});
