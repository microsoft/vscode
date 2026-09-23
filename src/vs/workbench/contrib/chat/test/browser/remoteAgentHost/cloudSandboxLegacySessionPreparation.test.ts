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
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { cloudSandboxAddress, ICloudSandboxAgentHostService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ICloudSandboxProject } from '../../../../../../platform/agentHost/common/meta/cloudSandboxProjectMeta.js';
import { RootStateSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { createCloudSandboxSessionPreparation } from '../../../browser/remoteAgentHost/cloudSandboxLegacySessionPreparation.js';
import { createCloudSandboxConnectionCustomization } from '../../../browser/remoteAgentHost/cloudSandboxConnectionCustomization.js';

const repository = URI.parse('https://github.com/microsoft/vscode');

function project(overrides: Partial<ICloudSandboxProject> = {}): ICloudSandboxProject {
	return { id: 'checkout', path: '/workspaces/vscode', git: true, status: 'ready', remoteUrl: repository.toString(), ...overrides };
}

function rootState(projects: readonly unknown[], capability: unknown = { available: true }): RootState {
	return {
		agents: [],
		_meta: { 'copilot.projectManagement': capability },
		config: { schema: { type: 'object', properties: {} }, values: { copilot: { projects } } },
	};
}

function createPreparation(store: Pick<DisposableStore, 'add'>, projects: readonly unknown[] = [], capability?: unknown) {
	const lifetime = store.add(new DisposableStore());
	const root = store.add(new RootStateSubscription('test-client', () => { }));
	root.handleSnapshot(rootState(projects, capability), 0);
	const reply = new DeferredPromise<unknown>();
	const replies: DeferredPromise<unknown>[] = [];
	const requests: { method: string; params: { url: string; depth: number } }[] = [];
	const prepareSession = createCloudSandboxSessionPreparation(root, (method, params) => {
		const response = replies.length === 0 ? reply : new DeferredPromise<unknown>();
		replies.push(response);
		requests.push({ method, params });
		return response.p;
	}, lifetime);
	return { root, prepareSession, lifetime, reply, replies, requests };
}

suite('CloudSandboxLegacySessionPreparation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('installs startup preparation only for cloud sandbox connections', () => {
		const service = new class extends mock<ICloudSandboxAgentHostService>() { }();
		assert.deepStrictEqual({
			ordinary: createCloudSandboxConnectionCustomization('localhost:8080', service),
			sandbox: typeof createCloudSandboxConnectionCustomization(cloudSandboxAddress('test'), service)?.createSessionPreparation,
		}, { ordinary: undefined, sandbox: 'function' });
	});

	test('binds preparation to its protocol connection and releases it when that connection closes', async () => {
		const root = store.add(new RootStateSubscription('test-client', () => { }));
		root.handleSnapshot(rootState([]), 0);
		const closed = store.add(new Emitter<void>());
		const connection = sinon.createStubInstance(AgentHostProtocolClient);
		Object.defineProperties(connection, {
			rootState: { value: root },
			onDidClose: { value: closed.event },
		});
		const reply = new DeferredPromise<unknown>();
		connection.sendHostExtensionRequest.returns(reply.p);
		const service = new class extends mock<ICloudSandboxAgentHostService>() { }();
		const customization = createCloudSandboxConnectionCustomization(cloudSandboxAddress('test'), service);
		const owner = store.add(new DisposableStore());
		assert.ok(customization?.createSessionPreparation);
		assert.ok(connection instanceof AgentHostProtocolClient);
		const prepareSession = customization.createSessionPreparation(connection, owner);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), isCancellationError);
		closed.fire();
		await rejected;
		assert.deepStrictEqual({
			request: connection.sendHostExtensionRequest.firstCall.args,
			ownerDisposed: owner.isDisposed,
			closeListener: closed.hasListeners(),
		}, {
			request: ['extensions/cloneProject', { url: repository.toString(), depth: 1 }],
			ownerDisposed: false,
			closeListener: false,
		});
	});

	test('requires an explicitly advertised capability', async () => {
		const results = [];
		for (const capability of [null, false, true, {}, { available: false }, { available: 'true' }, { available: 1 }]) {
			const { prepareSession, requests } = createPreparation(store, [project()], capability);
			results.push({ directory: await prepareSession(repository, CancellationToken.None), requests });
		}
		assert.deepStrictEqual(results, Array.from({ length: 7 }, () => ({ directory: undefined, requests: [] })));
	});

	test('preserves the legacy path when metadata is absent', async () => {
		const { prepareSession, root, requests } = createPreparation(store);
		root.handleSnapshot({ agents: [] }, 0);
		assert.deepStrictEqual({ directory: await prepareSession(repository, CancellationToken.None), requests }, { directory: undefined, requests: [] });
	});

	test('preserves directory and repository-less creation without cloning', async () => {
		const { prepareSession, requests } = createPreparation(store);
		const results = [];
		for (const directory of [undefined, URI.file('/existing'), URI.parse('vscode-agent-host://host/existing')]) {
			results.push(await prepareSession(directory, CancellationToken.None));
		}
		assert.deepStrictEqual({ results, requests }, { results: [undefined, undefined, undefined], requests: [] });
	});

	test('reuses matching ready Git projects and tolerates unrelated malformed entries', async () => {
		const { prepareSession, requests } = createPreparation(store, [
			null, {}, project({ status: 'failed' }),
			project({ id: 'other', remoteUrl: 'https://github.com/another/repo' }),
			project({ id: 'ready', remoteUrl: 'git@github.com:Microsoft/VSCode.git' }),
		]);
		const directory = await prepareSession(repository, CancellationToken.None);
		assert.deepStrictEqual({ directory: directory?.toString(), requests }, { directory: 'file:///workspaces/vscode', requests: [] });
	});

	test('accepts a legacy project with no status as ready', async () => {
		const { status: _status, ...legacy } = project();
		const { prepareSession, requests } = createPreparation(store, [legacy]);
		assert.deepStrictEqual({ directory: (await prepareSession(repository, CancellationToken.None))?.toString(), requests }, {
			directory: 'file:///workspaces/vscode', requests: [],
		});
	});

	test('clones once and waits for the checkout to be published as ready', async () => {
		const { prepareSession, root, reply, requests } = createPreparation(store);
		let settled = false;
		const preparation = prepareSession(repository, CancellationToken.None).then(result => {
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
		const { prepareSession, root, requests } = createPreparation(store, [project({ status: 'cloning', git: false })]);
		const preparation = prepareSession(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({ directory: (await preparation)?.toString(), requests }, { directory: 'file:///workspaces/vscode', requests: [] });
	});

	test('shares concurrent cloning before any catalogue publication using normalized repository identity', async () => {
		const { prepareSession, root, reply, requests } = createPreparation(store);
		const first = prepareSession(repository, CancellationToken.None);
		const second = prepareSession(URI.parse('https://GITHUB.com/Microsoft/VSCode.git/'), CancellationToken.None);
		await reply.complete({ project: project({ status: 'cloning' }) });
		root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({
			directories: (await Promise.all([first, second])).map(directory => directory?.toString()),
			requests,
		}, {
			directories: ['file:///workspaces/vscode', 'file:///workspaces/vscode'],
			requests: [{ method: 'extensions/cloneProject', params: { url: repository.toString(), depth: 1 } }],
		});
	});

	test('keeps different repositories and connections independent', async () => {
		const firstConnection = createPreparation(store);
		const secondConnection = createPreparation(store);
		const otherRepository = URI.parse('https://github.com/microsoft/typescript');
		const otherProject = project({ id: 'other', remoteUrl: otherRepository.toString(), path: '/workspaces/typescript' });
		const preparations = [
			firstConnection.prepareSession(repository, CancellationToken.None),
			firstConnection.prepareSession(otherRepository, CancellationToken.None),
			secondConnection.prepareSession(repository, CancellationToken.None),
		];
		await firstConnection.replies[0].complete({ project: project() });
		await firstConnection.replies[1].complete({ project: otherProject });
		await secondConnection.reply.complete({ project: project() });
		firstConnection.root.handleSnapshot(rootState([project(), otherProject]), 1);
		secondConnection.root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({
			directories: (await Promise.all(preparations)).map(directory => directory?.toString()),
			calls: [firstConnection.requests.length, secondConnection.requests.length],
		}, {
			directories: ['file:///workspaces/vscode', 'file:///workspaces/typescript', 'file:///workspaces/vscode'],
			calls: [2, 1],
		});
	});

	test('one cancelled waiter does not cancel preparation for the remaining waiter', async () => {
		const { prepareSession, root, reply, requests } = createPreparation(store);
		const cancellation = store.add(new CancellationTokenSource());
		const cancelled = assert.rejects(prepareSession(repository, cancellation.token), isCancellationError);
		const remaining = prepareSession(repository, CancellationToken.None);
		cancellation.cancel();
		await cancelled;
		await reply.complete({ project: project({ status: 'cloning' }) });
		root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({
			directory: (await remaining)?.toString(),
			calls: requests.length,
		}, { directory: 'file:///workspaces/vscode', calls: 1 });
	});

	test('cancelling every waiter allows an immediate retry to start a fresh preparation', async () => {
		const { prepareSession, root, replies, requests } = createPreparation(store);
		const firstCancellation = store.add(new CancellationTokenSource());
		const secondCancellation = store.add(new CancellationTokenSource());
		const first = assert.rejects(prepareSession(repository, firstCancellation.token), isCancellationError);
		const second = assert.rejects(prepareSession(repository, secondCancellation.token), isCancellationError);
		firstCancellation.cancel();
		secondCancellation.cancel();
		const retry = prepareSession(repository, CancellationToken.None);
		await Promise.all([first, second]);
		await replies[1].complete({ project: project() });
		root.handleSnapshot(rootState([project()]), 1);
		assert.deepStrictEqual({
			calls: requests.length,
			directory: (await retry)?.toString(),
		}, { calls: 2, directory: 'file:///workspaces/vscode' });
	});

	test('a newer ready publication wins over a delayed cloning response', async () => {
		const { prepareSession, root, reply } = createPreparation(store);
		const preparation = prepareSession(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project()]), 1);
		await reply.complete({ project: project({ status: 'cloning', git: false }) });
		assert.strictEqual((await preparation)?.toString(), 'file:///workspaces/vscode');
	});

	test('a ready response still requires catalogue read-back', async () => {
		const { prepareSession, root, reply } = createPreparation(store);
		let settled = false;
		const preparation = prepareSession(repository, CancellationToken.None).then(result => {
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
		const { prepareSession, root, requests } = createPreparation(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /access denied/);
		root.handleSnapshot(rootState([project({ status: 'failed', error: 'access denied' })]), 1);
		await rejected;
		assert.deepStrictEqual(requests, []);
	});

	test('rejects failed clone replies immediately without waiting for a catalogue publication', async () => {
		for (const error of [undefined, 'access denied']) {
			const { prepareSession, reply } = createPreparation(store);
			const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), {
				message: error ? `Repository cloning failed: ${error}` : 'Repository cloning failed.',
			});
			await reply.complete({ project: project({ status: 'failed', remoteUrl: undefined, error }) });
			await rejected;
		}
	});

	test('a failed shared clone reply reaches every waiter and allows an explicit retry', async () => {
		const { prepareSession, root, replies, requests } = createPreparation(store);
		const first = assert.rejects(prepareSession(repository, CancellationToken.None), /access denied/);
		const second = assert.rejects(prepareSession(repository, CancellationToken.None), /access denied/);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		await replies[0].complete({ project: project({ status: 'failed', error: 'access denied' }) });
		await Promise.all([first, second]);
		root.handleSnapshot(rootState([]), 2);
		const retry = prepareSession(repository, CancellationToken.None);
		await replies[1].complete({ project: project() });
		root.handleSnapshot(rootState([project()]), 3);
		assert.deepStrictEqual({ calls: requests.length, directory: (await retry)?.toString() }, { calls: 2, directory: 'file:///workspaces/vscode' });
	});

	test('an explicit retry can restart a failed clone', async () => {
		const { prepareSession, root, reply, requests } = createPreparation(store, [project({ status: 'failed', error: 'previous failure' })]);
		const preparation = prepareSession(repository, CancellationToken.None);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		await reply.complete({ project: project({ status: 'cloning' }) });
		root.handleSnapshot(rootState([project()]), 2);
		assert.deepStrictEqual({ directory: (await preparation)?.toString(), calls: requests.length }, { directory: 'file:///workspaces/vscode', calls: 1 });
	});

	test('waits for the retry publication when its response overtakes the catalogue', async () => {
		const { prepareSession, root, reply } = createPreparation(store, [project({ status: 'failed', error: 'previous failure' })]);
		const preparation = prepareSession(repository, CancellationToken.None);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await timeout(0);
		root.handleSnapshot(rootState([project()]), 1);
		assert.strictEqual((await preparation)?.toString(), 'file:///workspaces/vscode');
	});

	test('a repeated clone failure is reported without an automatic retry', async () => {
		const failed = project({ status: 'failed', error: 'access denied' });
		const { prepareSession, root, reply, requests } = createPreparation(store, [failed]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /access denied/);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		root.handleSnapshot(rootState([failed]), 2);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await rejected;
		assert.strictEqual(requests.length, 1);
	});

	test('fails if a joined project is removed', async () => {
		const { prepareSession, root } = createPreparation(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /removed/);
		root.handleSnapshot(rootState([]), 1);
		await rejected;
	});

	test('detects removal even when it precedes the clone response', async () => {
		const { prepareSession, root, reply } = createPreparation(store);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /removed/);
		root.handleSnapshot(rootState([project({ status: 'cloning' })]), 1);
		root.handleSnapshot(rootState([]), 2);
		await reply.complete({ project: project({ status: 'cloning' }) });
		await rejected;
	});

	test('rejects malformed clone responses and a different repository', async () => {
		for (const response of [null, {}, { project: project({ id: '' }) }, { project: project({ remoteUrl: 'https://github.com/other/repo' }) }]) {
			const { prepareSession, reply } = createPreparation(store);
			const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /invalid repository cloning response/);
			await reply.complete(response);
			await rejected;
		}
	});

	test('requires a ready Git checkout with an absolute host path', async () => {
		for (const entry of [project({ git: false }), project({ path: 'relative/repo' }), project({ path: 'file:///repo' }), project({ path: '/repo\0' })]) {
			const { prepareSession } = createPreparation(store, [entry]);
			await assert.rejects(prepareSession(repository, CancellationToken.None), /usable repository directory/);
		}
	});

	test('rejects credential-bearing and non-repository URLs without sending them', async () => {
		const { prepareSession, requests } = createPreparation(store);
		for (const url of ['https://user:secret@github.com/microsoft/vscode', 'https://github.com/microsoft/vscode?token=secret', 'https://github.com/microsoft/vscode#main', 'https://example.org/microsoft/vscode']) {
			await assert.rejects(prepareSession(URI.parse(url), CancellationToken.None), /requires a GitHub repository URL/);
		}
		assert.deepStrictEqual(requests, []);
	});

	test('propagates RPC and subscription failures', async () => {
		const cloning = createPreparation(store);
		const rpcRejected = assert.rejects(cloning.prepareSession(repository, CancellationToken.None), /RPC unavailable/);
		await cloning.reply.error(new Error('RPC unavailable'));
		await rpcRejected;

		const waiting = createPreparation(store, [project({ status: 'cloning' })]);
		const subscriptionRejected = assert.rejects(waiting.prepareSession(repository, CancellationToken.None), /subscription failed/);
		waiting.root.setError(new Error('subscription failed'));
		await subscriptionRejected;
	});

	test('does not fall back when the capability is withdrawn during preparation', async () => {
		const { prepareSession, root } = createPreparation(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /no longer advertises/);
		root.handleSnapshot(rootState([], { available: false }), 1);
		await rejected;
	});

	test('cancelling a wait leaves the checkout available for a later retry', async () => {
		const { prepareSession, root, reply, requests } = createPreparation(store);
		const cancellation = store.add(new CancellationTokenSource());
		const rejected = assert.rejects(prepareSession(repository, cancellation.token), isCancellationError);
		cancellation.cancel();
		await rejected;
		root.handleSnapshot(rootState([project()]), 1);
		await reply.complete({ project: project({ status: 'cloning' }) });
		assert.deepStrictEqual({ directory: (await prepareSession(repository, CancellationToken.None))?.toString(), calls: requests.length }, {
			directory: 'file:///workspaces/vscode', calls: 1,
		});
	});

	test('connection disposal cancels preparation without deleting the project', async () => {
		const { prepareSession, lifetime, requests } = createPreparation(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), isCancellationError);
		lifetime.dispose();
		await rejected;
		assert.deepStrictEqual(requests, []);
	});

	test('connection disposal cancels every waiter without waiting for a clone reply', async () => {
		const { prepareSession, lifetime, requests } = createPreparation(store);
		const first = assert.rejects(prepareSession(repository, CancellationToken.None), isCancellationError);
		const second = assert.rejects(prepareSession(repository, CancellationToken.None), isCancellationError);
		lifetime.dispose();
		await Promise.all([first, second]);
		assert.deepStrictEqual(requests.map(request => request.method), ['extensions/cloneProject']);
	});

	test('an already-cancelled request cannot start cloning', async () => {
		const { prepareSession, requests } = createPreparation(store);
		await assert.rejects(prepareSession(repository, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(requests, []);
	});

	test('the five-minute deadline covers a missing reply even after a ready publication', async () => {
		const clock = sinon.useFakeTimers();
		const { prepareSession, root } = createPreparation(store);
		let settled = false;
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /five minutes/).then(() => settled = true);
		root.handleSnapshot(rootState([project()]), 1);
		await clock.tickAsync(5 * 60_000 - 1);
		assert.strictEqual(settled, false);
		await clock.tickAsync(1);
		await rejected;
	});

	test('the deadline also covers a clone that never becomes ready', async () => {
		const clock = sinon.useFakeTimers();
		const { prepareSession } = createPreparation(store, [project({ status: 'cloning' })]);
		const rejected = assert.rejects(prepareSession(repository, CancellationToken.None), /five minutes/);
		await clock.tickAsync(5 * 60_000);
		await rejected;
	});

	test('a shared timeout settles every waiter and allows a user retry', async () => {
		const clock = sinon.useFakeTimers();
		const { prepareSession, requests } = createPreparation(store);
		for (let attempt = 0; attempt < 3; attempt++) {
			const first = assert.rejects(prepareSession(repository, CancellationToken.None), /five minutes/);
			const second = assert.rejects(prepareSession(repository, CancellationToken.None), /five minutes/);
			await clock.tickAsync(5 * 60_000);
			await Promise.all([first, second]);
		}
		assert.strictEqual(requests.length, 3);
	});
});
