/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentResolveSessionConfigParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { IRepositorySource, serializeRepositorySources, validateRepositories } from '../../../../../../platform/agentHost/common/agentHostRepositorySource.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { InitializeResult, ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { RepositoryPreparationCapabilities } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { AgentInfo, RootState, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getSessionRepositories, getRepositoryPreparationCapability, getRepositoriesFromSelection, resolveAgentHostRepositoryConfig, waitForRepositorySessionReady } from '../../../browser/agentSessions/agentHost/agentHostRepositoryConfig.js';

const repository = URI.parse('https://example.com/owner/repo');
const repositories: readonly IRepositorySource[] = [{ source: repository }];
const schema: SessionConfigSchema = {
	type: 'object',
	properties: {
		branch: { type: 'string', title: 'Working branch' },
		mode: { type: 'string', title: 'Mode' },
	},
};

suite('AgentHostRepositoryConfig', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function connectionWithResponses(responses: readonly (ResolveSessionConfigResult | Error)[], capabilities: Pick<InitializeResult, 'repositoryPreparation'> = { repositoryPreparation: { revision: true } }) {
		const calls: IAgentResolveSessionConfigParams[] = [];
		let root: RootState | Error = upcastPartial<RootState>({
			agents: [upcastPartial<AgentInfo>({ provider: 'provider' })],
		});
		const initializeResult = upcastPartial<InitializeResult>({ defaultDirectory: 'file:///host', ...capabilities });
		const connection = new class extends mock<IAgentConnection>() {
			override readonly rootState = upcastPartial<IAgentSubscription<RootState>>({
				get value() { return root; },
			});
			override readonly initializeResult = constObservable<InitializeResult | undefined>(initializeResult);
			override async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
				const response = responses[calls.length];
				calls.push(params);
				if (response instanceof Error) {
					throw response;
				}
				assert.ok(response, 'unexpected configuration request');
				return response;
			}
		}();
		return {
			calls,
			connection,
			initializeResult,
			setCapability(value: RepositoryPreparationCapabilities | undefined) { initializeResult.repositoryPreparation = value; },
			failRoot(error: Error) { root = error; },
		};
	}

	test('sends typed repositories outside provider config', async () => {
		const h = connectionWithResponses([{ schema, values: { mode: 'plan', branch: 'feature', extra: 'host-default' } }]);
		const inputs = [{ source: repository, revision: 'main' }];
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', inputs, { branch: 'feature', mode: 'plan' }, CancellationToken.None);
		assert.deepStrictEqual({ calls: h.calls, config }, {
			calls: [{ provider: 'provider', repositories: inputs, config: { branch: 'feature', mode: 'plan' } }],
			config: { mode: 'plan', branch: 'feature', extra: 'host-default' },
		});
	});

	test('absent host capability does not infer preparation support', async () => {
		const h = connectionWithResponses([], {});
		assert.strictEqual(getRepositoryPreparationCapability(h.connection), undefined);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, undefined, CancellationToken.None), /does not support/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('uses the authoritative resolved configuration instead of overwriting normalized values', async () => {
		const h = connectionWithResponses([{ schema, values: { mode: 'interactive', branch: 'repository-default' } }]);
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, { mode: 'plan', obsolete: 'old-default' }, CancellationToken.None);
		assert.deepStrictEqual(config, { mode: 'interactive', branch: 'repository-default' });
	});

	test('accepts an empty preparation capability and omits an unused revision', async () => {
		const h = connectionWithResponses([{ schema, values: {} }], { repositoryPreparation: {} });
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, undefined, CancellationToken.None);
		assert.deepStrictEqual({ calls: h.calls, config }, {
			calls: [{ provider: 'provider', repositories, config: undefined }],
			config: {},
		});
	});

	test('does not mistake a local working directory for a repository source', () => {
		assert.strictEqual(getRepositoriesFromSelection(connectionWithResponses([]).connection, URI.file('/workspace')), undefined);
	});

	test('an HTTPS selection requires the host preparation capability', () => {
		assert.strictEqual(getRepositoriesFromSelection(connectionWithResponses([], {}).connection, repository), undefined);
	});

	test('an advertised feature failing later is not treated as an unsupported host', async () => {
		const error = new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Configuration became unavailable');
		const h = connectionWithResponses([error]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, undefined, CancellationToken.None), /Configuration became unavailable/);
	});

	for (const value of [null, true, [], { revision: 'yes' }, { multipleRepositories: 'yes' }]) {
		test(`rejects a malformed host capability (${JSON.stringify(value)})`, () => {
			const h = connectionWithResponses([]);
			Object.assign(h.initializeResult, { repositoryPreparation: value });
			assert.throws(() => getRepositoryPreparationCapability(h.connection), /invalid repository preparation capability/);
		});
	}

	test('preparation support is independent of the agent catalog', () => {
		const h = connectionWithResponses([]);
		h.failRoot(new Error('Root subscription failed'));
		assert.deepStrictEqual(getRepositoryPreparationCapability(h.connection), { revision: true });
	});

	for (const key of ['repositories', 'repositorySource', 'repositoryRevision', 'repositoryUrl']) {
		test(`rejects the obsolete config carrier ${key}`, async () => {
			const h = connectionWithResponses([]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, { [key]: null }, CancellationToken.None), /request field, not configuration/);
			assert.deepStrictEqual(h.calls, []);
		});
	}

	for (const key of ['repositorySource', 'repositoryRevision', 'repositoryUrl']) {
		test(`rejects the obsolete top-level input ${key}`, () => {
			assert.throws(() => validateRepositories(Object.assign({ repositories }, { [key]: null }), { revision: true }), /repositories list/);
		});
	}

	for (const value of [null, {}, [], [null], [{}], [{ revision: 'main' }], [{ source: 17 }]]) {
		test(`rejects malformed repository input before config queries (${JSON.stringify(value)})`, async () => {
			const h = connectionWithResponses([]);
			const inputs = Object.assign({ repositories }, { repositories: value });
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', inputs.repositories, undefined, CancellationToken.None), /nonempty list|absolute source URI/);
			assert.deepStrictEqual(h.calls, []);
		});
	}

	test('rejects multiple repositories without the explicit host capability', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', [...repositories, { source: repository, revision: 'other' }], undefined, CancellationToken.None), /multiple repositories/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('preserves the complete ordered list when the host supports multiple repositories', async () => {
		const h = connectionWithResponses([{ schema, values: {} }], { repositoryPreparation: { revision: true, multipleRepositories: true } });
		const inputs = [{ source: repository, revision: 'main' }, { source: repository, revision: 'other' }];
		await resolveAgentHostRepositoryConfig(h.connection, 'provider', inputs, undefined, CancellationToken.None);
		assert.deepStrictEqual(h.calls, [{ provider: 'provider', repositories: inputs, config: undefined }]);
	});

	test('rejects a requested revision without the revision capability', async () => {
		const h = connectionWithResponses([], { repositoryPreparation: {} });
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', [{ source: repository, revision: 'main' }], undefined, CancellationToken.None), /does not support repository revision/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('rejects conflicting creation directories', () => {
		assert.throws(() => validateRepositories({ repositories, workingDirectories: [URI.file('/workspace')] }, {}), /not both/);
	});

	test('fails if preparation support disappears during resolution', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const pending = resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, undefined, CancellationToken.None);
		h.setCapability(undefined);
		await assert.rejects(pending, /does not support repository-backed/);
	});

	test('fails if revision support disappears during resolution', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const pending = resolveAgentHostRepositoryConfig(h.connection, 'provider', [{ source: repository, revision: 'main' }], undefined, CancellationToken.None);
		h.setCapability({});
		await assert.rejects(pending, /does not support repository revision/);
	});

	for (const revision of ['', '   ', null]) {
		test(`rejects an invalid explicit revision (${JSON.stringify(revision)})`, async () => {
			const h = connectionWithResponses([]);
			const input = Object.assign({ source: repository, revision: 'main' }, { revision });
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', [input], undefined, CancellationToken.None), /nonempty string/);
			assert.deepStrictEqual(h.calls, []);
		});
	}

	test('allows a file source without treating it as the resulting working directory', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const inputs = [{ source: URI.file('/source/repository') }];
		await resolveAgentHostRepositoryConfig(h.connection, 'provider', inputs, undefined, CancellationToken.None);
		assert.deepStrictEqual(h.calls, [{ provider: 'provider', repositories: inputs, config: undefined }]);
	});

	test('does not send credential-bearing repository URLs', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', [{ source: URI.parse('https://user@example.com/owner/repo') }], undefined, CancellationToken.None), /without credentials/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('does not query a cancelled operation', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repositories, undefined, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(h.calls, []);
	});

	for (const value of [null, [], [{}], [{ revision: 'main' }], [{ source: '' }], [{ source: '   ' }]]) {
		test(`rejects malformed repository metadata (${JSON.stringify(value)})`, () => {
			const state = Object.assign(session(SessionLifecycle.Ready), { repositories: value });
			assert.throws(() => getSessionRepositories(state), /nonempty list|absolute source URI/);
		});
	}

	test('reads immutable inputs independently of provider configuration', () => {
		const state = { ...session(SessionLifecycle.Ready), config: { schema, values: { repositories: [{ source: 'https://example.com/not-the-source' }] } } };
		assert.deepStrictEqual(getSessionRepositories(state), serializeRepositorySources(repositories));
	});

	function session(lifecycle: SessionLifecycle, withRepositories = true): SessionState {
		return upcastPartial<SessionState>({
			lifecycle,
			workingDirectories: lifecycle === SessionLifecycle.Ready ? ['file:///checkout/repo'] : undefined,
			repositories: withRepositories ? serializeRepositorySources(repositories) : undefined,
			config: { schema, values: {} },
		});
	}

	function subscription(initial: SessionState) {
		let value: SessionState | Error = initial;
		const changes = store.add(new Emitter<SessionState>());
		const errors = store.add(new Emitter<Error>());
		const sub: IAgentSubscription<SessionState> = {
			get value() { return value; },
			get verifiedValue() { return value instanceof Error ? undefined : value; },
			onDidChange: changes.event,
			onDidError: errors.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		return {
			sub,
			set(state: SessionState) { value = state; changes.fire(state); },
			fail(error: Error) { value = error; errors.fire(error); },
			hasListeners: () => changes.hasListeners() || errors.hasListeners(),
		};
	}

	test('waits for ready directory state, not merely the creation acknowledgement', async () => {
		const h = subscription(session(SessionLifecycle.Creating));
		let resolved = false;
		const result = waitForRepositorySessionReady(h.sub, CancellationToken.None, repositories).then(state => { resolved = true; return state; });
		await Promise.resolve();
		const beforeReady = resolved;
		const ready = session(SessionLifecycle.Ready);
		h.set(ready);
		assert.deepStrictEqual({ beforeReady, state: await result, hasListeners: h.hasListeners() }, { beforeReady: false, state: ready, hasListeners: false });
	});

	test('a joining client also waits for repository preparation', async () => {
		const h = subscription(session(SessionLifecycle.Creating));
		const result = waitForRepositorySessionReady(h.sub, CancellationToken.None);
		const ready = session(SessionLifecycle.Ready);
		h.set(ready);
		assert.strictEqual(await result, ready);
	});

	test('propagates a shared creation failure instead of sending a turn', async () => {
		const h = subscription(session(SessionLifecycle.Creating));
		const result = waitForRepositorySessionReady(h.sub, CancellationToken.None);
		h.set({ ...session(SessionLifecycle.Failed), creationError: { errorType: 'repository', message: 'Repository access denied' } });
		await assert.rejects(result, /Repository access denied/);
		assert.strictEqual(h.hasListeners(), false);
	});

	test('propagates subscription failure without waiting forever', async () => {
		const h = subscription(session(SessionLifecycle.Creating));
		const result = waitForRepositorySessionReady(h.sub, CancellationToken.None);
		h.fail(new Error('Connection closed'));
		await assert.rejects(result, /Connection closed/);
		assert.strictEqual(h.hasListeners(), false);
	});

	test('cancels the local readiness wait without disposing the shared session', async () => {
		const h = subscription(session(SessionLifecycle.Creating));
		const cts = store.add(new CancellationTokenSource());
		const result = waitForRepositorySessionReady(h.sub, cts.token);
		cts.cancel();
		await assert.rejects(result, CancellationError);
		assert.strictEqual(h.hasListeners(), false);
	});

	test('a claimed ready repository must have resolved working directories', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), workingDirectories: [] });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None), /did not report a ready checkout/);
	});

	for (const lifecycle of [SessionLifecycle.Creating, SessionLifecycle.Ready, SessionLifecycle.Failed]) {
		test(`lost-response recovery rejects another repository before accepting ${lifecycle}`, async () => {
			const h = subscription({ ...session(lifecycle), repositories: [{ source: 'https://example.com/another/repo' }] });
			await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repositories), /different repository inputs/);
			assert.strictEqual(h.hasListeners(), false);
		});
	}

	test('lost-response recovery preserves an explicitly requested revision', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), repositories: [{ source: repository.toString(), revision: 'other' }] });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, [{ source: repository, revision: 'main' }]), /different repository inputs/);
	});

	test('lost-response recovery distinguishes an omitted revision from an explicit one', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), repositories: [{ source: repository.toString(), revision: 'main' }] });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repositories), /different repository inputs/);
	});

	test('lost-response recovery retains revision validation without provider config', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), config: undefined });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, [{ source: repository, revision: 'main' }]), /different repository inputs/);
	});

	test('lost-response recovery verifies every entry and its order', async () => {
		const expected = [{ source: repository, revision: 'main' }, { source: repository, revision: 'other' }];
		for (const actual of [expected.slice(0, 1), [...expected].reverse(), [...expected, ...repositories]]) {
			const h = subscription({ ...session(SessionLifecycle.Ready), repositories: serializeRepositorySources(actual) });
			await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, expected), /different repository inputs/);
		}
	});

	test('one repository can resolve to multiple working directories', async () => {
		const state = { ...session(SessionLifecycle.Ready), workingDirectories: ['file:///checkout/repo/packages/api', 'file:///checkout/repo/packages/web'] };
		assert.strictEqual(await waitForRepositorySessionReady(subscription(state).sub, CancellationToken.None, repositories), state);
	});

	test('repository entries do not map to directories by position', async () => {
		const inputs = [...repositories, { source: URI.parse('https://example.com/other/repo') }];
		const state = { ...session(SessionLifecycle.Ready), repositories: serializeRepositorySources(inputs), workingDirectories: ['file:///workspace'] };
		assert.strictEqual(await waitForRepositorySessionReady(subscription(state).sub, CancellationToken.None, inputs), state);
	});

	test('provider config does not opt a directory session into repository initialization', async () => {
		const state = { ...session(SessionLifecycle.Creating, false), config: { schema, values: { repositories: serializeRepositorySources(repositories) } } };
		assert.strictEqual(await waitForRepositorySessionReady(subscription(state).sub, CancellationToken.None), state);
	});

	test('keeps the existing lifecycle behavior for non-repository sessions', async () => {
		const state = session(SessionLifecycle.Creating, false);
		const h = subscription(state);
		assert.strictEqual(await waitForRepositorySessionReady(h.sub, CancellationToken.None), state);
		assert.strictEqual(h.hasListeners(), false);
	});
});
