/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { CloudSandboxProjectResolver } from '../../browser/cloudSandboxProjectResolver.js';
import { CloudSandboxProjectsClient } from '../../browser/cloudSandboxProjectsClient.js';
import { createCloudSandboxProject as project, createCloudSandboxProjectsTestConnection } from './cloudSandboxProjectsTestUtils.js';

class TestProgressService implements IProgressService {
	declare readonly _serviceBrand: undefined;
	readonly reports: IProgressStep[] = [];
	shown = 0;
	cancel: () => void = () => { };

	withProgress<R>(_options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
		this.shown++;
		this.cancel = () => onDidCancel?.();
		return task({ report: step => this.reports.push(step) });
	}
}

suite('CloudSandboxProjectResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const repository = URI.parse('https://github.com/owner/repo');
	const checkout = toAgentHostUri(URI.file('/checkout/owner/repo'), 'sandbox');

	function createHarness(options: {
		projects?: readonly unknown[];
		capability?: unknown;
		legacy?: boolean;
		request?: () => Promise<unknown>;
	} = {}) {
		const connection = createCloudSandboxProjectsTestConnection(store, options);
		const client = store.add(new CloudSandboxProjectsClient(connection.connection));
		const progress = new TestProgressService();
		const resolver = new CloudSandboxProjectResolver(progress);
		return { ...connection, client, resolver, progress };
	}

	for (const options of [{ legacy: true }, { capability: { available: false } }, { capability: { available: 'true' } }]) {
		test(`preserves the pre-cloned path without an advertised capability (${JSON.stringify(options)})`, async () => {
			const h = createHarness(options);
			const result = await h.resolver.resolve(h.client, repository, CancellationToken.None);
			assert.deepStrictEqual({ directory: result?.toString(), requests: h.requests, progress: h.progress.shown }, {
				directory: repository.toString(), requests: [], progress: 0,
			});
		});
	}

	test('leaves an existing filesystem working directory unchanged', async () => {
		const h = createHarness();
		const result = await h.resolver.resolve(h.client, checkout, CancellationToken.None);
		assert.deepStrictEqual({ directory: result?.toString(), requests: h.requests }, { directory: checkout.toString(), requests: [] });
	});

	test('reuses a ready checkout matched across SSH, case and .git spellings', async () => {
		const h = createHarness({ projects: [project({ remoteUrl: 'git@github.com:OWNER/REPO.git' })] });
		const result = await h.resolver.resolve(h.client, repository, CancellationToken.None);
		assert.deepStrictEqual({ directory: result?.toString(), requests: h.requests, progress: h.progress.shown }, {
			directory: checkout.toString(), requests: [], progress: 0,
		});
	});

	test('requests a shallow clone and waits for the catalogue to report ready', async () => {
		const h = createHarness();
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		await h.requested.p;
		h.setProjects([project({ status: 'cloning', git: false, progress: 40 })]);
		let completed = false;
		void result.then(() => completed = true);
		await Promise.resolve();
		const completedWhileCloning = completed;
		h.setProjects([project()]);
		assert.deepStrictEqual({
			directory: (await result)?.toString(),
			completedWhileCloning,
			requests: h.requests,
			reportedProgress: h.progress.reports.some(report => report.message?.includes('40%')),
			hasListeners: h.hasListeners(),
		}, {
			directory: checkout.toString(),
			completedWhileCloning: false,
			requests: [{ method: 'extensions/cloneProject', params: { url: repository.toString(), depth: 1 } }],
			reportedProgress: true,
			hasListeners: false,
		});
	});

	test('does not replace a ready catalogue entry with a late cloning response', async () => {
		const response = new DeferredPromise<unknown>();
		const h = createHarness({ request: () => response.p });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		await h.requested.p;
		h.setProjects([project()]);
		response.complete({ project: project({ status: 'cloning', git: false }) });
		assert.strictEqual((await result)?.toString(), checkout.toString());
	});

	test('joins a clone started by another client without starting another one', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([project()]);
		assert.deepStrictEqual({ directory: (await result)?.toString(), requests: h.requests }, { directory: checkout.toString(), requests: [] });
	});

	test('keeps newer catalogue progress without repeating or regressing announcements', async () => {
		const response = new DeferredPromise<unknown>();
		const h = createHarness({ request: () => response.p });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		await h.requested.p;
		h.setProjects([project({ status: 'cloning', progress: 40 })]);
		response.complete({ project: project({ status: 'cloning', progress: 0 }) });
		await timeout(0);
		h.setProjects([project({ status: 'cloning', progress: 40 })]);
		h.setProjects([project()]);
		await result;
		assert.deepStrictEqual(h.progress.reports, [
			{ message: 'Cloning owner/repo...' },
			{ message: 'Cloning owner/repo (40%)...', increment: 40 },
		]);
	});

	test('retries an existing failed clone on a new user attempt', async () => {
		const failed = project({ status: 'failed', git: false, error: 'Temporary network failure' });
		const response = new DeferredPromise<unknown>();
		const h = createHarness({ projects: [failed], request: () => response.p });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([failed]);
		response.complete({ project: project({ status: 'cloning', git: false }) });
		h.setProjects([project()]);
		assert.deepStrictEqual({ directory: (await result)?.toString(), requests: h.requests, hasListeners: h.hasListeners() }, {
			directory: checkout.toString(),
			requests: [{ method: 'extensions/cloneProject', params: { url: repository.toString(), depth: 1 } }],
			hasListeners: false,
		});
	});

	test('a clone failure ends the attempt but a user resend can recover', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const first = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([project({ status: 'failed', git: false, error: 'Temporary network failure' })]);
		await assert.rejects(first, /Temporary network failure/);
		const requestsAfterFailure = h.requests.length;
		const retry = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([project({ status: 'cloning', git: false })]);
		h.setProjects([project()]);
		assert.deepStrictEqual({ directory: (await retry)?.toString(), requestsAfterFailure, requestsAfterRetry: h.requests.length }, {
			directory: checkout.toString(), requestsAfterFailure: 0, requestsAfterRetry: 1,
		});
	});

	test('a failed retry is surfaced without an automatic retry loop', async () => {
		const failed = project({ status: 'failed', git: false, error: 'Repository access denied' });
		const h = createHarness({ projects: [failed], request: async () => ({ project: failed }) });
		await assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.None), /Repository access denied/);
		assert.deepStrictEqual({ requestCount: h.requests.length, hasListeners: h.hasListeners() }, { requestCount: 1, hasListeners: false });
	});

	test('ignores the previous failure until the retry publishes its catalogue state', async () => {
		const failed = project({ status: 'failed', git: false, error: 'Temporary network failure' });
		const h = createHarness({ projects: [failed] });
		let finished = false;
		const result = assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.None), /Temporary network failure/).then(() => {
			finished = true;
		});
		await timeout(0);
		h.setProjects([failed]);
		await timeout(0);
		const finishedBeforeRearm = finished;
		h.setProjects([project({ status: 'cloning', git: false })]);
		h.setProjects([failed]);
		await result;
		assert.deepStrictEqual({ finishedBeforeRearm, requestCount: h.requests.length, hasListeners: h.hasListeners() }, {
			finishedBeforeRearm: false, requestCount: 1, hasListeners: false,
		});
	});

	test('surfaces failure while a clone is running and releases its listeners', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([project({ status: 'failed', error: 'Clone failed on the host' })]);
		await assert.rejects(result, /Clone failed on the host/);
		assert.strictEqual(h.hasListeners(), false);
	});

	for (const response of [{}, { project: project({ remoteUrl: 'https://github.com/another/repository' }) }, { project: project({ path: 'relative/path' }) }]) {
		test(`rejects an invalid clone response (${JSON.stringify(response)})`, async () => {
			const h = createHarness({ request: async () => response });
			await assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.None), /invalid repository information/);
			assert.strictEqual(h.hasListeners(), false);
		});
	}

	test('rejects a malformed catalogue without invoking a clone', async () => {
		const h = createHarness({ projects: [{}] });
		await assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.None), /invalid repository information/);
		assert.deepStrictEqual(h.requests, []);
	});

	test('reports a project removed while cloning', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.setProjects([]);
		await assert.rejects(result, /removed while it was being prepared/);
	});

	test('propagates subscription failures', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.failSubscription(new Error('Connection closed'));
		await assert.rejects(result, /Connection closed/);
	});

	test('cancels even while the clone request has not returned', async () => {
		const cts = store.add(new CancellationTokenSource());
		const response = new DeferredPromise<unknown>();
		const h = createHarness({ request: () => response.p });
		const result = h.resolver.resolve(h.client, repository, cts.token);
		await h.requested.p;
		cts.cancel();
		await assert.rejects(result, CancellationError);
		assert.strictEqual(h.hasListeners(), false);
		response.complete({ project: project() });
	});

	test('supports cancellation from the progress notification', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.progress.cancel();
		await assert.rejects(result, CancellationError);
		assert.strictEqual(h.hasListeners(), false);
	});

	test('times out instead of leaving session creation waiting forever', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const start = Date.now();
		await assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.None), /Timed out/);
		assert.deepStrictEqual({ elapsed: Date.now() - start, hasListeners: h.hasListeners() }, { elapsed: 180_000, hasListeners: false });
	}));

	for (const readyBeforeResponse of [false, true]) {
		test(`times out an unacknowledged clone even when its catalogue is ready (${readyBeforeResponse})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const response = new DeferredPromise<unknown>();
			const h = createHarness({ request: () => response.p });
			const cts = store.add(new CancellationTokenSource());
			const start = Date.now();
			let elapsed: number | undefined;
			let message: string | undefined;
			const result = h.resolver.resolve(h.client, repository, cts.token).then(
				() => { message = 'Unexpected success'; },
				(error: Error) => {
					message = error.message;
					elapsed = Date.now() - start;
				},
			);
			try {
				await h.requested.p;
				if (readyBeforeResponse) {
					h.setProjects([project()]);
				}
				await timeout(180_001);
				assert.deepStrictEqual({ elapsed, message, hasListeners: h.hasListeners() }, {
					elapsed: 180_000,
					message: 'Timed out waiting for the remote repository to be prepared.',
					hasListeners: false,
				});
			} finally {
				cts.cancel();
				await result;
				response.complete({ project: project() });
			}
		}));
	}

	test('does not start a clone after cancellation', async () => {
		const h = createHarness();
		await assert.rejects(h.resolver.resolve(h.client, repository, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(h.requests, []);
	});

	test('closing the connection cancels a readiness wait and releases its subscriptions', async () => {
		const h = createHarness({ projects: [project({ status: 'cloning', git: false })] });
		const result = h.resolver.resolve(h.client, repository, CancellationToken.None);
		h.client.dispose();
		await assert.rejects(result, CancellationError);
		assert.strictEqual(h.hasListeners(), false);
	});
});
