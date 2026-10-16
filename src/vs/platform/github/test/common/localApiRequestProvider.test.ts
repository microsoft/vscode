/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { LocalApiRequestProvider } from '../../common/client/localApiRequestProvider.js';
import { PaginationLimitError } from '../../common/client/pagination.js';
import { ApiRequest, PaginationOptions } from '../../common/client/request.js';
import { parse, SchemaError } from '../../common/client/schema.js';
import { ContentClient } from '../../common/content/contentClient.js';
import { ActionsClient } from '../../common/core/actionsClient.js';
import { CoreClient } from '../../common/core/coreClient.js';
import { IssuesClient } from '../../common/core/issuesClient.js';
import { PullRequestsClient } from '../../common/core/pullRequestsClient.js';
import { RepositoriesClient } from '../../common/core/repositoriesClient.js';
import { ReviewsClient } from '../../common/core/reviewsClient.js';
import { SearchClient } from '../../common/core/searchClient.js';
import { UsersClient } from '../../common/core/usersClient.js';
import { IGitHubCredentials } from '../../common/githubCredentialService.js';
import { GitHubService } from '../../common/githubService.js';
import { GitHubTransport, GitHubTransportOptions } from '../../common/githubTransport.js';
import { GitHubRequestError, IGitHubCredentialProvider } from '../../common/githubTypes.js';
import { RequestFetch } from '../../common/types.js';

