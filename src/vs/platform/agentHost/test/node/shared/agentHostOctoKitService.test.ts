/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentHostOctoKitService, type FetchFunction } from '../../../node/shared/agentHostOctoKitService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

type Captured = { url: string; init: RequestInit | undefined };

function getUrl(input: string | URL | Request): string {
	if (typeof input === 'string') {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

function makeService(fetchImpl: FetchFunction, enterpriseUri?: string): AgentHostOctoKitService {
	return new AgentHostOctoKitService(fetchImpl, new NullLogService(), createTestGitHubEndpointService(enterpriseUri));
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
		const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: 'https://github.com/o/r/pull/9', number: 9, node_id: 'PR_node_9' }]));
		const service = makeService(fetch);

		const result = await service.findPullRequestByHeadBranch('o', 'r', 'feature/test', 'tok', signal());

		assert.deepStrictEqual({
			result,
			url: captured().url,
			method: captured().init?.method,
		}, {
			result: { url: 'https://github.com/o/r/pull/9', number: 9, nodeId: 'PR_node_9' },
			url: 'https://api.github.com/repos/o/r/pulls?head=o%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1',
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
