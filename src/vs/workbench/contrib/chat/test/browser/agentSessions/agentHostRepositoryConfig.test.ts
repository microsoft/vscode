/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentResolveSessionConfigParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionConfigPropertySchema, SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getRepositorySessionSource, resolveAgentHostRepositoryConfig, supportsRepositorySessionConfig, waitForRepositorySessionReady } from '../../../browser/agentSessions/agentHost/agentHostRepositoryConfig.js';

const repository = URI.parse('https://example.com/owner/repo');
const schema: SessionConfigSchema = {
	type: 'object',
	properties: {
		repositorySource: { type: 'string', title: 'Repository' },
		repositoryRevision: { type: 'string', title: 'Revision' },
		branch: { type: 'string', title: 'Working branch' },
		mode: { type: 'string', title: 'Mode' },
	},
};
const sourceOnlySchema: SessionConfigSchema = {
	type: 'object',
	properties: { repositorySource: { type: 'string', title: 'Repository' } },
};

suite('AgentHostRepositoryConfig', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function connectionWithResponses(responses: readonly (ResolveSessionConfigResult | Error)[]) {
		const calls: IAgentResolveSessionConfigParams[] = [];
		const connection = new class extends mock<IAgentConnection>() {
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
		return { calls, connection };
	}

	test('uses standard input names and preserves selected values and host defaults', async () => {
		const h = connectionWithResponses([
			{ schema, values: { mode: 'interactive' } },
			{ schema, values: { mode: 'interactive', extra: 'host-default' } },
		]);
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { repositoryRevision: 'main', branch: 'feature', mode: 'plan' }, CancellationToken.None);
		assert.deepStrictEqual({ calls: h.calls, config }, {
			calls: [
				{ provider: 'provider', config: { repositoryRevision: 'main', branch: 'feature', mode: 'plan' } },
				{ provider: 'provider', config: { repositoryRevision: 'main', branch: 'feature', mode: 'plan', repositorySource: repository.toString() } },
			],
			config: { mode: 'plan', repositoryRevision: 'main', branch: 'feature', repositorySource: repository.toString(), extra: 'host-default' },
		});
	});

	test('an unadvertised source input preserves legacy host behavior', async () => {
		const h = connectionWithResponses([{ schema: { type: 'object', properties: {} }, values: {} }]);
		assert.strictEqual(await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), undefined);
		assert.strictEqual(h.calls.length, 1);
	});

	test('repository-dependent defaults replace the initial context defaults', async () => {
		const h = connectionWithResponses([
			{ schema, values: { branch: 'previous-context', obsolete: 'old-default' } },
			{ schema, values: { branch: 'repository-default', repositorySource: repository.toString() } },
		]);
		const config = await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None);
		assert.deepStrictEqual(config, { branch: 'repository-default', repositorySource: repository.toString() });
	});

	test('accepts a source input without optional revision support', async () => {
		const h = connectionWithResponses([
			{ schema: sourceOnlySchema, values: {} },
			{ schema: sourceOnlySchema, values: {} },
		]);
		assert.deepStrictEqual(await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), {
			repositorySource: repository.toString(),
		});
	});

	test('host-specific field names do not advertise the standard capability', () => {
		assert.strictEqual(supportsRepositorySessionConfig({
			type: 'object',
			properties: {
				source: { type: 'string', title: 'Source' },
				repositoryUrl: { type: 'string', title: 'Repository' },
			},
		}), false);
	});

	test('an older host without configuration discovery preserves legacy behavior', async () => {
		const h = connectionWithResponses([new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Unsupported')]);
		assert.strictEqual(await resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), undefined);
	});

	test('an advertised feature failing later is not treated as an unsupported host', async () => {
		const error = new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Configuration became unavailable');
		const h = connectionWithResponses([{ schema, values: {} }, error]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), error);
	});

	for (const property of ['repositorySource', 'repositoryRevision']) {
		for (const invalidProperty of [
			{ type: 'string', title: 'Repository input', readOnly: true },
			{ type: 'string', title: 'Repository input', sessionMutable: true },
			{ type: 'boolean', title: 'Repository input' },
		] satisfies SessionConfigPropertySchema[]) {
			test(`rejects an invalid standard input (${property}, ${JSON.stringify(invalidProperty)})`, () => {
				assert.throws(() => supportsRepositorySessionConfig({
					...schema,
					properties: { ...schema.properties, [property]: invalidProperty },
				}), /invalid repository configuration/);
			});
		}
	}

	test('rejects revision support without a source input', () => {
		assert.throws(() => supportsRepositorySessionConfig({
			type: 'object',
			properties: { repositoryRevision: { type: 'string', title: 'Revision' } },
		}), /invalid repository configuration/);
	});

	for (const config of [
		{ repositorySource: repository.toString() },
		{ repositoryRevision: 'main' },
	]) {
		test(`does not discard explicit inputs on an unsupported host (${JSON.stringify(config)})`, async () => {
			const h = connectionWithResponses([{ schema: { type: 'object', properties: {} }, values: {} }]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, config, CancellationToken.None), /does not advertise/);
		});

		test(`does not discard explicit inputs when discovery is unsupported (${JSON.stringify(config)})`, async () => {
			const error = new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Unsupported');
			const h = connectionWithResponses([error]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, config, CancellationToken.None), error);
		});
	}

	test('rejects a requested revision that the host does not advertise', async () => {
		const h = connectionWithResponses([{ schema: sourceOnlySchema, values: {} }]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { repositoryRevision: 'main' }, CancellationToken.None), /does not advertise repository revision/);
		assert.strictEqual(h.calls.length, 1);
	});

	test('fails if source support disappears during resolution', async () => {
		const h = connectionWithResponses([
			{ schema, values: {} },
			{ schema: { type: 'object', properties: {} }, values: {} },
		]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, undefined, CancellationToken.None), /changed its repository configuration/);
	});

	test('fails if support for a requested revision disappears during resolution', async () => {
		const h = connectionWithResponses([
			{ schema, values: {} },
			{ schema: sourceOnlySchema, values: {} },
		]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { repositoryRevision: 'main' }, CancellationToken.None), /does not advertise repository revision/);
	});

	for (const revision of [null, 17, '', '   ']) {
		test(`rejects an invalid explicit revision (${JSON.stringify(revision)})`, async () => {
			const h = connectionWithResponses([{ schema, values: {} }]);
			await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { repositoryRevision: revision }, CancellationToken.None), /nonempty string/);
			assert.strictEqual(h.calls.length, 1);
		});
	}

	test('does not silently replace an explicitly configured repository', async () => {
		const h = connectionWithResponses([]);
		await assert.rejects(resolveAgentHostRepositoryConfig(h.connection, 'provider', repository, { repositorySource: 'https://example.com/another/repo' }, CancellationToken.None), /conflicts/);
		assert.deepStrictEqual(h.calls, []);
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
			assert.throws(() => getRepositorySessionSource({ schema, values: { repositorySource: source } }), /invalid repository selection/);
		});
	}

	test('rejects a revision without a source in session state', () => {
		assert.throws(() => getRepositorySessionSource({ schema, values: { repositoryRevision: 'main' } }), /invalid repository selection/);
	});

	test('rejects unadvertised repository state rather than treating it as a directory session', () => {
		assert.throws(() => getRepositorySessionSource({
			schema: { type: 'object', properties: {} },
			values: { repositorySource: repository.toString() },
		}), /invalid repository selection/);
	});

	function session(lifecycle: SessionLifecycle, withRepository = true): SessionState {
		return upcastPartial<SessionState>({
			lifecycle,
			workingDirectories: lifecycle === SessionLifecycle.Ready ? ['file:///checkout/repo'] : undefined,
			config: withRepository ? { schema, values: { repositorySource: repository.toString() } } : undefined,
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
		const h = subscription({ ...session(SessionLifecycle.Ready), config: { schema, values: { repositorySource: 'https://example.com/another/repo' } } });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository), /did not report a ready checkout/);
	});

	test('lost-response recovery must also preserve an explicitly requested revision', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), config: { schema, values: { repositorySource: repository.toString(), repositoryRevision: 'other' } } });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository, { repositoryRevision: 'main' }), /did not report a ready checkout/);
	});

	test('lost-response recovery does not forget a requested revision when its schema entry disappears', async () => {
		const h = subscription({ ...session(SessionLifecycle.Ready), config: { schema: sourceOnlySchema, values: { repositorySource: repository.toString() } } });
		await assert.rejects(waitForRepositorySessionReady(h.sub, CancellationToken.None, repository, { repositoryRevision: 'main' }), /did not report a ready checkout/);
	});

	test('one repository can resolve to multiple working directories', async () => {
		const state = { ...session(SessionLifecycle.Ready), workingDirectories: ['file:///checkout/repo/packages/api', 'file:///checkout/repo/packages/web'] };
		const h = subscription(state);
		assert.strictEqual(await waitForRepositorySessionReady(h.sub, CancellationToken.None, repository), state);
	});

	test('advertising repository inputs without selecting a source preserves directory session behavior', async () => {
		const state = { ...session(SessionLifecycle.Creating), config: { schema, values: { mode: 'interactive' } } };
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
