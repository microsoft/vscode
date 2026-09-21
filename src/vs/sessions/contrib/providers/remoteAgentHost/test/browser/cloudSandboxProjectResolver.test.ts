/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: Remove this compatibility file after adopting a protocol release containing https://github.com/microsoft/agent-host-protocol/pull/451.

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostProject } from '../../../../../../platform/agentHost/common/meta/agentHostProjectMeta.js';
import { RootStateSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CloudSandboxProjectResolver } from '../../browser/cloudSandboxProjectResolver.js';

const repository = URI.parse('https://github.com/microsoft/vscode');

function project(overrides: Partial<IAgentHostProject> = {}): IAgentHostProject {
	return { id: 'checkout', path: '/workspaces/vscode', git: true, status: 'ready', remoteUrl: repository.toString(), ...overrides };
}

function rootState(projects: readonly unknown[], capability: unknown = { available: true }): RootState {
	return {
		agents: [],
		_meta: { 'copilot.projectManagement': capability },
		config: { schema: { type: 'object', properties: {} }, values: { copilot: { projects } } },
	};
}

function createResolver(store: Pick<DisposableStore, 'add'>, projects: readonly unknown[] = [], capability?: unknown) {
	const root = store.add(new RootStateSubscription('test-client', () => { }));
	root.handleSnapshot(rootState(projects, capability), 0);
	const reply = new DeferredPromise<unknown>();
	const requests: { method: string; params: { url: string; depth: number } }[] = [];
	const resolver = store.add(new CloudSandboxProjectResolver(root, (method, params) => {
		requests.push({ method, params });
		return reply.p;
	}));
	return { root, resolver, reply, requests };
}

