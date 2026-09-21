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
import { validateRepositorySource } from '../../../../../../platform/agentHost/common/agentHostRepositorySource.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { InitializeResult, ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { RepositorySourceCapability } from '../../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import { AgentCapabilities, AgentInfo, RootState, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getRepositorySessionSource, getRepositorySourceCapability, getRepositorySourceFromSelection, resolveAgentHostRepositoryConfig, waitForRepositorySessionReady } from '../../../browser/agentSessions/agentHost/agentHostRepositoryConfig.js';

const repository = URI.parse('https://example.com/owner/repo');
const schema: SessionConfigSchema = {
	type: 'object',
	properties: {
		branch: { type: 'string', title: 'Working branch' },
		mode: { type: 'string', title: 'Mode' },
	},
};

suite('AgentHostRepositoryConfig', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function connectionWithResponses(responses: readonly (ResolveSessionConfigResult | Error)[], capabilities: AgentCapabilities = { repositorySource: { revision: true } }) {
		const calls: IAgentResolveSessionConfigParams[] = [];
		let root: RootState | Error = upcastPartial<RootState>({
			agents: [upcastPartial<AgentInfo>({ provider: 'provider', capabilities })],
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly rootState = upcastPartial<IAgentSubscription<RootState>>({
				get value() { return root; },
			});
			override readonly initializeResult = constObservable<InitializeResult | undefined>(upcastPartial<InitializeResult>({ defaultDirectory: 'file:///host' }));
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
			capabilities,
			setCapability(value: RepositorySourceCapability | undefined) { capabilities.repositorySource = value; },
			failRoot(error: Error) { root = error; },
		};
	}

	test('sends typed source and revision outside provider config', async () => {
		const h = connectionWithResponses([
			{ schema, values: { mode: 'plan', branch: 'feature', extra: 'host-default' } },
		]);
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { branch: 'feature', mode: 'plan' }, CancellationToken.None, 'main');
		assert.deepStrictEqual({ calls: h.calls, config }, {
			calls: [
				{ provider: 'provider', repositorySource: repository, repositoryRevision: 'main', config: { branch: 'feature', mode: 'plan' } },
			],
			config: { mode: 'plan', branch: 'feature', extra: 'host-default' },
		});
	});

	test('absent capability does not infer repository support from configuration properties', async () => {
		const h = connectionWithResponses([], {});
		assert.strictEqual(getRepositorySourceCapability(h.connection, 'provider'), undefined);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), /does not support/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('uses the authoritative resolved configuration instead of overwriting normalized values', async () => {
		const h = connectionWithResponses([{ schema, values: { mode: 'interactive', branch: 'repository-default' } }]);
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { mode: 'plan', obsolete: 'old-default' }, CancellationToken.None);
		assert.deepStrictEqual(config, { mode: 'interactive', branch: 'repository-default' });
	});

	test('accepts an empty source capability and omits an unused revision', async () => {
		const h = connectionWithResponses([{ schema, values: {} }], { repositorySource: {} });
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None);
		assert.deepStrictEqual({ calls: h.calls, config }, {
			calls: [{ provider: 'provider', repositorySource: repository, config: undefined }],
			config: {},
		});
	});

	test('does not mistake a local working directory for a repository source', () => {
		const h = connectionWithResponses([]);
		assert.strictEqual(getRepositorySourceFromSelection(h.connection, 'provider', URI.file('/workspace')), undefined);
	});

	test('an HTTPS selection requires the per-agent capability', () => {
		const h = connectionWithResponses([], {});
		assert.strictEqual(getRepositorySourceFromSelection(h.connection, 'provider', repository), undefined);
	});

	test('an advertised feature failing later is not treated as an unsupported host', async () => {
		const error = new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Configuration became unavailable');
		const h = connectionWithResponses([error]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), error);
	});

	for (const value of [null, true, [], { revision: 'yes' }]) {
		test(`rejects a malformed source capability (${JSON.stringify(value)})`, () => {
			const h = connectionWithResponses([]);
			Object.assign(h.capabilities, { repositorySource: value });
			assert.throws(() => getRepositorySourceCapability(h.connection, 'provider'), /invalid repository source capability/);
		});
	}

	test('a root-state error is not an unsupported-capability fallback', () => {
		const h = connectionWithResponses([]);
		const error = new Error('Root subscription failed');
		h.failRoot(error);
		assert.throws(() => getRepositorySourceCapability(h.connection, 'provider'), /Root subscription failed/);
	});

	for (const key of ['repositorySource', 'repositoryRevision', 'repositoryUrl']) {
		test(`rejects the obsolete config alias ${key}`, async () => {
			const h = connectionWithResponses([]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { [key]: null }, CancellationToken.None), /request fields, not configuration/);
			assert.deepStrictEqual(h.calls, []);
		});
	}

	test('rejects a revision without a source', () => {
		assert.throws(() => validateRepositorySource({ repositoryRevision: 'main' }, { revision: true }), /requires a repository source/);
	});

	test('rejects a requested revision without the revision capability', async () => {
		const h = connectionWithResponses([], { repositorySource: {} });
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None, 'main'), /does not support repository revision/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('fails if source support disappears during resolution', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const pending = resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None);
		h.setCapability(undefined);
		await assert.rejects(pending, /does not support repository-backed/);
	});

	test('fails if support for the requested revision disappears during resolution', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const pending = resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None, 'main');
		h.setCapability({});
		await assert.rejects(pending, /does not support repository revision/);
	});

	for (const revision of ['', '   ']) {
		test(`rejects an invalid explicit revision (${JSON.stringify(revision)})`, async () => {
			const h = connectionWithResponses([]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None, revision), /nonempty string/);
			assert.deepStrictEqual(h.calls, []);
		});
	}

	test('allows a file source without treating it as the resulting working directory', async () => {
		const h = connectionWithResponses([{ schema, values: {} }]);
		const source = URI.file('/source/repository');
		await resolveAgentHostRepositoryConfig(h.connection, 'provider', source, undefined, CancellationToken.None);
		assert.deepStrictEqual(h.calls, [{ provider: 'provider', repositorySource: source, config: undefined }]);
	});

	test('does not send credential-bearing repository URLs', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', URI.parse('https://user@example.com/owner/repo'), undefined, CancellationToken.None), /without credentials/);
		assert.deepStrictEqual(h.calls, []);
	});

	test('does not query a cancelled operation', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(h.calls, []);
	});

	for (const source of [null, 17, '', '   ']) {
		test(`rejects an invalid source in session state (${JSON.stringify(source)})`, () => {
			const state = session(SessionLifecycle.Ready);
			Object.assign(state, { repositorySource: source });
			assert.throws(() => getRepositorySessionSource(state), /invalid repository selection/);
		});
	}

	test('rejects a revision without a source in session state', () => {
		assert.throws(() => getRepositorySessionSource({ repositoryRevision: 'main' }), /invalid repository selection/);
	});

	test('reads source identity independently of provider configuration', () => {
		const state = { ...session(SessionLifecycle.Ready), config: { schema, values: { repositorySource: 'https://example.com/not-the-source' } } };
		assert.strictEqual(getRepositorySessionSource(state), repository.toString());
	});

	function session(lifecycle: SessionLifecycle, withRepository = true): SessionState {
		return upcastPartial<SessionState>({
			lifecycle,
			workingDirectories: lifecycle === SessionLifecycle.Ready ? ['file:///checkout/repo'] : undefined,
			repositorySource: withRepository ? repository.toString() : undefined,
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
		const result = waitForRepositorySessionReady(h.sub, CancellationToken.None, repository).then(state => { resolved = true; return state; });
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

	test('lost-response recovery must match the originally requested repository', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), repositorySource: 'https://example.com/another/repo' });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository), /did not report a ready checkout/);
	});

	test('lost-response recovery must also preserve an explicitly requested revision', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), repositoryRevision: 'other' });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository, 'main'), /did not report a ready checkout/);
	});

	test('lost-response recovery distinguishes an omitted revision from an explicit revision', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), repositoryRevision: 'main' });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository), /did not report a ready checkout/);
	});

	test('lost-response recovery does not forget a requested revision when provider config is absent', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), config: undefined });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository, 'main'), /did not report a ready checkout/);
	});

	test('one repository can resolve to multiple working directories', async () => {
		const state = { ...session(SessionLifecycle.Ready), workingDirectories: ['file:///checkout/repo/packages/api', 'file:///checkout/repo/packages/web'] };
		const h = subscription(state);
		assert.strictEqual(await waitForRepositorySessionReady(h.sub, CancellationToken.None, repository), state);
	});

	test('provider config does not opt a directory session into repository initialization', async () => {
		const state = { ...session(SessionLifecycle.Creating, false), config: { schema, values: { repositorySource: repository.toString() } } };
		const h = subscription(state);
		assert.strictEqual(await waitForRepositorySessionReady(h.sub, CancellationToken.None), state);
	});

	test('keeps the existing lifecycle behavior for non-repository sessions', async () => {
		const state = session(SessionLifecycle.Creating, false);
		const h = subscription(state);
		assert.strictEqual(await waitForRepositorySessionReady(h.sub, CancellationToken.None), state);
		assert.strictEqual(h.hasListeners(), false);
	});
});
