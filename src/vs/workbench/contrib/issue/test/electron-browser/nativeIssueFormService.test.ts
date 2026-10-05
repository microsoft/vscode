/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, spy, useFakeTimers } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ChannelClient, ChannelServer, getDelayedChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { GITHUB_CHANNEL_NAME, GitHubAnonymousRequest, GitHubChannel, GitHubChannelClient, ISharedProcessGitHubService } from '../../../../../platform/github/common/githubIpc.js';
import { GitHubService, IGitHubService } from '../../../../../platform/github/common/githubService.js';
import { RequestFetch } from '../../../../../platform/github/common/types.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IGitHubUploadService } from '../../browser/githubUploadService.js';
import { NativeIssueFormService } from '../../electron-browser/nativeIssueFormService.js';

suite('NativeIssueFormService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => restore());

	function createSearchService(fetch: RequestFetch, ready?: Promise<void>, beforeResponse?: () => void) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuxiliaryWindowService, {});
		instantiationService.stub(IMenuService, {});
		instantiationService.stub(IClipboardService, {});
		instantiationService.stub(IConfigurationService, {});
		instantiationService.stub(IContextKeyService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IEnvironmentService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IHostService, {});
		instantiationService.stub(IGitHubUploadService, {});
		instantiationService.stub(IGitHubService, {
			acquireAnonymousClient: () => assert.fail('Desktop search must not acquire an in-process client'),
			acquireClient: () => assert.fail('Desktop search must not acquire an authenticated client'),
		});
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		instantiationService.stub(ILogService, logService);
		const credentialRequests: string[] = [];
		const engine = store.add(new GitHubService({
			fetch,
			credentialProvider: {
				onDidChange: Event.None,
				getToken: () => {
					credentialRequests.push('token');
					throw new Error('Issue search must never request credentials');
				},
			},
		}, logService, NullTelemetryService));
		const clientIncoming = store.add(new Emitter<VSBuffer>());
		const serverIncoming = store.add(new Emitter<VSBuffer>());
		const protocolClient = store.add(new ChannelClient({ onMessage: clientIncoming.event, send: data => serverIncoming.fire(data) }));
		const protocolServer = store.add(new ChannelServer({ onMessage: serverIncoming.event, send: data => clientIncoming.fire(data) }, 'window'));
		protocolServer.registerChannel(GITHUB_CHANNEL_NAME, new GitHubChannel(engine, logService));
		const channel = protocolClient.getChannel(GITHUB_CHANNEL_NAME);
		const client = new GitHubChannelClient(ready ? getDelayedChannel(ready.then(() => channel)) : channel);
		const calls: { request: GitHubAnonymousRequest; token: CancellationToken }[] = [];
		instantiationService.stub(ISharedProcessGitHubService, {
			getAnonymous: async <T>(request: GitHubAnonymousRequest, token: CancellationToken) => {
				calls.push({ request, token });
				const response = await client.getAnonymous<T>(request, token);
				beforeResponse?.();
				return response;
			},
		});
		return { service: store.add(instantiationService.createInstance(NativeIssueFormService)), calls, warnings, credentialRequests };
	}

	test('desktop searches use shared anonymous IPC with the encoded query and absolute deadline', () => runWithFakedTimers({}, async () => {
		const requests: Request[] = [];
		const { service, calls, credentialRequests } = createSearchService(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response('{"items":[{"html_url":"https://github.com/owner/repo/issues/1","title":"Issue title","state":"open","private":false}]}');
		});
		const title = 'title & labels #1';
		const deadline = Date.now() + 10_000;
		const results = await Promise.all([
			service.searchGitHubIssues('owner/repo', title, new AbortController().signal),
			service.searchGitHubIssues('owner/repo', title, new AbortController().signal),
		]);
		assert.deepStrictEqual({
			calls: calls.map(call => call.request),
			requests: requests.map(request => ({
				query: new URL(request.url).searchParams.get('q'), method: request.method,
				authorization: request.headers.get('Authorization'), credentials: request.credentials,
				referrerPolicy: request.referrerPolicy,
			})),
			credentialRequests,
			results,
		}, {
			calls: Array.from({ length: 2 }, () => ({
				apiBaseUri: 'https://api.github.com',
				path: `/search/issues?q=${encodeURIComponent(`is:issue repo:owner/repo ${title}`)}`,
				options: { caller: 'github.query', deadline },
			})),
			requests: [{ query: `is:issue repo:owner/repo ${title}`, method: 'GET', authorization: null, credentials: 'omit', referrerPolicy: 'no-referrer' }],
			credentialRequests: [],
			results: Array.from({ length: 2 }, () => [{ html_url: 'https://github.com/owner/repo/issues/1', title: 'Issue title', state: 'open' }]),
		});
	}));

	test('failed and malformed shared searches are logged and remain failures', async () => {
		let attempts = 0;
		const { service, warnings } = createSearchService(async () => {
			switch (++attempts) {
				case 1: return new Response('{"message":"Not Found"}', { status: 404 });
				case 2: return new Response('{"items":"not-an-array"}');
				default: return new Response('{"items":[{"title":"Missing issue URL"}]}');
			}
		});
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'first', new AbortController().signal), { kind: 'notFound' });
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'second', new AbortController().signal), { kind: 'malformedResponse' });
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'third', new AbortController().signal), { kind: 'malformedResponse' });
		assert.deepStrictEqual(warnings, Array(3).fill('[IssueFormService] GitHub issue search failed'));
	});

	test('already aborted or disposed forms never call the shared service', async () => {
		const { service, calls } = createSearchService(async () => assert.fail('no network'));
		const controller = new AbortController();
		const reason = new Error('superseded search');
		controller.abort(reason);
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', controller.signal), error => error === reason);
		service.dispose();
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', new AbortController().signal), /disposed/);
		assert.deepStrictEqual(calls, []);
	});

	for (const action of ['abort', 'dispose'] as const) {
		test(`${action} cancels shared work without warnings and releases a late response`, async () => {
			const started = new DeferredPromise<AbortSignal>();
			const response = new DeferredPromise<Response>();
			const released = new DeferredPromise<void>();
			const { service, calls, warnings } = createSearchService(async (_input, init) => {
				assert.ok(init?.signal);
				void started.complete(init.signal);
				return response.p;
			});
			const controller = new AbortController();
			const rejected = assert.rejects(service.searchGitHubIssues('owner/repo', 'query', controller.signal), isCancellationError);
			const signal = await started.p;
			if (action === 'abort') {
				controller.abort();
			} else {
				service.dispose();
			}
			await rejected;
			await response.complete(new Response(new ReadableStream({ cancel: () => { void released.complete(); } })));
			await released.p;
			assert.deepStrictEqual({
				tokenCancelled: calls[0].token.isCancellationRequested, fetchAborted: signal.aborted, warnings,
			}, { tokenCancelled: true, fetchAborted: true, warnings: [] });
		});
	}

	for (const failed of [false, true]) {
		test(`settled ${failed ? 'failed' : 'successful'} searches release the abort bridge`, async () => {
			const { service, calls } = createSearchService(async () => failed
				? new Response('{"message":"Not Found"}', { status: 404 })
				: new Response('{"items":[]}'));
			const controller = new AbortController();
			const add = spy(controller.signal, 'addEventListener');
			const remove = spy(controller.signal, 'removeEventListener');
			const pending = service.searchGitHubIssues('owner/repo', 'query', controller.signal);
			if (failed) {
				await assert.rejects(pending, { kind: 'notFound' });
			} else {
				assert.deepStrictEqual(await pending, []);
			}
			controller.abort();
			service.dispose();
			assert.deepStrictEqual({
				added: add.callCount, removed: remove.callCount,
				sameListener: add.firstCall.args[1] === remove.firstCall.args[1],
				tokenCancelled: calls[0].token.isCancellationRequested,
			}, { added: 1, removed: 1, sameListener: true, tokenCancelled: false });
		});
	}

	for (const action of ['abort', 'dispose', 'deadline'] as const) {
		test(`${action} settles before the shared process connects`, () => runWithFakedTimers({}, async () => {
			const ready = new DeferredPromise<void>();
			const { service, calls, warnings } = createSearchService(async () => assert.fail('cancelled work must not be dispatched'), ready.p);
			const controller = new AbortController();
			const start = Date.now();
			let settledAt: number | undefined;
			const rejected = assert.rejects(
				service.searchGitHubIssues('owner/repo', 'query', controller.signal),
				action === 'deadline' ? { kind: 'timeout' } : isCancellationError,
			);
			void rejected.then(() => { settledAt = Date.now(); });
			if (action === 'abort') {
				controller.abort();
			} else if (action === 'dispose') {
				service.dispose();
			}
			await timeout(action === 'deadline' ? 10_000 : 0);
			const settledBeforeConnection = settledAt;
			await ready.complete();
			await rejected;
			assert.deepStrictEqual({ settledBeforeConnection, tokenCancelled: calls[0].token.isCancellationRequested, warnings }, {
				settledBeforeConnection: start + (action === 'deadline' ? 10_000 : 0),
				tokenCancelled: true,
				warnings: action === 'deadline' ? ['[IssueFormService] GitHub issue search failed'] : [],
			});
		}));
	}

	for (const elapsed of [9_999, 10_000, 10_001]) {
		test(`IPC completion at ${elapsed}ms observes the wall-clock deadline before the timer runs`, async () => {
			const start = Date.now();
			const clock = useFakeTimers({ now: start, toFake: ['Date'] });
			try {
				const { service, warnings } = createSearchService(
					async () => new Response('{"items":[]}'),
					undefined,
					() => clock.setSystemTime(start + elapsed),
				);
				const pending = service.searchGitHubIssues('owner/repo', 'query', new AbortController().signal);
				if (elapsed < 10_000) {
					assert.deepStrictEqual(await pending, []);
				} else {
					await assert.rejects(pending, { kind: 'timeout' });
				}
				assert.deepStrictEqual(warnings, elapsed < 10_000 ? [] : ['[IssueFormService] GitHub issue search failed']);
			} finally {
				clock.restore();
			}
		});
	}

	test('the ten-second deadline stops shared work and surfaces a timeout', () => runWithFakedTimers({}, async () => {
		const started = new DeferredPromise<AbortSignal>();
		const response = new DeferredPromise<Response>();
		const released = new DeferredPromise<void>();
		const { service, warnings } = createSearchService(async (_input, init) => {
			assert.ok(init?.signal);
			void started.complete(init.signal);
			return response.p;
		});
		const start = Date.now();
		let settled = false;
		const rejected = assert.rejects(service.searchGitHubIssues('owner/repo', 'query', new AbortController().signal), { kind: 'timeout' });
		void rejected.then(() => { settled = true; });
		const signal = await started.p;
		await timeout(9_999);
		const settledBeforeDeadline = settled;
		await timeout(1);
		await rejected;
		const elapsed = Date.now() - start;
		await response.complete(new Response(new ReadableStream({ cancel: () => { void released.complete(); } })));
		await released.p;
		assert.deepStrictEqual({ settledBeforeDeadline, elapsed, aborted: signal.aborted, warnings }, {
			settledBeforeDeadline: false, elapsed: 10_000, aborted: true,
			warnings: ['[IssueFormService] GitHub issue search failed'],
		});
	}));
});
