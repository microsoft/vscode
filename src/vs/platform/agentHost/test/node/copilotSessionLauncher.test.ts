/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, IByokLmProxyService, type IByokLmProxyHandle } from '../../node/copilot/byokLmProxyService.js';
import { CopilotSessionLauncher, filterClientToolNames, getCopilotReasoningEffort, resolveByokSessionConfig, resolveConfiguredReasoningEffortOverride, resolveCopilotReasoningEffort } from '../../node/copilot/copilotSessionLauncher.js';

/**
 * Covers the BYOK provider/model synthesis the launcher feeds into
 * `createSession` / `resumeSession`. The first four tests pin the gating and
 * graceful-degradation branches plus the exact SDK config shape using a real
 * {@link ByokLmBridgeRegistry} and a counting proxy thunk (no real proxy). The
 * last test wires the synthesized config straight into a live
 * {@link ByokLmProxyService} and POSTs at it, proving the launcher's output is
 * consumable end-to-end: provider `baseUrl` + `Bearer <nonce>.<sessionId>` +
 * `model = id` route through the proxy to the renderer bridge.
 */
suite('resolveByokSessionConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionId = 'sess-1';
	const log = new NullLogService();

	/** Minimal bridge connection: a scripted `listModels` and an unused `chat`. */
	function connectionOf(listModels: () => Promise<IByokLmModelInfo[]>) {
		return { chat: async (): Promise<IByokLmChatResult> => ({ content: '' }), listModels };
	}

	/** A fake proxy handle plus a `startProxy` thunk that records its call count. */
	function countingProxy() {
		let starts = 0;
		const handle: IByokLmProxyHandle = {
			baseUrl: 'http://127.0.0.1:1',
			nonce: 'NONCE',
			providerBaseUrl: vendor => `http://127.0.0.1:1/v/${vendor}`,
			dispose: () => { },
		};
		return {
			get starts() { return starts; },
			startProxy: async () => { starts++; return handle; },
		};
	}

	test('returns empty and never starts the proxy when no bridge is active', async () => {
		const registry = new ByokLmBridgeRegistry();
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);

		assert.deepStrictEqual(config, {});
		assert.strictEqual(proxy.starts, 0);
	});

	test('returns empty and never starts the proxy when the bridge reports no models', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', connectionOf(async () => []));
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config, {});
		assert.strictEqual(proxy.starts, 0);
	});

	test('returns empty and never starts the proxy when enumeration fails', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', connectionOf(async () => { throw new Error('renderer gone'); }));
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config, {});
		assert.strictEqual(proxy.starts, 0);
	});

	test('synthesizes deduped providers and per-model config from the active bridge', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', connectionOf(async () => [
			{ vendor: 'acme', id: 'claude', name: 'Acme Claude', maxContextWindowTokens: 200000 },
			{ vendor: 'acme', id: 'gpt', name: undefined, maxContextWindowTokens: undefined },
			{ vendor: 'globex', id: 'llama', name: 'Globex Llama' },
		]));
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.strictEqual(proxy.starts, 1);
		assert.deepStrictEqual(config, {
			providers: [
				{ name: 'acme', type: 'openai', wireApi: 'completions', baseUrl: 'http://127.0.0.1:1/v/acme', bearerToken: 'NONCE.sess-1' },
				{ name: 'globex', type: 'openai', wireApi: 'completions', baseUrl: 'http://127.0.0.1:1/v/globex', bearerToken: 'NONCE.sess-1' },
			],
			models: [
				{ id: 'claude', provider: 'acme', name: 'Acme Claude', maxContextWindowTokens: 200000 },
				{ id: 'gpt', provider: 'acme' },
				{ id: 'llama', provider: 'globex', name: 'Globex Llama' },
			],
		});
	});

	test('synthesized provider config routes through a live proxy to the bridge', async () => {
		const registry = new ByokLmBridgeRegistry();
		let captured: IByokLmChatRequest | undefined;
		const registration = registry.register('client-1', {
			chat: async (request) => { captured = request; return { content: 'hello from byok' }; },
			listModels: async () => [{ vendor: 'acme', id: 'claude' }],
		});
		const service = new ByokLmProxyService(log, registry);
		let handle: IByokLmProxyHandle | undefined;

		const config = await resolveByokSessionConfig(sessionId, registry, async () => (handle = await service.start()), log);
		const provider = config.providers![0];
		const model = config.models![0];
		try {
			const response = await fetch(`${provider.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.bearerToken}` },
				body: JSON.stringify({ model: model.id, messages: [{ role: 'user', content: 'hi' }] }),
			});
			assert.strictEqual(response.status, 200);
			const text = await response.text();
			assert.ok(text.includes('hello from byok'), `expected content in SSE: ${text}`);
		} finally {
			handle?.dispose();
			registration.dispose();
			service.dispose();
		}
		assert.strictEqual(captured?.vendor, 'acme');
		assert.strictEqual(captured?.modelId, 'claude');
	});

	test('resume reads the warm cache without a live renderer round-trip', async () => {
		const registry = new ByokLmBridgeRegistry();
		let calls = 0;
		const registration = registry.register('client-1', connectionOf(async () => {
			calls++;
			return [{ vendor: 'acme', id: 'claude', name: 'Acme Claude' }];
		}));
		const proxy = countingProxy();

		// Warm the cache so a serving window has answered.
		await registry.listModels();
		const callsAfterWarmup = calls;

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log, /*preferCache*/ true);
		registration.dispose();

		assert.deepStrictEqual({ calls, models: config.models }, {
			calls: callsAfterWarmup,
			models: [{ id: 'claude', provider: 'acme', name: 'Acme Claude' }],
		});
	});

	test('resume falls back to a live enumeration when the cache is still cold', async () => {
		const registry = new ByokLmBridgeRegistry();
		let resolveList!: (models: IByokLmModelInfo[]) => void;
		const gate = new Promise<IByokLmModelInfo[]>(resolve => { resolveList = resolve; });
		const registration = registry.register('client-1', connectionOf(() => gate));
		const proxy = countingProxy();

		// The connection registered but hasn't answered yet, so the cache is cold.
		assert.strictEqual(registry.getServingConnection(), undefined);

		const configPromise = resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log, /*preferCache*/ true);
		resolveList([{ vendor: 'acme', id: 'claude' }]);
		const config = await configPromise;
		registration.dispose();

		assert.deepStrictEqual(config.models, [{ id: 'claude', provider: 'acme' }]);
	});

	test('resume falls back to a live enumeration when the warm cache is empty', async () => {
		const registry = new ByokLmBridgeRegistry();
		let models: IByokLmModelInfo[] = [];
		const registration = registry.register('client-1', connectionOf(async () => models));
		const proxy = countingProxy();

		// Warm the cache while the window reports no models yet: serving, but empty.
		await registry.listModels();
		assert.notStrictEqual(registry.getServingConnection(), undefined);
		assert.deepStrictEqual([...registry.getModels()], []);

		// The window now has models; resume must re-enumerate to surface them
		// rather than trust the stale empty cache.
		models = [{ vendor: 'acme', id: 'claude' }];
		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log, /*preferCache*/ true);
		registration.dispose();

		assert.deepStrictEqual(config.models, [{ id: 'claude', provider: 'acme' }]);
	});

	test('create enumerates live even when the cache is warm', async () => {
		const registry = new ByokLmBridgeRegistry();
		let calls = 0;
		const registration = registry.register('client-1', connectionOf(async () => {
			calls++;
			return [{ vendor: 'acme', id: 'claude' }];
		}));
		const proxy = countingProxy();

		// Warm the cache first, then confirm create still re-enumerates.
		await registry.listModels();
		const callsAfterWarmup = calls;

		await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log, /*preferCache*/ false);
		registration.dispose();

		assert.strictEqual(calls > callsAfterWarmup, true);
	});
});

