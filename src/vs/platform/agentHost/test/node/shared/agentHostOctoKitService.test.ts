/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentHostOctoKitService, type FetchFunction } from '../../../node/shared/agentHostOctoKitService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { deriveGitHubEndpoints } from '../../../common/githubEndpoints.js';
import type { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';

type Captured = { url: string; init: RequestInit | undefined };

class RecordingLogService extends NullLogService {
	readonly errors: string[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push([message, ...args].map(value => value instanceof Error ? value.message : String(value)).join(' '));
	}
}

function getUrl(input: string | URL | Request): string {
	if (typeof input === 'string') {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

function makeService(fetchImpl: FetchFunction, enterpriseUri?: string, logService = new NullLogService()): AgentHostOctoKitService {
	return new AgentHostOctoKitService(fetchImpl, logService, createTestGitHubEndpointService(enterpriseUri));
}

function signal(): AbortSignal {
	return new AbortController().signal;
}

function capturingFetch(response: Response): { fetch: FetchFunction; captured: () => Captured } {
	let lastCapture: Captured = { url: '', init: undefined };
	const impl: FetchFunction = async (input, init) => {
		lastCapture = { url: getUrl(input), init };
		return response;
	};
	return { fetch: impl, captured: () => lastCapture };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

suite('AgentHostOctoKitService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('createPullRequest posts the expected request and parses the response', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ html_url: 'https://github.com/o/r/pull/42', number: 42, node_id: 'PR_node_42' }));
		const service = makeService(fetch);

		const result = await service.createPullRequest('o', 'r', 'My PR', 'Body', 'feature', 'main', false, 'gh-token', signal());

		assert.deepStrictEqual(result, { url: 'https://github.com/o/r/pull/42', number: 42, nodeId: 'PR_node_42' });

		const cap = captured();
		assert.strictEqual(cap.url, 'https://api.github.com/repos/o/r/pulls');
		assert.strictEqual(cap.init?.method, 'POST');
		const headers = cap.init?.headers as Record<string, string>;
		assert.strictEqual(headers['Authorization'], 'Bearer gh-token');
		assert.strictEqual(headers['Accept'], 'application/vnd.github+json');
		assert.strictEqual(headers['X-GitHub-Api-Version'], '2022-11-28');
		assert.strictEqual(headers['Content-Type'], 'application/json');
		assert.deepStrictEqual(JSON.parse(cap.init?.body as string), {
			title: 'My PR',
			body: 'Body',
			head: 'feature',
			base: 'main',
			draft: false,
		});
	});

	test('createPullRequest forwards the draft flag', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ html_url: 'https://github.com/o/r/pull/7', number: 7 }));
		const service = makeService(fetch);

		await service.createPullRequest('o', 'r', 't', 'b', 'h', 'b', true, 'tok', signal());

		const sent = JSON.parse(captured().init?.body as string) as { draft: boolean };
		assert.strictEqual(sent.draft, true);
	});

	test('createPullRequest forwards the abort signal', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ html_url: 'https://github.com/o/r/pull/7', number: 7 }));
		const service = makeService(fetch);
		const controller = new AbortController();

		await service.createPullRequest('o', 'r', 't', 'b', 'h', 'b', true, 'tok', controller.signal);

		assert.strictEqual(captured().init?.signal, controller.signal);
	});

	test('findPullRequestByHeadBranch fetches the latest matching pull request', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: 'https://github.com/o/r/pull/9', number: 9, node_id: 'PR_node_9', created_at: '2026-08-09T12:00:00.000Z' }]));
		const service = makeService(fetch);

		const result = await service.findPullRequestByHeadBranch('o', 'r', 'feature/test', 'tok', signal());

		assert.deepStrictEqual({
			result,
			url: captured().url,
			method: captured().init?.method,
		}, {
			result: { url: 'https://github.com/o/r/pull/9', number: 9, nodeId: 'PR_node_9', createdAt: Date.parse('2026-08-09T12:00:00.000Z') },
			url: 'https://api.github.com/repos/o/r/pulls?head=o%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1',
			method: 'GET',
		});
	});

	test('findPullRequestByHeadBranch qualifies a fork branch with its head owner', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: 'https://github.com/o/r/pull/9', number: 9 }]));
		const service = makeService(fetch);

		await service.findPullRequestByHeadBranch('o', 'r', 'feature/test', 'tok', signal(), 'fork-owner');

		assert.strictEqual(captured().url, 'https://api.github.com/repos/o/r/pulls?head=fork-owner%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1');
	});

	test('findPullRequestByHeadSha returns the pull request whose head is the commit', async () => {
		// Pull request 1 only contains the commit; 9 has it as its head.
		const { fetch, captured } = capturingFetch(jsonResponse([
			{ html_url: 'https://github.com/o/r/pull/1', number: 1, state: 'open', head: { sha: 'aaa' } },
			{ html_url: 'https://github.com/o/r/pull/9', number: 9, state: 'open', head: { sha: 'bbb' }, node_id: 'PR_node_9' },
		]));
		const service = makeService(fetch);

		const result = await service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal());

		assert.deepStrictEqual({
			result,
			url: captured().url,
			method: captured().init?.method,
		}, {
			result: { url: 'https://github.com/o/r/pull/9', number: 9, nodeId: 'PR_node_9' },
			url: 'https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100',
			method: 'GET',
		});
	});

	test('findPullRequestByHeadSha treats an unpushed commit as no pull request', async () => {
		const logService = new RecordingLogService();
		const service = makeService(
			capturingFetch(jsonResponse({ message: 'No commit found for SHA: bbb' }, 422)).fetch,
			undefined,
			logService,
		);

		const result = await service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal());

		assert.deepStrictEqual({ result, errors: logService.errors }, { result: undefined, errors: [] });
	});

	test('findPullRequestByHeadSha throws and logs other unprocessable responses', async () => {
		const logService = new RecordingLogService();
		const service = makeService(
			capturingFetch(new Response('{"message":"Validation Failed"}', { status: 422, statusText: 'Unprocessable Entity' })).fetch,
			undefined,
			logService,
		);

		await assert.rejects(
			() => service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal()),
			/GitHub API request failed: GET repos\/o\/r\/commits\/bbb\/pulls\?per_page=100 - 422 Unprocessable Entity - {"message":"Validation Failed"}/,
		);
		assert.deepStrictEqual(logService.errors, [
			'[AgentHostOctoKit] GET https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100 - Status: 422 - {"message":"Validation Failed"}',
		]);
	});

	test('findPullRequestByHeadSha throws and logs server errors', async () => {
		const logService = new RecordingLogService();
		const service = makeService(
			capturingFetch(new Response('{"message":"Server Error"}', { status: 500, statusText: 'Server Error' })).fetch,
			undefined,
			logService,
		);

		await assert.rejects(
			() => service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal()),
			/GitHub API request failed: GET repos\/o\/r\/commits\/bbb\/pulls\?per_page=100 - 500 Server Error - {"message":"Server Error"}/,
		);
		assert.deepStrictEqual(logService.errors, [
			'[AgentHostOctoKit] GET https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100 - Status: 500 - {"message":"Server Error"}',
		]);
	});

	test('findPullRequestByHeadSha ignores pull requests that only contain the commit', async () => {
		const service = makeService(capturingFetch(jsonResponse([
			{ html_url: 'https://github.com/o/r/pull/1', number: 1, state: 'open', head: { sha: 'aaa' } },
		])).fetch);

		assert.strictEqual(await service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal()), undefined);
	});

	test('findPullRequestByHeadSha reports none when several pull requests share the head commit', async () => {
		const service = makeService(capturingFetch(jsonResponse([
			{ html_url: 'https://github.com/o/r/pull/1', number: 1, state: 'open', head: { sha: 'bbb' } },
			{ html_url: 'https://github.com/o/r/pull/2', number: 2, state: 'open', head: { sha: 'bbb' } },
		])).fetch);

		assert.strictEqual(await service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal()), undefined);
	});

	test('serves the previously fetched pull request when the ETag still validates', async () => {
		let call = 0;
		const service = makeService(async () => {
			call++;
			return call === 1
				? new Response(JSON.stringify([{ html_url: 'https://github.com/o/r/pull/9', number: 9 }]), { status: 200, headers: { 'content-type': 'application/json', etag: 'W/"tag"' } })
				: new Response(null, { status: 304, headers: { etag: 'W/"tag"' } });
		});

		const first = await service.findPullRequestByHeadBranch('o', 'r', 'feature', 'tok', signal());
		const revalidated = await service.findPullRequestByHeadBranch('o', 'r', 'feature', 'tok', signal());

		assert.deepStrictEqual({ first, revalidated }, {
			first: { url: 'https://github.com/o/r/pull/9', number: 9, nodeId: undefined },
			revalidated: { url: 'https://github.com/o/r/pull/9', number: 9, nodeId: undefined },
		});
	});

	test('findPullRequestByHeadSha reports none when the commit fills a whole page of pull requests', async () => {
		const page = Array.from({ length: 100 }, (_, index) => ({ html_url: `https://github.com/o/r/pull/${index}`, number: index, state: 'open', head: { sha: index === 0 ? 'bbb' : 'aaa' } }));
		const service = makeService(capturingFetch(jsonResponse(page)).fetch);

		assert.strictEqual(await service.findPullRequestByHeadSha('o', 'r', 'bbb', 'tok', signal()), undefined);
	});

	test('scopes the pull request cache to the GitHub host that issued the validator', async () => {
		let apiBaseUri = deriveGitHubEndpoints(undefined).apiBaseUri;
		const endpointService: IAgentHostGitHubEndpointService = {
			...createTestGitHubEndpointService(),
			getApiBaseUri: () => apiBaseUri,
		};
		const requests: (string | undefined)[] = [];
		const service = new AgentHostOctoKitService(async (_input, init) => {
			requests.push((init?.headers as Record<string, string>)['If-None-Match']);
			return new Response(JSON.stringify([{ html_url: 'https://github.com/o/r/pull/9', number: 9 }]), { status: 200, headers: { 'content-type': 'application/json', etag: 'W/"tag"' } });
		}, new NullLogService(), endpointService);

		await service.findPullRequestByHeadBranch('o', 'r', 'feature', 'tok', signal());
		await service.findPullRequestByHeadBranch('o', 'r', 'feature', 'tok', signal());
		apiBaseUri = deriveGitHubEndpoints('https://ghe.example.com').apiBaseUri;
		await service.findPullRequestByHeadBranch('o', 'r', 'feature', 'tok', signal());

		// The validator is replayed only against the host that issued it.
		assert.deepStrictEqual(requests, [undefined, 'W/"tag"', undefined]);
	});

	test('getIssueOrPullRequest fetches the title and body from the issues endpoint', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ title: 'Issue title', body: 'Issue body' }));
		const service = makeService(fetch);

		const result = await service.getIssueOrPullRequest('o', 'r', 42, 'tok', signal());

		assert.deepStrictEqual({
			result,
			url: captured().url,
			method: captured().init?.method,
		}, {
			result: { title: 'Issue title', body: 'Issue body' },
			url: 'https://api.github.com/repos/o/r/issues/42',
			method: 'GET',
		});
	});

	test('createPullRequest throws on non-OK response', async () => {
		const service = makeService(capturingFetch(new Response('{"message":"Validation Failed"}', { status: 422, statusText: 'Unprocessable Entity' })).fetch);

		await assert.rejects(
			() => service.createPullRequest('o', 'r', 't', 'b', 'h', 'b', false, 'tok', signal()),
			/422 Unprocessable Entity - {"message":"Validation Failed"}/,
		);
	});

	test('createPullRequest truncates long non-OK response bodies', async () => {
		const service = makeService(capturingFetch(new Response(`prefix\n${'x'.repeat(600)}`, { status: 500, statusText: 'Server Error' })).fetch);

		await assert.rejects(
			() => service.createPullRequest('o', 'r', 't', 'b', 'h', 'b', false, 'tok', signal()),
			err => err instanceof Error && err.message.includes(`prefix ${'x'.repeat(493)}...`) && !err.message.includes('x'.repeat(600)),
		);
	});

	test('createPullRequest throws when response is missing html_url or number', async () => {
		const service = makeService(capturingFetch(jsonResponse({ html_url: 'https://github.com/o/r/pull/1' /* missing number */ })).fetch);

		await assert.rejects(
			() => service.createPullRequest('o', 'r', 't', 'b', 'h', 'b', false, 'tok', signal()),
			/Failed to create pull request for o\/r/,
		);
	});

	test('enablePullRequestAutoMerge posts the GraphQL mutation', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: 'PR_node_42' } } } }));
		const service = makeService(fetch);

		await service.enablePullRequestAutoMerge('PR_node_42', 'SQUASH', 'gh-token', signal());

		const cap = captured();
		const headers = cap.init?.headers as Record<string, string>;
		assert.deepStrictEqual({
			url: cap.url,
			method: cap.init?.method,
			authorization: headers['Authorization'],
			variables: (JSON.parse(cap.init?.body as string) as { variables: unknown }).variables,
		}, {
			url: 'https://api.github.com/graphql',
			method: 'POST',
			authorization: 'Bearer gh-token',
			variables: { pullRequestId: 'PR_node_42', mergeMethod: 'SQUASH' },
		});
	});

	test('enablePullRequestAutoMerge throws when GraphQL returns errors', async () => {
		const service = makeService(capturingFetch(jsonResponse({ errors: [{ message: 'Pull request is in clean status' }] })).fetch);

		await assert.rejects(
			() => service.enablePullRequestAutoMerge('PR_node_42', 'MERGE', 'tok', signal()),
			/GitHub GraphQL request failed: Pull request is in clean status/,
		);
	});

	test('routes REST calls to the GitHub Enterprise Server API base', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ html_url: 'https://ghe.acme.com/o/r/pull/7', number: 7, node_id: 'n' }));
		const service = makeService(fetch, 'https://ghe.acme.com');

		await service.createPullRequest('o', 'r', 'T', 'B', 'feature', 'main', false, 'tok', signal());

		assert.strictEqual(captured().url, 'https://ghe.acme.com/api/v3/repos/o/r/pulls');
	});

	test('routes GraphQL calls to the GitHub Enterprise Server GraphQL endpoint', async () => {
		const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: 'PR_1' } } } }));
		const service = makeService(fetch, 'https://ghe.acme.com');

		await service.enablePullRequestAutoMerge('PR_1', 'MERGE', 'tok', signal());

		assert.strictEqual(captured().url, 'https://ghe.acme.com/api/graphql');
	});
});