suite('LocalApiRequestProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const apiBaseUri = 'https://api.github.com';
	const signal = () => new AbortController().signal;
	const parseValue = parse.object({ value: parse.integer });
	const read: ApiRequest & { readonly responseBody?: 'json' | 'text' } = {
		method: 'GET', path: '/repos/o/r', expectedStatus: 200,
	};

	function anonymous(fetch: RequestFetch, options?: Partial<GitHubTransportOptions>): LocalApiRequestProvider {
		const transport = store.add(new GitHubTransport(fetch, undefined, false, undefined, options));
		return new LocalApiRequestProvider(apiBaseUri, transport);
	}

	function authenticated(
		fetch: RequestFetch,
		getToken: IGitHubCredentialProvider['getToken'] = () => 'test-token',
		invalidateToken?: IGitHubCredentialProvider['invalidateToken'],
		target: 'rest' | 'graphql' = 'rest',
	): LocalApiRequestProvider {
		const service = store.add(new GitHubService({
			fetch: (input, init) => new URL(String(input)).pathname === '/user'
				? Promise.resolve(Response.json({ id: 101 }))
				: fetch(input, init),
			credentialProvider: { onDidChange: Event.None, getToken, invalidateToken },
		}, new NullLogService(), NullTelemetryService));
		const client = store.add(service.acquireClient({
			apiBaseUri, graphQlUri: `${apiBaseUri}/graphql`,
			authorization: { providerId: 'github', sessionId: 'selected-session', scopes: ['repo', 'gist'] },
		})).object;
		return new LocalApiRequestProvider(target === 'graphql' ? `${apiBaseUri}/graphql` : apiBaseUri, client.transport, client.credentials, target);
	}

	test('runs content and search clients through the same anonymous REST provider', async () => {
		const requests: { url: string; authorization: string | null; credentials?: RequestCredentials; referrerPolicy?: ReferrerPolicy }[] = [];
		const commitSha = 'a'.repeat(40);
		const provider = anonymous(async (input, init) => {
			requests.push({
				url: String(input), authorization: new Headers(init?.headers).get('Authorization'),
				credentials: init?.credentials, referrerPolicy: init?.referrerPolicy,
			});
			return String(input).includes('/commits/')
				? new Response(commitSha)
				: Response.json({ total_count: 0, incomplete_results: false, items: [] });
		});
		const content = await new ContentClient(provider).resolveRef('o', 'r', 'main', signal());
		const search = await new SearchClient(new CoreClient(provider, provider)).issues('repo:o/r', signal());

		assert.deepStrictEqual({ content, search, requests }, {
			content: commitSha,
			search: { total_count: 0, incomplete_results: false, items: [] },
			requests: [
				{ url: `${apiBaseUri}/repos/o/r/commits/main`, authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' },
				{ url: `${apiBaseUri}/search/issues?q=is%3Aissue+repo%3Ao%2Fr`, authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' },
			],
		});
	});

	test('serializes object payloads once and leaves response headers internal', async () => {
		let serializations = 0;
		let body: RequestInit['body'];
		let authenticatedRequest = false;
		const provider = authenticated(async (_input, init) => {
			body = init?.body;
			authenticatedRequest = new Headers(init?.headers).has('Authorization');
			return Response.json({ value: 2 }, { status: 201, headers: { etag: '"private"' } });
		});
		const response = await provider.request({
			method: 'POST', path: '/gists', expectedStatus: [201],
			body: { toJSON() { serializations++; return { description: 'unchanged\r\ntext' }; } },
		}, signal(), parseValue);

		assert.deepStrictEqual({ serializations, body, authenticatedRequest, response }, {
			serializations: 1, body: '{"description":"unchanged\\r\\ntext"}', authenticatedRequest: true,
			response: { data: { value: 2 }, status: 201 },
		});
	});

	test('accepts serialized request text and returns response text without decoding either', async () => {
		const bodyText = ' {\n "description" : "value" \n} ';
		const responseText = ' not JSON \r\n';
		let body: RequestInit['body'];
		const provider = authenticated(async (_input, init) => {
			body = init?.body;
			return new Response(responseText, { status: 201 });
		});
		const response = await provider.requestText({ method: 'POST', path: '/gists', expectedStatus: [201] }, signal(), bodyText);
		assert.deepStrictEqual({ body, response }, { body: bodyText, response: { data: responseText, status: 201 } });
	});

	test('projects a validated manual redirect without exposing headers', async () => {
		const provider = authenticated(async (_input, init) => {
			assert.strictEqual(init?.redirect, 'manual');
			return new Response(null, { status: 302, headers: { location: 'https://objects.example.test/job.log?signature=opaque' } });
		});
		const client = new ActionsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual([
			await client.getJobLogRedirect({ owner: 'o', name: 'r' }, 42, signal()),
			await client.getRunLogRedirect({ owner: 'o', name: 'r' }, 42, signal()),
		], [
			{ url: 'https://objects.example.test/job.log?signature=opaque' },
			{ url: 'https://objects.example.test/job.log?signature=opaque' },
		]);
	});

	for (const location of [undefined, 'http://objects.example.test/job.log', 'https://user@objects.example.test/job.log', 'https://[invalid']) {
		test(`rejects an invalid manual redirect target: ${String(location)}`, async () => {
			const provider = authenticated(async () => new Response(null, {
				status: 302,
				headers: location === undefined ? undefined : { location },
			}));
			const client = new ActionsClient(new CoreClient(provider, provider));
			for (const method of ['getJobLogRedirect', 'getRunLogRedirect'] as const) {
				await assert.rejects(client[method]({ owner: 'o', name: 'r' }, 42, signal()), {
					kind: location === undefined || location === 'https://[invalid' ? 'malformedResponse' : 'authorization',
					statusCode: 302,
				});
			}
		});
	}

	test('returns the original success status after conditional revalidation', async () => {
		const validators: (string | null)[] = [];
		const provider = anonymous(async (_input, init) => {
			const etag = new Headers(init?.headers).get('If-None-Match');
			validators.push(etag);
			return etag ? new Response(null, { status: 304 })
				: Response.json({ value: 1 }, { status: 202, headers: { etag: '"first"' } });
		});
		const request = { ...read, expectedStatus: [200, 202] };
		const first = await provider.request(request, signal(), parseValue);
		const second = await provider.request(request, signal(), parseValue);
		assert.deepStrictEqual({ first, second, validators }, {
			first: { data: { value: 1 }, status: 202 }, second: { data: { value: 1 }, status: 202 },
			validators: [null, '"first"'],
		});
	});

	test('preserves empty text instead of treating it as an absent JSON body', async () => {
		const provider = anonymous(async () => new Response(''));
		assert.deepStrictEqual(await provider.request({ ...read, responseBody: 'text' }, signal(), parse.string), {
			data: '', status: 200,
		});
	});

	for (const [method, status] of [['HEAD', 200], ['GET', 204], ['GET', 205]] as const) {
		test(`supports bodyless ${method} responses with status ${status}`, async () => {
			const provider = anonymous(async () => new Response(null, { status }));
			assert.deepStrictEqual(await provider.request({
				method, path: read.path, expectedStatus: status, responseBody: 'none',
			}, signal()), { data: undefined, status });
		});
	}

	test('discards acknowledgement bodies without parsing or waiting for them', async () => {
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({ cancel: () => { cancelled = true; } }, { highWaterMark: 0 });
		const provider = authenticated(async () => new Response(stream, { status: 202 }));
		const response = await provider.request({
			method: 'POST', path: '/repos/o/r/actions/runs/1/cancel', expectedStatus: [202], responseBody: 'none',
		}, signal());
		assert.deepStrictEqual({ response, cancelled, locked: stream.locked }, {
			response: { data: undefined, status: 202 }, cancelled: true, locked: false,
		});
	});

	test('rejects authenticated operations and mutations on an anonymous provider', async () => {
		const provider = anonymous(async () => assert.fail('No fetch expected'));
		await assert.rejects(provider.request({ ...read, authentication: 'required' }, signal(), parseValue), { kind: 'authentication' });
		await assert.rejects(provider.request({ ...read, method: 'POST', body: {} }, signal(), parseValue), { kind: 'authentication' });
	});

	test('rejects invalid API and raw-content endpoints before dispatch', () => {
		const transport = store.add(new GitHubTransport(async () => assert.fail('No fetch expected')));
		for (const endpoint of ['', 'not a URL', 'http://api.github.com', 'https://user@api.github.com', 'https://api.github.com?secret=value', 'https://api.github.com#fragment']) {
			for (const target of ['rest', 'rawContent'] as const) {
				assert.throws(() => new LocalApiRequestProvider(endpoint, transport, undefined, target), function isValidationError(error: unknown) {
					return error instanceof GitHubRequestError && error.kind === 'validation';
				});
			}
		}
	});

	test('confines requests to the configured Enterprise API base', async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			requests.push(String(input));
			return Response.json({ value: 1 });
		}));
		const provider = new LocalApiRequestProvider('https://enterprise.example.test/api/v3/', transport);
		await provider.request(read, signal(), parseValue);
		for (const path of ['/../outside', '/%2e%2e/outside', '//other.example.test/endpoint', '/repos/o/r#fragment', 'https://other.example.test', '/../../outside', '/%2e%2e/%2e%2e/outside', '/repos\\owner']) {
			await assert.rejects(provider.request({ ...read, path }, signal(), parseValue));
		}
		assert.deepStrictEqual(requests, ['https://enterprise.example.test/api/v3/repos/o/r']);
	});

	for (const location of ['https://other.example.test/data', '/outside', '../outside', '/api/v30/outside', '/api/v3/../outside', '/api/v3/%2e%2e/outside', '/api/v3']) {
		test(`rejects anonymous redirects outside the API base: ${location}`, async () => {
			const baseUri = 'https://enterprise.example.test/api/v3';
			const requests: string[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				requests.push(String(input));
				return new Response(null, { status: 302, headers: { location } });
			}));
			const provider = new LocalApiRequestProvider(`${baseUri}///`, transport);
			await assert.rejects(provider.request({ ...read, path: '/old' }, signal(), parseValue), { kind: 'authorization' });
			await assert.rejects(provider.request({ ...read, path: '/old' }, signal(), parseValue), { kind: 'authorization' });
			assert.deepStrictEqual(requests, [`${baseUri}/old`, `${baseUri}/old`]);
		});
	}

	test('redirects within the normalized API base retain conditional caching without credentials', async () => {
		const baseUri = 'https://enterprise.example.test/api/v3';
		const requests: { url: string; etag: string | null; credentialless: boolean }[] = [];
		const transport = store.add(new GitHubTransport(async (input, init) => {
			const headers = new Headers(init?.headers);
			const etag = headers.get('If-None-Match');
			requests.push({ url: String(input), etag, credentialless: init?.credentials === 'omit' && !headers.has('Authorization') });
			return String(input) === `${baseUri}/old` ? new Response(null, { status: 301, headers: { location: 'renamed' } })
				: etag ? new Response(null, { status: 304 }) : Response.json({ value: 1 }, { headers: { etag: '"public"' } });
		}));
		const provider = new LocalApiRequestProvider('https://enterprise.example.test/ignored/../api/v3///', transport);
		await provider.request({ ...read, path: '/old' }, signal(), parseValue);
		const reused = await provider.request({ ...read, path: '/old' }, signal(), parseValue);
		assert.deepStrictEqual({ requests, reused }, {
			requests: [
				{ url: `${baseUri}/old`, etag: null, credentialless: true },
				{ url: `${baseUri}/renamed`, etag: null, credentialless: true },
				{ url: `${baseUri}/renamed`, etag: '"public"', credentialless: true },
			],
			reused: { status: 200, data: { value: 1 } },
		});
	});

	test('cached redirects cannot subsequently escape the API base', async () => {
		const baseUri = 'https://enterprise.example.test/api/v3';
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			requests.push(String(input));
			return requests.length === 1 ? new Response(null, { status: 302, headers: { location: '/api/v3/renamed' } })
				: requests.length === 2 ? Response.json({ value: 1 }, { headers: { etag: '"one"' } })
					: new Response(null, { status: 307, headers: { location: '/outside' } });
		}));
		const provider = new LocalApiRequestProvider(baseUri, transport);
		await provider.request({ ...read, path: '/old' }, signal(), parseValue);
		await assert.rejects(provider.request({ ...read, path: '/old' }, signal(), parseValue), { kind: 'authorization' });
		assert.deepStrictEqual(requests, [`${baseUri}/old`, `${baseUri}/renamed`, `${baseUri}/renamed`]);
	});

	test('normalizes raw-content endpoints while retaining their base paths', async () => {
		const requests: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			requests.push(String(input));
			return new Response('contents');
		}));
		const path = `/o/r/${'a'.repeat(40)}/file.txt`;
		const results: string[] = [];
		for (const baseUri of ['https://RAW.GITHUBUSERCONTENT.COM///', 'https://enterprise.example.test/raw///']) {
			const provider = new LocalApiRequestProvider(baseUri, transport, undefined, 'rawContent');
			results.push((await provider.request({ method: 'GET', path, expectedStatus: 200, responseBody: 'text' }, signal(), parse.string)).data);
		}
		assert.deepStrictEqual({ results, requests }, {
			results: ['contents', 'contents'],
			requests: [`https://raw.githubusercontent.com${path}`, `https://enterprise.example.test/raw${path}`],
		});
	});

	test('raw file reads require a raw-content provider', async () => {
		const content = new ContentClient(anonymous(async () => assert.fail('No fetch expected')));
		await assert.rejects(content.getRawFile('o', 'r', 'a'.repeat(40), 'file.txt', signal()), { kind: 'validation' });
	});

	test('rejects GET bodies before fetching', async () => {
		const provider = anonymous(async () => assert.fail('No fetch expected'));
		await assert.rejects(provider.request({ ...read, body: {} }, signal(), parseValue), { kind: 'validation' });
	});

	test('rejects unexpected statuses and invalid JSON without retrying', async () => {
		for (const response of [() => new Response('{}', { status: 202 }), () => new Response('{')]) {
			let attempts = 0;
			const provider = anonymous(async () => { attempts++; return response(); });
			await assert.rejects(provider.request(read, signal(), parseValue), { kind: 'malformedResponse' });
			assert.strictEqual(attempts, 1);
		}
	});

	test('surfaces schema failures and enforces bounded text responses', async () => {
		const invalid = anonymous(async () => Response.json({ value: 'not a number' }));
		const oversized = anonymous(async () => new Response('12345'), { maximumResponseBytes: 4 });
		await assert.rejects(invalid.request(read, signal(), parseValue), SchemaError);
		await assert.rejects(invalid.request(read, signal(), undefined), { kind: 'malformedResponse', statusCode: 200 });
		await assert.rejects(oversized.request({ ...read, responseBody: 'text' }, signal(), parse.string), { kind: 'responseTooLarge' });
	});

	test('does not replay an authenticated mutation after a body failure', async () => {
		let attempts = 0;
		const provider = authenticated(async () => {
			attempts++;
			return new Response(new ReadableStream<Uint8Array>({ start: controller => controller.error(new Error('body failed')) }));
		});
		await assert.rejects(provider.request({ ...read, method: 'POST', body: {} }, signal(), parseValue), { kind: 'network' });
		assert.strictEqual(attempts, 1);
	});

	test('detaches a cancelled caller without cancelling a coalesced peer', async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<Response>();
		let attempts = 0;
		let networkSignal: AbortSignal | undefined;
		const provider = anonymous(async (_input, init) => {
			attempts++;
			networkSignal = init?.signal ?? undefined;
			void started.complete();
			return release.p;
		});
		const controller = new AbortController();
		const reason = new Error('caller cancelled');
		const first = assert.rejects(provider.request(read, controller.signal, parseValue), error => error === reason);
		await started.p;
		const second = provider.request(read, signal(), parseValue);
		controller.abort(reason);
		await first;
		const peerAborted = networkSignal?.aborted;
		await release.complete(Response.json({ value: 1 }));
		assert.deepStrictEqual({ attempts, peerAborted, response: await second }, {
			attempts: 1, peerAborted: false, response: { data: { value: 1 }, status: 200 },
		});
	});

	test('honors cancellation and expired deadlines before credential resolution', async () => {
		let credentials = 0;
		const provider = authenticated(async () => assert.fail('No fetch expected'), () => { credentials++; return 'test-token'; });
		const controller = new AbortController();
		const reason = new Error('already cancelled');
		controller.abort(reason);
		await assert.rejects(provider.request(read, controller.signal, parseValue), error => error === reason);
		await assert.rejects(provider.request({ ...read, options: { deadline: Date.now() - 1 } }, signal(), parseValue), {
			kind: 'timeout', requestDispatched: false,
		});
		assert.strictEqual(credentials, 0);
	});

	test('bounds stalled credential resolution by the caller deadline', () => runWithFakedTimers({}, async () => {
		const token = new DeferredPromise<string>();
		let credentialSignal: AbortSignal | undefined;
		const provider = authenticated(async () => assert.fail('No fetch expected'), (_context, signal) => {
			credentialSignal = signal;
			return token.p;
		});
		await assert.rejects(provider.request({ ...read, options: { deadline: Date.now() + 10 } }, signal(), parseValue), {
			kind: 'timeout', requestDispatched: false,
		});
		await token.complete('late-token');
		assert.strictEqual(credentialSignal?.aborted, true);
	}));

	test('retains dispatch evidence when an authenticated mutation times out', () => runWithFakedTimers({}, async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<Response>();
		const provider = authenticated(async () => {
			void started.complete();
			return release.p;
		});
		const rejected = assert.rejects(provider.request({
			...read, method: 'POST', body: {}, options: { deadline: Date.now() + 10 },
		}, signal(), parseValue), { kind: 'timeout', requestDispatched: true });
		await started.p;
		await rejected;
		await release.complete(Response.json({ value: 1 }));
	}));

	test('renews the selected credential without reusing its previous cached response', async () => {
		let token = 'first-token';
		const validators: (string | null)[] = [];
		const provider = authenticated(async (_input, init) => {
			validators.push(new Headers(init?.headers).get('If-None-Match'));
			return Response.json({ value: validators.length }, { headers: { etag: `"${validators.length}"` } });
		}, () => token);
		const first = await provider.request(read, signal(), parseValue);
		token = 'second-token';
		const second = await provider.request(read, signal(), parseValue);
		assert.deepStrictEqual({ first, second, validators }, {
			first: { data: { value: 1 }, status: 200 }, second: { data: { value: 2 }, status: 200 },
			validators: [null, null],
		});
	});

	test('reports a refused credential without replaying the request', async () => {
		let attempts = 0;
		let invalidations = 0;
		const provider = authenticated(async () => {
			attempts++;
			return Response.json({ message: 'Bad credentials' }, { status: 401 });
		}, undefined, () => { invalidations++; });
		await assert.rejects(provider.request({ ...read, method: 'POST', body: {} }, signal(), parseValue), { kind: 'authentication' });
		assert.deepStrictEqual({ attempts, invalidations }, { attempts: 1, invalidations: 1 });
	});

	test('does not send a credential to a different API host', async () => {
		const transport = store.add(new GitHubTransport(async () => assert.fail('No fetch expected')));
		const credentials = new class extends mock<IGitHubCredentials>() {
			override async getCredential() {
				return { token: 'test-token', account: { host: 'other.example.test', accountId: '101' }, generation: 1, signal: signal() };
			}
		}();
		const provider = new LocalApiRequestProvider(apiBaseUri, transport, credentials);
		await assert.rejects(provider.request(read, signal(), parseValue), { kind: 'authorization' });
	});

	suite('Core domain results', () => {
		const repository = {
			id: 1, node_id: 'R_1', name: 'r', full_name: 'o/r', private: true,
			owner: { id: 2, node_id: 'U_2', login: 'o', avatar_url: '', html_url: 'https://github.com/o', type: 'User' },
			html_url: 'https://github.com/o/r', url: `${apiBaseUri}/repos/o/r`, description: null, fork: false,
			default_branch: 'main', clone_url: 'https://github.com/o/r.git', ssh_url: 'git@github.com:o/r.git',
			archived: false, disabled: false, language: null, stargazers_count: 0,
		};
		const ref = { owner: 'o', name: 'r' };

		test('REST page collection is opt-in, counts the initial page, and does not probe beyond the limit', async () => {
			const email = { email: 'user@example.test', primary: false, verified: true, visibility: null };
			for (const options of [
				{}, { maxPages: 2 }, { maxPages: 1 }, { maxPages: 1, pageLimitBehavior: 'returnPartial' },
			] satisfies PaginationOptions[]) {
				const urls: string[] = [];
				const provider = authenticated(async input => {
					const url = String(input);
					urls.push(url);
					const page = new URL(url).searchParams.get('page');
					return Response.json([{ ...email, email: `${page}@example.test` }], {
						headers: page === '3' ? { link: `<?page=4&per_page=1>; rel="next"` } : {},
					});
				});
				const client = new UsersClient(new CoreClient(provider, provider));
				const request = client.listEmails(signal(), { ...options, query: { page: 3, per_page: 1 } });
				if (options.maxPages === 1 && options.pageLimitBehavior !== 'returnPartial') {
					await assert.rejects(request, PaginationLimitError);
					assert.deepStrictEqual(urls, [`${apiBaseUri}/user/emails?page=3&per_page=1`]);
				} else {
					assert.deepStrictEqual({ emails: await request, urls }, {
						emails: (options.maxPages === 2 ? ['3', '4'] : ['3']).map(page => ({ ...email, email: `${page}@example.test` })),
						urls: [
							`${apiBaseUri}/user/emails?page=3&per_page=1`,
							...(options.maxPages === 2 ? [`${apiBaseUri}/user/emails?page=4&per_page=1`] : []),
						],
					});
				}
			}
		});

		test('collects canonical REST continuation paths within the Enterprise API base', async () => {
			const apiBase = 'https://enterprise.example.test/api/v3';
			const branch = { name: 'main', commit: { sha: 'commit', url: `${apiBase}/repos/o/r/commits/main` }, protected: false };
			const urls: string[] = [];
			const transport = store.add(new GitHubTransport(async input => {
				urls.push(String(input));
				return Response.json([branch], {
					headers: urls.length === 1 ? { link: `<${apiBase}/repositories/1/branches?page=2>; rel="next"` } : {},
				});
			}));
			const provider = new LocalApiRequestProvider(apiBase, transport);
			const client = new RepositoriesClient(new CoreClient(provider, provider));
			assert.deepStrictEqual({
				branches: await client.listBranches(ref, signal(), { maxPages: 2 }),
				urls,
			}, {
				branches: [branch, branch],
				urls: [`${apiBase}/repos/o/r/branches`, `${apiBase}/repositories/1/branches?page=2`],
			});
		});

		test('rejects invalid or repeated REST continuations even when partial results are allowed', async () => {
			const base = 'https://enterprise.example.test/api/v3';
			for (const link of [
				'<https://elsewhere.example.test/repos?page=2>; rel="next"',
				'<http://enterprise.example.test/api/v3/user/repos?page=2>; rel="next"',
				'<https://user@enterprise.example.test/api/v3/user/repos?page=2>; rel="next"',
				'</outside?page=2>; rel="next"',
				'<?page=2#fragment>; rel="next"',
				'<https://[invalid>; rel="next"',
				'not-a-link; rel="next"',
				'<https://enterprise.example.test/api/v3/user/repos>; rel="next"',
			]) {
				let calls = 0;
				const transport = store.add(new GitHubTransport(async () => {
					calls++;
					return Response.json([], { headers: { link } });
				}));
				const provider = new LocalApiRequestProvider(base, transport);
				const client = new RepositoriesClient(new CoreClient(provider, provider));
				await assert.rejects(client.listForOrganization('o', signal(), { maxPages: 3, pageLimitBehavior: 'returnPartial' }), { kind: 'malformedResponse' });
				assert.ok(calls <= 2);
			}
		});

		test('rejects invalid pagination limits before making requests', async () => {
			const provider = authenticated(async () => assert.fail('No request expected'));
			const client = new UsersClient(new CoreClient(provider, provider));
			for (const maxPages of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				await assert.rejects(client.listEmails(signal(), { maxPages }), { kind: 'validation' });
			}
		});

		test('single-page REST limits validate continuations even when partial results are allowed', async () => {
			for (const link of ['not-a-link; rel="next"', `<${apiBaseUri}/user/emails>; rel="next"`]) {
				let calls = 0;
				const provider = authenticated(async () => {
					calls++;
					return Response.json([], { headers: { link } });
				});
				const client = new UsersClient(new CoreClient(provider, provider));
				await assert.rejects(client.listEmails(signal(), { maxPages: 1, pageLimitBehavior: 'returnPartial' }), { kind: 'malformedResponse' });
				assert.strictEqual(calls, 1);
			}
		});

		test('later-page HTTP and schema failures do not become partial successful results', async () => {
			for (const failure of ['http', 'schema'] as const) {
				let calls = 0;
				const provider = authenticated(async () => {
					if (++calls === 1) {
						return Response.json([], { headers: { link: '<?page=2>; rel="next"' } });
					}
					return failure === 'http' ? Response.json({ message: 'Denied' }, { status: 403 }) : Response.json([{}]);
				});
				const client = new UsersClient(new CoreClient(provider, provider));
				await assert.rejects(client.listEmails(signal(), { maxPages: 3, pageLimitBehavior: 'returnPartial' }),
					failure === 'http' ? { kind: 'authorization' } : SchemaError);
				assert.strictEqual(calls, 2);
			}
		});

		test('uses one absolute deadline for every collected REST page', () => runWithFakedTimers({}, async () => {
			let calls = 0;
			const provider = authenticated(async () => {
				calls++;
				await timeout(6);
				return Response.json([], { headers: { link: `<?page=${calls + 1}>; rel="next"` } });
			});
			const client = new UsersClient(new CoreClient(provider, provider));
			await assert.rejects(client.listEmails(signal(), {
				deadline: Date.now() + 10, maxPages: 3, pageLimitBehavior: 'returnPartial',
			}), { kind: 'timeout' });
			assert.strictEqual(calls, 2);
		}));

		test('cancellation during collection rejects rather than returning earlier pages', async () => {
			const controller = new AbortController();
			const reason = new Error('Cancelled');
			let calls = 0;
			const provider = authenticated(async () => {
				if (++calls === 2) {
					controller.abort(reason);
				}
				return Response.json([], { headers: { link: '<?page=2>; rel="next"' } });
			});
			const client = new UsersClient(new CoreClient(provider, provider));
			await assert.rejects(client.listEmails(controller.signal, { maxPages: 3, pageLimitBehavior: 'returnPartial' }), error => error === reason);
			assert.strictEqual(calls, 2);
		});

		test('merges search items without summing totals or losing incomplete-result flags', async () => {
			const item = { ...repository, score: 1 };
			let calls = 0;
			const provider = anonymous(async () => Response.json({
				items: [{ ...item, id: ++calls }], total_count: calls === 1 ? 2 : 3, incomplete_results: calls === 1,
			}, { headers: calls === 1 ? { link: '<?page=2>; rel="next"' } : {} }));
			const client = new SearchClient(new CoreClient(provider, provider));
			const result = await client.repositories('repo', signal(), { maxPages: 2 });
			assert.deepStrictEqual({
				ids: result.items.map(item => item.id), total: result.total_count, incomplete: result.incomplete_results, calls,
			}, { ids: [1, 2], total: 3, incomplete: true, calls: 2 });
		});

		test('collects commit files and comparison commits without dropping first-page comparison files', async () => {
			const file = {
				sha: 'blob', filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, changes: 1,
				blob_url: 'https://github.com/o/r/blob/main/a.ts',
			};
			const commit = {
				sha: 'sha', node_id: 'C_1', html_url: 'https://github.com/o/r/commit/sha', url: `${apiBaseUri}/repos/o/r/commits/sha`,
				commit: { message: 'Message', author: null, committer: null, tree: { sha: 'tree', url: `${apiBaseUri}/repos/o/r/git/trees/tree` } },
				author: null, committer: null, parents: [],
			};
			const comparison = {
				html_url: 'https://github.com/o/r/compare/base...head', status: 'ahead', ahead_by: 2, behind_by: 0, total_commits: 2,
				base_commit: commit, merge_base_commit: commit,
			};
			const provider = anonymous(async input => {
				const url = new URL(String(input));
				const second = url.searchParams.get('page') === '2';
				const data = url.pathname.includes('/compare/') ? {
					...comparison, commits: [{ ...commit, sha: second ? 'second' : 'first' }],
					...(second ? {} : { files: [file] }),
				} : { ...commit, files: [{ ...file, filename: second ? 'b.ts' : 'a.ts' }] };
				return Response.json(data, { headers: second ? {} : { link: '<?page=2>; rel="next"' } });
			});
			const client = new RepositoriesClient(new CoreClient(provider, provider));
			assert.deepStrictEqual({
				commit: await client.getCommit(ref, 'sha', signal(), { maxPages: 2 }),
				comparison: await client.compare(ref, 'base', 'head', signal(), { maxPages: 2 }),
			}, {
				commit: { ...commit, files: [file, { ...file, filename: 'b.ts' }] },
				comparison: { ...comparison, files: [file], commits: [{ ...commit, sha: 'first' }, { ...commit, sha: 'second' }] },
			});
		});

		test('returns repository objects and arrays directly, including accepted fork creation', async () => {
			const provider = authenticated(async (input, init) => Response.json(
				new URL(String(input)).pathname === '/user/repos' ? [repository] : repository,
				{ status: init?.method === 'POST' ? 202 : 200, headers: { etag: '"repository"' } },
			));
			const client = new RepositoriesClient(new CoreClient(provider, provider));
			assert.deepStrictEqual({
				repository: await client.get(ref, signal()),
				repositories: await client.listForAuthenticatedUser(signal()),
				fork: await client.fork(ref, {}, signal()),
			}, { repository, repositories: [repository], fork: repository });
		});

		test('validates HTTP status before returning a direct domain value', async () => {
			const provider = authenticated(async () => Response.json(repository, { status: 201 }));
			const client = new RepositoriesClient(new CoreClient(provider, provider));
			await assert.rejects(client.get(ref, signal()), { kind: 'malformedResponse', statusCode: 201 });
			await assert.rejects(client.fork(ref, {}, signal()), { kind: 'malformedResponse', statusCode: 201 });
		});

		test('preserves missing and null submission times on pending reviews', async () => {
			const review = {
				id: 1, node_id: 'PRR_1', user: null, body: 'Draft', state: 'PENDING',
				commit_id: null, html_url: 'https://github.com/o/r/pull/1#pullrequestreview-1',
			};
			for (const expected of [review, { ...review, submitted_at: null }]) {
				const provider = authenticated(async () => Response.json([expected]));
				const client = new ReviewsClient(new CoreClient(provider, provider));
				assert.deepStrictEqual(await client.list(ref, 1, signal()), [expected]);
			}
		});

		test('preserves issue search metadata and validates update timestamps', async () => {
			const issue = {
				id: 1, node_id: 'I_1', number: 1, title: 'Issue title', html_url: 'https://github.com/o/r/issues/1',
				repository_url: `${apiBaseUri}/repos/o/r`, state: 'open', updated_at: '2026-10-14T01:00:00+01:00',
				user: null, score: 1,
			};
			const page = { total_count: 1_001, incomplete_results: true, items: [issue] };
			let updatedAt: string | number | null | undefined = issue.updated_at;
			const provider = anonymous(async () => Response.json({ ...page, items: [{ ...issue, updated_at: updatedAt }] }));
			const client = new SearchClient(new CoreClient(provider, provider));
			assert.deepStrictEqual([
				await client.issues('repo:o/r', signal(), { query: { page: 2, per_page: 100 } }),
				await client.issuesAndPullRequests('repo:o/r', signal()),
			], [page, page]);
			for (const invalid of [undefined, null, 42, 'not-a-date', '2026-10-14T01:00:00']) {
				updatedAt = invalid;
				await assert.rejects(client.issues('repo:o/r', signal()), SchemaError);
			}
		});

		test('returns diff text directly without JSON parsing or transport metadata', async () => {
			const diff = 'diff --git a/a.txt b/a.txt\n+line\n';
			const provider = authenticated(async () => new Response(diff));
			const client = new PullRequestsClient(new CoreClient(provider, provider));
			assert.strictEqual(await client.getDiff(ref, 1, 'diff', signal()), diff);
		});

		test('unwraps JSON, text, and bodyless responses while preserving domain fields', async () => {
			const value = { data: ['payload'], status: 'domain-status' };
			const provider = anonymous(async (_input, init) => init?.method === 'HEAD' ? new Response(null) : Response.json(value));
			const client = new CoreClient(provider, provider);
			const parser = parse.object({ data: parse.strings, status: parse.string });
			assert.deepStrictEqual([
				await client.request(read, signal(), parser),
				await client.request({ ...read, responseBody: 'json' }, signal(), parser),
				await client.request({ ...read, responseBody: 'text' }, signal(), parse.string),
				await client.request({ ...read, method: 'HEAD', responseBody: 'none' }, signal()),
			], [value, value, JSON.stringify(value), undefined]);
		});

		for (const status of [200, 201]) {
			test(`returns the reaction directly for HTTP ${status}`, async () => {
				const reaction = { id: 1, node_id: 'REA_1', user: null, content: '+1', created_at: '2026-01-01T00:00:00Z' };
				const provider = authenticated(async () => Response.json(reaction, { status }));
				const client = new IssuesClient(new CoreClient(provider, provider));
				assert.deepStrictEqual(await client.createReaction(ref, { kind: 'issue', number: 1 }, '+1', signal()), reaction);
			});
		}
	});

	suite('GraphQL', () => {
		const query = 'query Viewer($name: String) { viewer { login } }';
		const mutation = 'mutation Update { updateIssue(input: {}) { clientMutationId } }';
		const request: ApiRequest & { readonly responseBody: 'json' } = {
			method: 'POST', path: '/', expectedStatus: [200], responseBody: 'json', authentication: 'required',
		};
		const parseViewer = parse.object({ viewer: parse.object({ login: parse.string }) });

		function graphql(fetch: RequestFetch): LocalApiRequestProvider {
			return authenticated(fetch, undefined, undefined, 'graphql');
		}

		test('serializes variables once and parses data in the core client', async () => {
			let serializations = 0;
			const requests: { url: string; body: RequestInit['body']; method: string | undefined; authorization: boolean }[] = [];
			const provider = graphql(async (input, init) => {
				requests.push({ url: String(input), body: init?.body, method: init?.method, authorization: new Headers(init?.headers).has('Authorization') });
				return Response.json({ data: { viewer: { login: 'viewer' } } });
			});
			const core = new CoreClient(provider, provider);
			const result = await core.graphql(query, { toJSON() { serializations++; return { name: 'value\n"quoted"' }; } }, signal(), parseViewer);
			assert.deepStrictEqual({ result, serializations, requests }, {
				result: { viewer: { login: 'viewer' } }, serializations: 1,
				requests: [{ url: `${apiBaseUri}/graphql`, body: JSON.stringify({ query, variables: { name: 'value\n"quoted"' } }), method: 'POST', authorization: true }],
			});
		});

		test('preserves request and response text without reserializing either', async () => {
			const bodyText = ` {\n "query" : ${JSON.stringify(query)}, "variables" : { "name" : "value" } \n} `;
			const responseText = ' {\n "data" : { "viewer" : { "login" : "viewer" } }, "errors" : [] \n} ';
			const bodies: RequestInit['body'][] = [];
			const provider = graphql(async (_input, init) => { bodies.push(init?.body); return new Response(responseText); });
			assert.deepStrictEqual({ result: await provider.requestText(request, signal(), bodyText), bodies }, {
				result: { data: responseText, status: 200 }, bodies: [bodyText],
			});
		});

		for (const [type, kind] of [
			['FORBIDDEN', 'authorization'], ['NOT_FOUND', 'notFound'], ['RATE_LIMITED', 'rateLimit'], ['GRAPHQL_VALIDATION_FAILED', 'schema'],
		]) {
			test(`rejects partial GraphQL data before domain parsing for ${type}`, async () => {
				const errors = [{ message: 'Field failed', type, path: ['viewer', 'login'] }];
				const responseBody = JSON.stringify({ data: { viewer: { login: 'partial' } }, errors });
				let parses = 0;
				let calls = 0;
				const provider = graphql(async () => { calls++; return new Response(responseBody, { headers: { 'X-GitHub-Request-Id': 'graphql-request' } }); });
				await assert.rejects(new CoreClient(provider, provider).graphql(query, {}, signal(), value => {
					parses++;
					return parseViewer(value);
				}), (error: unknown) => {
					assert.ok(error instanceof GitHubRequestError);
					assert.deepStrictEqual({
						kind: error.kind, status: error.statusCode, errors: error.graphQLErrors,
						body: error.responseBody, requestId: error.responseMetadata?.requestId, parses, calls,
					}, { kind, status: 200, errors, body: responseBody, requestId: 'graphql-request', parses: 0, calls: 1 });
					return true;
				});
			});
		}

		test('classifies errors-only schema responses using extension codes', async () => {
			const errors = [{ message: 'Unknown field', extensions: { code: 'undefinedField' } }];
			const provider = graphql(async () => Response.json({ errors }));
			await assert.rejects(new CoreClient(provider, provider).graphql(query, {}, signal(), parseViewer), {
				kind: 'schema', statusCode: 200, graphQLErrors: errors,
			});
		});

		test('preserves explicitly null data when the domain parser permits it', async () => {
			const provider = graphql(async () => Response.json({ data: null }));
			assert.deepStrictEqual(await new CoreClient(provider, provider).graphql(query, {}, signal(), parse.nullable(parseViewer)), null);
		});

		for (const body of [
			'not JSON', 'null', '[]', '{}', '{"errors":[]}', '{"data":[]}', '{"data":1}',
			'{"data":{},"errors":null}', '{"data":{},"errors":"failed"}', '{"data":{},"errors":[null]}',
			'{"data":{},"errors":[{"path":[-1]}]}',
		]) {
			test(`rejects malformed GraphQL envelopes without retry: ${body}`, async () => {
				let calls = 0;
				const provider = graphql(async () => { calls++; return new Response(body); });
				await assert.rejects(new CoreClient(provider, provider).graphql(query, {}, signal(), parseViewer), { kind: 'malformedResponse', statusCode: 200 });
				assert.strictEqual(calls, 1);
			});
		}

		test('preserves domain schema failures and actual unexpected success statuses', async () => {
			let calls = 0;
			const provider = graphql(async () => Response.json({ data: {} }, { status: ++calls === 1 ? 200 : 202 }));
			const core = new CoreClient(provider, provider);
			await assert.rejects(core.graphql(query, {}, signal(), parseViewer), error => error instanceof SchemaError);
			await assert.rejects(core.graphql(query, {}, signal(), parseViewer), { kind: 'malformedResponse', statusCode: 202 });
			assert.strictEqual(calls, 2);
		});

		for (const operation of [query, mutation]) {
			for (const failure of ['network', 'body'] as const) {
				test(`only retries read failures (${failure}: ${operation})`, async () => {
					await runWithFakedTimers({}, async () => {
						let calls = 0;
						const provider = graphql(async () => {
							if (++calls === 1) {
								if (failure === 'network') {
									throw new TypeError('Network failed');
								}
								return new Response(new ReadableStream<Uint8Array>({
									start: controller => controller.error(new Error('Body failed')),
								}));
							}
							return Response.json({ data: { viewer: { login: 'viewer' } } });
						});
						const result = new CoreClient(provider, provider).graphql(operation, {}, signal(), parseViewer);
						if (operation === mutation) {
							await assert.rejects(result, { kind: 'network' });
						} else {
							assert.deepStrictEqual(await result, { viewer: { login: 'viewer' } });
						}
						assert.strictEqual(calls, operation === mutation ? 1 : 2);
					});
				});
			}
		}

		test('does not coalesce mutations', async () => {
			let calls = 0;
			const provider = graphql(async () => { calls++; return Response.json({ data: {} }); });
			const core = new CoreClient(provider, provider);
			await Promise.all([core.graphql(mutation, {}, signal(), parse.object({})), core.graphql(mutation, {}, signal(), parse.object({}))]);
			assert.strictEqual(calls, 2);
		});

		test('enforces the fixed GraphQL endpoint and JSON response mode', async () => {
			let calls = 0;
			const provider = graphql(async () => { calls++; return Response.json({ data: {} }); });
			for (const override of [
				{ path: '/other' }, { path: '/?query=x' }, { method: 'GET' }, { method: 'PATCH' },
				{ responseBody: 'text' }, { responseBody: 'none' }, { redirect: 'manual' }, { accept: 'application/vnd.github.diff' },
			] satisfies Partial<ApiRequest>[]) {
				await assert.rejects(provider.requestText({ ...request, ...override }, signal(), JSON.stringify({ query })), { kind: 'validation' });
			}
			await assert.rejects(provider.requestText(request, signal()), { kind: 'validation' });
			assert.strictEqual(calls, 0);
		});

		test('refuses operation selectors and other forged body shapes before GraphQL dispatch', async () => {
			let calls = 0;
			const provider = graphql(async () => { calls++; return Response.json({ data: {} }); });
			for (const bodyText of [
				'not JSON', 'null', '[]', '{}', '{"query":""}', '{"query":1}', '{"query":"query { viewer { id } }","variables":[]}',
				JSON.stringify({ query: `${query}\n${mutation}`, operationName: 'Update' }),
				JSON.stringify({ query, extensions: { persistedQuery: { sha256Hash: 'untrusted' } } }),
			]) {
				await assert.rejects(provider.requestText(request, signal(), bodyText), { kind: 'validation' });
			}
			assert.strictEqual(calls, 0);
		});

		test('requires credentials even when request metadata says authentication is optional', async () => {
			const transport = store.add(new GitHubTransport(async () => assert.fail('No anonymous GraphQL dispatch')));
			const provider = new LocalApiRequestProvider(`${apiBaseUri}/graphql`, transport, undefined, 'graphql');
			await assert.rejects(provider.requestText({ ...request, authentication: 'optional' }, signal(), JSON.stringify({ query })), { kind: 'authentication' });
			const client = new SearchClient(new CoreClient(provider, provider));
			await assert.rejects(client.pullRequests('repo:o/r', signal()), { kind: 'authentication' });
		});
	});
});