/**
 * Covers the launcher's lazy memoization and disposal of the shared BYOK proxy
 * handle: concurrent launches share one bind, and
 * {@link CopilotSessionLauncher.disposeByokProxyHandle} (called by the agent
 * after the runtime subprocess stops) releases it so the next launch mints a
 * fresh nonce.
 */
suite('CopilotSessionLauncher BYOK proxy lifecycle', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionId = 'sess-1';

	/** Minimal bridge connection: a scripted `listModels` and an unused `chat`. */
	function connectionOf(listModels: () => Promise<IByokLmModelInfo[]>) {
		return { chat: async (): Promise<IByokLmChatResult> => ({ content: '' }), listModels };
	}

	/** A fake proxy service whose handles carry a unique nonce per `start()`. */
	function fakeProxyService() {
		let starts = 0;
		let disposes = 0;
		const service: IByokLmProxyService = {
			_serviceBrand: undefined,
			start: async (): Promise<IByokLmProxyHandle> => {
				const nonce = `NONCE-${++starts}`;
				return {
					baseUrl: 'http://127.0.0.1:1',
					nonce,
					providerBaseUrl: vendor => `http://127.0.0.1:1/v/${vendor}`,
					dispose: () => { disposes++; },
				};
			},
			dispose: () => { },
		};
		return { service, get starts() { return starts; }, get disposes() { return disposes; } };
	}

	function createLauncher(store: DisposableStore, proxy: IByokLmProxyService, registry: IByokLmBridgeRegistry): CopilotSessionLauncher {
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IByokLmProxyService, proxy);
		services.set(IByokLmBridgeRegistry, registry);
		// The launcher's other dependencies are unused by the BYOK path and
		// resolve to `undefined` under the non-strict InstantiationService.
		const instantiationService = store.add(new InstantiationService(services));
		return instantiationService.createInstance(CopilotSessionLauncher);
	}

	test('memoizes the handle, and disposeByokProxyHandle releases it so the next launch mints a fresh nonce', async () => {
		const store = new DisposableStore();
		const proxy = fakeProxyService();
		const registry = new ByokLmBridgeRegistry();
		store.add(registry.register('client-1', connectionOf(async () => [{ vendor: 'acme', id: 'claude' }])));
		const launcher = createLauncher(store, proxy.service, registry);
		const resolve = () => (launcher as unknown as { _resolveByokSessionConfig(id: string): Promise<{ providers?: { bearerToken: string }[] }> })._resolveByokSessionConfig(sessionId);

		const first = await resolve();
		const second = await resolve();
		assert.strictEqual(proxy.starts, 1, 'subsequent launches share the memoized bind');
		assert.strictEqual(first.providers![0].bearerToken, second.providers![0].bearerToken, 'the shared bind reuses one nonce');

		await launcher.disposeByokProxyHandle();
		await launcher.disposeByokProxyHandle();
		assert.strictEqual(proxy.disposes, 1, 'the handle is released exactly once and disposal is idempotent');

		const third = await resolve();
		assert.strictEqual(proxy.starts, 2, 'a fresh bind is minted after disposal');
		assert.notStrictEqual(third.providers![0].bearerToken, first.providers![0].bearerToken, 'the fresh bind carries a new nonce');

		store.dispose();
	});
});