suite('CloudSandboxProjectResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('requires an explicitly advertised capability', async () => {
		const results = [];
		for (const capability of [null, false, true, {}, { available: false }, { available: 'true' }, { available: 1 }]) {
			const { resolver, requests } = createResolver(store, [project()], capability);
			results.push({ directory: await resolver.prepareWorkingDirectory(repository, CancellationToken.None), requests });
		}
		assert.deepStrictEqual(results, Array.from({ length: 7 }, () => ({ directory: undefined, requests: [] })));
	});

	test('preserves the legacy path when metadata is absent', async () => {
		const { resolver, root, requests } = createResolver(store);
		root.handleSnapshot({ agents: [] }, 0);
		assert.deepStrictEqual({ directory: await resolver.prepareWorkingDirectory(repository, CancellationToken.None), requests }, { directory: undefined, requests: [] });
	});

	test('preserves directory and repository-less creation without cloning', async () => {
		const { resolver, requests } = createResolver(store);
		const results = [];
		for (const directory of [undefined, URI.file('/existing'), URI.parse('vscode-agent-host://host/existing')]) {
			results.push(await resolver.prepareWorkingDirectory(directory, CancellationToken.None));
		}
		assert.deepStrictEqual({ results, requests }, { results: [undefined, undefined, undefined], requests: [] });
	});

	test('reuses matching ready Git projects and tolerates unrelated malformed entries', async () => {
		const { resolver, requests } = createResolver(store, [
			null, {}, project({ status: 'failed' }),
			project({ id: 'other', remoteUrl: 'https://github.com/another/repo' }),
			project({ id: 'ready', remoteUrl: 'git@github.com:Microsoft/VSCode.git' }),
		]);
		const directory = await resolver.prepareWorkingDirectory(repository, CancellationToken.None);
		assert.deepStrictEqual({ directory: directory?.toString(), requests }, { directory: 'file:///workspaces/vscode', requests: [] });
	});

	test('accepts a legacy project with no status as ready', async () => {
		const { status: _status, ...legacy } = project();
		const { resolver, requests } = createResolver(store, [legacy]);
		assert.deepStrictEqual({ directory: (await resolver.prepareWorkingDirectory(repository, CancellationToken.None))?.toString(), requests }, {
			directory: 'file:///workspaces/vscode', requests: [],
		});
	});

	test('clones once and waits for the checkout to be published as ready', async () => {
		const { resolver, root, reply, requests } = createResolver(store);
		let settled = false;
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None).then(result => {
			settled = true;
			return result;
		});
		root.handleSnapshot(rootState([project({ status: 'cloning', git: false })]), 1);
		await reply.complete({ project: project({ status: 'cloning', git: false }) });
		await timeout(0);
		assert.strictEqual(settled, false);
		root.receiveEnvelope({
			channel: ROOT_STATE_URI,
			action: { type: ActionType.RootConfigChanged, config: { copilot: { projects: [project()] } } },
			serverSeq: 2,
			origin: undefined,
		});
		assert.deepStrictEqual({ directory: (await preparation)?.toString(), requests }, {
			directory: 'file:///workspaces/vscode',
			requests: [{ method: 'extensions/cloneProject', params: { url: repository.toString(), depth: 1 } }],
		});
	});

	test('joins an in-progress clone from another client', async () => {
		const { resolver, root, requests } = createResolver(store, [project({ status: 'cloning', git: false })]);
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({ directory: (await preparation)?.toString(), requests }, { directory: 'file:///workspaces/vscode', requests: [] });
	});

	test('a newer ready publication wins over a delayed cloning response', async () => {
		const { resolver, root, reply } = createResolver(store);
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project()]), 1);
		await reply.complete({ project: project({ status: 'cloning', git: false }) });
		assert.strictEqual((await preparation)?.toString(), 'file:///workspaces/vscode');
	});

	test('a ready response still requires catalogue read-back', async () => {
		const { resolver, root, reply } = createResolver(store);
		let settled = false;
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None).then(result => {
			settled = true;
			return result;
		});
		await reply.complete({ project: project() });
		await timeout(0);
		assert.strictEqual(settled, false);
		root.handleSnapshot(rootState([project()]), 1);
		assert.strictEqual((await preparation)?.toString(), 'file:///workspaces/vscode');
	});

	test('surfaces clone failure without falling back to the default directory', async () => {
		const { resolver, root, requests } = createResolver(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /access denied/);
		root.handleSnapshot(rootState([project({ status: 'failed', error: 'access denied' })]), 1);
		await rejected;
		assert.deepStrictEqual(requests, []);
	});

	test('an explicit retry can restart a failed clone', async () => {
		const { resolver, root, reply, requests } = createResolver(store, [project({ status: 'failed', error: 'previous failure' })]);
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		await reply.complete({ project: project({ status: 'cloning' }) });
		root.handleSnapshot(rootState([project()]), 2);
		assert.deepStrictEqual({ directory: (await preparation)?.toString(), calls: requests.length }, { directory: 'file:///workspaces/vscode', calls: 1 });
	});

	test('waits for the retry publication when its response overtakes the catalogue', async () => {
		const { resolver, root, reply } = createResolver(store, [project({ status: 'failed', error: 'previous failure' })]);
		const preparation = resolver.prepareWorkingDirectory(repository, CancellationToken.None);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await timeout(0);
		root.handleSnapshot(rootState([project()]), 1);
		assert.strictEqual((await preparation)?.toString(), 'file:///workspaces/vscode');
	});

	test('a repeated clone failure is reported without an automatic retry', async () => {
		const failed = project({ status: 'failed', error: 'access denied' });
		const { resolver, root, reply, requests } = createResolver(store, [failed]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /access denied/);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		root.handleSnapshot(rootState([failed]), 2);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await rejected;
		assert.strictEqual(requests.length, 1);
	});

	test('fails if a joined project is removed', async () => {
		const { resolver, root } = createResolver(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /removed/);
		root.handleSnapshot(rootState([]), 1);
		await rejected;
	});

	test('detects removal even when it precedes the clone response', async () => {
		const { resolver, root, reply } = createResolver(store);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /removed/);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		root.handleSnapshot(rootState([]), 2);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await rejected;
	});

	test('rejects malformed clone responses and a different repository', async () => {
		for (const response of [null, {}, { project: project({ id: '' }) }, { project: project({ remoteUrl: 'https://github.com/other/repo' }) }]) {
			const { resolver, reply } = createResolver(store);
			const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /invalid repository cloning response/);
			await reply.complete(response);
			await rejected;
		}
	});

	test('requires a ready Git checkout with an absolute host path', async () => {
		for (const entry of [project({ git: false }), project({ path: 'relative/repo' }), project({ path: 'file:///repo' }), project({ path: '/repo\0' })]) {
			const { resolver } = createResolver(store, [entry]);
			await assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /usable repository directory/);
		}
	});

	test('rejects credential-bearing and non-repository URLs without sending them', async () => {
		const { resolver, requests } = createResolver(store);
		for (const url of ['https://user:secret@github.com/microsoft/vscode', 'https://github.com/microsoft/vscode?token=secret', 'https://github.com/microsoft/vscode#main', 'https://example.org/microsoft/vscode']) {
			await assert.rejects(resolver.prepareWorkingDirectory(URI.parse(url), CancellationToken.None), /requires a GitHub repository URL/);
		}
		assert.deepStrictEqual(requests, []);
	});

	test('propagates RPC and subscription failures', async () => {
		const cloning = createResolver(store);
		const rpcRejected = assert.rejects(cloning.resolver.prepareWorkingDirectory(repository, CancellationToken.None), /RPC unavailable/);
		await cloning.reply.error(new Error('RPC unavailable'));
		await rpcRejected;

		const waiting = createResolver(store, [project({ status: 'cloning' })]);
		const subscriptionRejected = assert.rejects(waiting.resolver.prepareWorkingDirectory(repository, CancellationToken.None), /subscription failed/);
		waiting.root.setError(new Error('subscription failed'));
		await subscriptionRejected;
	});

	test('does not fall back when the capability is withdrawn during preparation', async () => {
		const { resolver, root } = createResolver(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /no longer advertises/);
		root.handleSnapshot(rootState([], { available: false }), 1);
		await rejected;
	});

	test('cancelling a wait leaves the checkout available for a later retry', async () => {
		const { resolver, root, reply, requests } = createResolver(store);
		const cancellation = store.add(new CancellationTokenSource());
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, cancellation.token), isCancellationError);
		cancellation.cancel();
		await rejected;
		root.handleSnapshot(rootState([project()]), 1);
		await reply.complete({ project: project({ status: 'cloning' }) });
		assert.deepStrictEqual({ directory: (await resolver.prepareWorkingDirectory(repository, CancellationToken.None))?.toString(), calls: requests.length }, {
			directory: 'file:///workspaces/vscode', calls: 1,
		});
	});

	test('connection disposal cancels preparation without deleting the project', async () => {
		const { resolver, requests } = createResolver(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), isCancellationError);
		resolver.dispose();
		await rejected;
		assert.deepStrictEqual(requests, []);
	});

	test('an already-cancelled request cannot start cloning', async () => {
		const { resolver, requests } = createResolver(store);
		await assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(requests, []);
	});

	test('the five-minute deadline covers a missing reply even after a ready publication', async () => {
		const clock = sinon.useFakeTimers();
		const { resolver, root } = createResolver(store);
		let settled = false;
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /five minutes/).then(() => settled = true);
		root.handleSnapshot(rootState([project()]), 1);
		await clock.tickAsync(5 * 60_000 - 1);
		assert.strictEqual(settled, false);
		await clock.tickAsync(1);
		await rejected;
	});

	test('the deadline also covers a clone that never becomes ready', async () => {
		const clock = sinon.useFakeTimers();
		const { resolver } = createResolver(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(resolver.prepareWorkingDirectory(repository, CancellationToken.None), /five minutes/);
		await clock.tickAsync(5 * 60_000);
		await rejected;
	});
});