/**
 * Covers the reasoning-effort resolution fed into `createSession` and
 * `CopilotAgent._changeModel`: the host-level override (see
 * `CopilotCliConfigKey.ReasoningEffortOverride`) wins over the model picker's
 * thinking level when valid, and degrades to the picker value otherwise.
 */
suite('getCopilotReasoningEffort', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a valid override wins over the picker value; an invalid or absent override falls back', () => {
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		assert.deepStrictEqual(
			[
				getCopilotReasoningEffort(model),
				getCopilotReasoningEffort(model, 'xhigh'),
				getCopilotReasoningEffort(model, 'turbo'),
				getCopilotReasoningEffort(undefined, 'high'),
				getCopilotReasoningEffort(undefined),
			],
			['medium', 'xhigh', 'medium', 'high', undefined]
		);
	});
});

/**
 * Covers the full config-driven precedence chain: the per-model capability
 * override (specific id, then the `*` wildcard) wins over the global override,
 * which wins over the picker's thinking level; an invalid value at either
 * stage falls through to the next.
 */
suite('resolveCopilotReasoningEffort', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Stubs the config service with a fixed root-value bag. */
	function configOf(values: SchemaValues<typeof copilotCliConfigSchema.definition>): Pick<IAgentConfigurationService, 'getRootValue'> {
		// The runtime value is correct by construction; `never` satisfies the
		// generic return type without widening the stub to `any`.
		return { getRootValue: (_schema, key) => values[key as keyof typeof values] as never };
	}

	test('per-model override beats global override beats picker; invalid stages fall through', () => {
		const log = new NullLogService();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		assert.deepStrictEqual(
			[
				// per-model (specific id) wins over global + picker
				resolveCopilotReasoningEffort(model, configOf({ reasoningEffortOverride: 'xhigh', modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				// wildcard entry applies to any model; a specific entry wins over it
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' } } }), log, 's1'),
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' }, 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				// invalid per-model falls through to the global override
				resolveCopilotReasoningEffort(model, configOf({ reasoningEffortOverride: 'xhigh', modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'turbo' } } }), log, 's1'),
				// no per-model entry, unset global ('' marker) → picker value
				resolveCopilotReasoningEffort(model, configOf({ reasoningEffortOverride: '' }), log, 's1'),
				// no model (server-side "Auto"): the `*` entry still matches, and
				// beats the global override just as it does for a known model
				resolveCopilotReasoningEffort(undefined, configOf({ reasoningEffortOverride: 'high', modelCapabilityOverrides: { '*': { reasoningEffort: 'low' } } }), log, 's1'),
				// no model and no wildcard → the global override applies
				resolveCopilotReasoningEffort(undefined, configOf({ reasoningEffortOverride: 'high', modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
			],
			['low', 'high', 'low', 'xhigh', 'medium', 'low', 'high']
		);
	});

	test('resolveConfiguredReasoningEffortOverride reports only the configured override, never the picker value', () => {
		const log = new NullLogService();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		assert.deepStrictEqual(
			[
				// same precedence as the full resolution...
				resolveConfiguredReasoningEffortOverride(model, configOf({ reasoningEffortOverride: 'xhigh', modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				resolveConfiguredReasoningEffortOverride(model, configOf({ reasoningEffortOverride: 'xhigh', modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'turbo' } } }), log, 's1'),
				// ...but with no picker fallback: nothing configured (or only
				// invalid values) reads as "leave the session's effort alone",
				// which is what the resume path forwards.
				resolveConfiguredReasoningEffortOverride(model, configOf({ reasoningEffortOverride: '' }), log, 's1'),
				resolveConfiguredReasoningEffortOverride(model, configOf({ reasoningEffortOverride: 'turbo' }), log, 's1'),
				resolveConfiguredReasoningEffortOverride(model, configOf({}), log, 's1'),
			],
			['low', 'xhigh', undefined, undefined, undefined]
		);
	});
});

/**
 * Covers the prompt-gate view of the per-model tool filters: client tools are
 * all `custom:`-source, so a tool is excluded by its bare name, `custom:<name>`,
 * or `custom:*` — and `excludedTools` wins over `availableTools`, mirroring
 * the SDK. Ensures the system message never advertises a filtered-out tool.
 */
suite('filterClientToolNames', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies allow/deny patterns with excludedTools winning; other sources never match', () => {
		const names = new Set(['openBrowserPage', 'readPage', 'runTask']);
		const resolve = (available?: string[], excluded?: string[]) => [...filterClientToolNames(names, available, excluded)].sort();
		assert.deepStrictEqual(
			[
				// no filters → same set (and same instance semantics: everything survives)
				resolve(undefined, undefined),
				// bare-name, source-qualified, and source-wildcard exclusion
				resolve(undefined, ['openBrowserPage']),
				resolve(undefined, ['custom:readPage']),
				resolve(undefined, ['custom:*']),
				// builtin/mcp patterns never match client tools
				resolve(undefined, ['builtin:*', 'mcp:*', 'bash']),
				// allowlist keeps only matches; excludedTools wins over availableTools
				resolve(['openBrowserPage', 'custom:readPage'], undefined),
				resolve(['custom:*'], ['openBrowserPage']),
			],
			[
				['openBrowserPage', 'readPage', 'runTask'],
				['readPage', 'runTask'],
				['openBrowserPage', 'runTask'],
				[],
				['openBrowserPage', 'readPage', 'runTask'],
				['openBrowserPage', 'readPage'],
				['readPage', 'runTask'],
			]
		);
	});
});

/**
 * Covers the session config the launcher hands to `resumeSession`: a resumed
 * session keeps the effort the runtime persisted for it unless the host has an
 * override configured, in which case the override re-applies at resume (create
 * always resolves the full effort in `_createSession`).
 */
suite('CopilotSessionLauncher resume config', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Builds a launcher over a config service stubbed with a fixed root-value bag. */
	function createLauncher(store: DisposableStore, values: SchemaValues<typeof copilotCliConfigSchema.definition>): CopilotSessionLauncher {
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IByokLmBridgeRegistry, new ByokLmBridgeRegistry());
		services.set(IAgentConfigurationService, {
			_serviceBrand: undefined,
			getRootValue: (_schema: unknown, key: string) => values[key as keyof typeof values],
		} as unknown as IAgentConfigurationService);
		// The launcher's other dependencies are unused by this path and resolve
		// to `undefined` under the non-strict InstantiationService.
		const instantiationService = store.add(new InstantiationService(services));
		return instantiationService.createInstance(CopilotSessionLauncher);
	}

	/** Invokes the private config builder with a minimal resume plan. */
	function buildResumeConfig(launcher: CopilotSessionLauncher, model: ModelSelection | undefined): Promise<{ reasoningEffort?: string; excludedTools?: string[] }> {
		const plan = {
			kind: 'resume',
			client: { createSession: async () => { throw new Error('unused'); }, resumeSession: async () => { throw new Error('unused'); } },
			sessionId: 'sess-1',
			workingDirectory: URI.file('/workspace'),
			resolvedAgentName: undefined,
			snapshot: { tools: [], plugins: [], mcpServers: {} },
			activeClientToolSet: new ActiveClientToolSet(),
			shellManager: undefined,
			githubToken: 'token',
			fallback: { model },
		};
		const runtime = { createClientSdkTools: () => [], createServerSdkTools: () => [] };
		return (launcher as unknown as { _buildSessionConfig(plan: unknown, runtime: unknown): Promise<{ reasoningEffort?: string; excludedTools?: string[] }> })._buildSessionConfig(plan, runtime);
	}

	test('forwards a configured override on resume and leaves the effort untouched otherwise', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		const perModel = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), model);
		const global = await buildResumeConfig(createLauncher(store, { reasoningEffortOverride: 'xhigh' }), model);
		// The picker value is NOT re-sent: without an override the resumed
		// session keeps whatever effort the runtime persisted for it.
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		assert.deepStrictEqual(
			[perModel.reasoningEffort, global.reasoningEffort, none.reasoningEffort],
			['low', 'xhigh', undefined]
		);
		store.dispose();
	});

	test('a session with no stored model still gets the wildcard entry effort and tool filters', async () => {
		const store = new DisposableStore();
		// Sessions created without an explicit model (server-side "Auto") resume
		// with `fallback.model === undefined`; `*` means every session, so
		// exempting them would make the entry mean "every model except Auto".
		const launcher = createLauncher(store, { modelCapabilityOverrides: { '*': { reasoningEffort: 'high', excludedTools: ['mcp:*'] }, 'gpt-5': { reasoningEffort: 'low' } } });
		const config = await buildResumeConfig(launcher, undefined);

		assert.deepStrictEqual(
			[config.reasoningEffort, config.excludedTools],
			['high', ['mcp:*']]
		);
		store.dispose();
	});
});
