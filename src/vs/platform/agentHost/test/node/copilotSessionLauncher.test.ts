/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient, CopilotSession, Verbosity } from '@github/copilot-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import type { IAgentHostManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import type { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import { CustomizationType, type ModelSelection } from '../../common/state/protocol/state.js';
import { reasoningEffortLevels } from '../../common/reasoningEffort.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import type { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import type { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, IByokLmProxyService, type IByokLmProxyHandle } from '../../node/copilot/byokLmProxyService.js';
import { CopilotSessionLauncher, filterClientToolNames, getCopilotReasoningEffort, isCopilotReasoningEffort, resolveByokSessionConfig, resolveConfiguredReasoningEffortOverride, resolveCopilotReasoningEffort, toSdkToolFilterPatterns, type CopilotSessionLaunchPlan, type ICopilotSessionRuntime } from '../../node/copilot/copilotSessionLauncher.js';
import type { ICopilotPluginInfo } from '../../node/copilot/copilotAgent.js';

const testRuntime: ICopilotSessionRuntime = {
	handlePermissionRequest: async () => { throw new Error('Unexpected permission request'); },
	handleExitPlanModeRequest: async () => { throw new Error('Unexpected exit plan mode request'); },
	handleUserInputRequest: async () => { throw new Error('Unexpected user input request'); },
	handleElicitationRequest: async () => { throw new Error('Unexpected elicitation request'); },
	handleMcpAuthRequest: async () => { throw new Error('Unexpected MCP auth request'); },
	requestUnsandboxedCommandConfirmation: async () => false,
	handlePreToolUse: async () => { },
	handlePostToolUse: async () => { },
	createClientSdkTools: () => [],
	createServerSdkTools: () => [],
};

const testWorkingDirectory = URI.file(process.cwd());

function createTestLauncher(managedSettingsPermissions?: IAgentHostManagedSettingsPermissions): CopilotSessionLauncher {
	const configurationService = {
		getRootValue: () => undefined,
	} as Partial<IAgentConfigurationService> as IAgentConfigurationService;
	return new CopilotSessionLauncher(
		configurationService,
		{ permissions: managedSettingsPermissions ?? {} } as IAgentHostManagedSettingsService,
		{} as IAgentHostTerminalManager,
		new NullLogService(),
		{} as IFileService,
		{ _serviceBrand: undefined, start: async () => { throw new Error('Unexpected proxy start'); }, dispose: () => { } },
		new ByokLmBridgeRegistry(),
		{
			_serviceBrand: undefined,
			getSessionTraceContext: () => undefined,
			releaseSessionTraceContext: () => { },
			withTraceContext: <T>(_context: undefined, fn: () => T): T => fn(),
		} as unknown as IAgentHostOTelService,
	);
}

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

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionId = 'sess-1';
	const log = new NullLogService();

	/**
	 * A bridge connection that pushes `models` as its snapshot synchronously when
	 * the registry subscribes; `chat` is scripted (unused by most tests).
	 */
	function connectionOf(models: IByokLmModelInfo[], chat: IByokLmBridgeConnection['chat'] = async () => ({ output: [] })): IByokLmBridgeConnection {
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>({
			onDidAddFirstListener: () => emitter.fire(models),
		}));
		return { chat, onDidChangeModels: emitter.event };
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
		const registration = registry.register('client-1', connectionOf([]));
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config, {});
		assert.strictEqual(proxy.starts, 0);
	});

	test('returns empty and never starts the proxy for a window that never pushes a snapshot', async () => {
		const registry = new ByokLmBridgeRegistry();
		// A window connected without a BYOK handler never pushes, so it stays
		// non-serving and contributes no models.
		const registration = registry.register('client-1', { chat: async (): Promise<IByokLmChatResult> => ({ output: [] }), onDidChangeModels: Event.None });
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config, {});
		assert.strictEqual(proxy.starts, 0);
	});

	test('synthesizes deduped providers and per-model config from the active bridge', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', connectionOf([
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
				{ name: 'acme', type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1/v/acme', bearerToken: 'NONCE.sess-1' },
				{ name: 'globex', type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1/v/globex', bearerToken: 'NONCE.sess-1' },
			],
			models: [
				{ id: 'claude', provider: 'acme', name: 'Acme Claude', maxContextWindowTokens: 200000 },
				{ id: 'gpt', provider: 'acme' },
				{ id: 'llama', provider: 'globex', name: 'Globex Llama' },
			],
		});
	});

	test('preserves provider groups when models share a vendor and id', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', connectionOf([
			{ vendor: 'google', id: 'gemini-2.5-pro', modelIdentifier: 'google/Gemini Personal/gemini-2.5-pro' },
			{ vendor: 'google', id: 'gemini-2.5-pro', modelIdentifier: 'google/Gemini Work/gemini-2.5-pro' },
		]));
		const proxy = countingProxy();

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config.models, [
			{ id: 'Gemini Personal/gemini-2.5-pro', provider: 'google' },
			{ id: 'Gemini Work/gemini-2.5-pro', provider: 'google' },
		]);
	});

	test('synthesized provider config routes through a live proxy to the bridge', async () => {
		const registry = new ByokLmBridgeRegistry();
		let captured: IByokLmChatRequest | undefined;
		const registration = registry.register('client-1', connectionOf(
			[{ vendor: 'acme', id: 'claude' }],
			async (request) => {
				captured = request;
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'hello from byok' }] }] };
			},
		));
		const service = new ByokLmProxyService(log, registry);
		let handle: IByokLmProxyHandle | undefined;

		const config = await resolveByokSessionConfig(sessionId, registry, async () => (handle = await service.start()), log);
		const provider = config.providers![0];
		const model = config.models![0];
		try {
			const response = await fetch(`${provider.baseUrl}/responses`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.bearerToken}` },
				body: JSON.stringify({ model: model.id, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }] }),
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

	test('reads the latest pushed snapshot from the registry cache', async () => {
		const registry = new ByokLmBridgeRegistry();
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>());
		const registration = registry.register('client-1', {
			chat: async (): Promise<IByokLmChatResult> => ({ output: [] }),
			onDidChangeModels: emitter.event,
		});
		const proxy = countingProxy();

		// The window starts serving-but-empty, then pushes a model; the resolved
		// config reflects the latest cached push with no renderer round-trip.
		emitter.fire([]);
		emitter.fire([{ vendor: 'acme', id: 'claude', name: 'Acme Claude' }]);

		const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
		registration.dispose();

		assert.deepStrictEqual(config.models, [{ id: 'claude', provider: 'acme', name: 'Acme Claude' }]);
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

	/**
	 * A bridge connection that pushes `models` as its snapshot synchronously when
	 * the registry subscribes; the backing emitter is owned by `store`.
	 */
	function connectionOf(store: DisposableStore, models: IByokLmModelInfo[]): IByokLmBridgeConnection {
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>({
			onDidAddFirstListener: () => emitter.fire(models),
		}));
		return { chat: async (): Promise<IByokLmChatResult> => ({ output: [] }), onDidChangeModels: emitter.event };
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
		store.add(registry.register('client-1', connectionOf(store, [{ vendor: 'acme', id: 'claude' }])));
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

suite('CopilotSessionLauncher shared session config', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes Agent Host defaults, managed permissions, and exit-plan handler to create and resume', async () => {
		const createConfigs: Parameters<CopilotClient['createSession']>[0][] = [];
		const resumeConfigs: Parameters<CopilotClient['resumeSession']>[1][] = [];
		const session = {
			sessionId: 'session-1',
			on: () => () => { },
			disconnect: async () => { },
		} as unknown as CopilotSession;
		const client = {
			createSession: async (config: Parameters<CopilotClient['createSession']>[0]) => {
				createConfigs.push(config);
				return session;
			},
			resumeSession: async (_sessionId: string, config: Parameters<CopilotClient['resumeSession']>[1]) => {
				resumeConfigs.push(config);
				return session;
			},
		};
		const managedSettingsPermissions: IAgentHostManagedSettingsPermissions = {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		};
		const launcher = createTestLauncher(managedSettingsPermissions);
		const pluginDir = URI.file('/tmp/synced-customizations');
		const skillUri = URI.joinPath(pluginDir, 'skills', 'user-skill', 'SKILL.md');
		const instructionUri = URI.joinPath(pluginDir, 'rules', 'user.instructions.md');
		const plugin: ICopilotPluginInfo = {
			format: PluginFormat.Copilot,
			hooks: [],
			mcpServers: [],
			agents: [],
			skills: [{
				uri: skillUri,
				name: 'user-skill',
				customization: { type: CustomizationType.Skill, id: skillUri.toString(), uri: skillUri.toString(), name: 'user-skill' },
			}],
			instructions: [{
				uri: instructionUri,
				name: 'user',
				customization: { type: CustomizationType.Rule, id: instructionUri.toString(), uri: instructionUri.toString(), name: 'user', alwaysApply: true },
			}],
			pluginDir,
		};
		const basePlan = {
			client,
			sessionId: 'session-1',
			workingDirectory: testWorkingDirectory,
			resolvedAgentName: undefined,
			snapshot: { tools: [], plugins: [plugin], mcpServers: {} },
			activeClientToolSet: new ActiveClientToolSet(),
			shellManager: undefined,
			githubToken: undefined,
		};
		const createPlan: CopilotSessionLaunchPlan = {
			...basePlan,
			kind: 'create',
			model: undefined,
		};
		const resumePlan: CopilotSessionLaunchPlan = {
			...basePlan,
			kind: 'resume',
			fallback: { model: undefined },
		};

		const sessions = new DisposableStore();
		try {
			sessions.add(await launcher.launch(createPlan, testRuntime));
			sessions.add(await launcher.launch(resumePlan, testRuntime));

			assert.deepStrictEqual({
				createClientName: createConfigs[0].clientName,
				createGitHubMcpToolConfig: createConfigs[0].githubMcpToolConfig,
				createPluginDirectories: createConfigs[0].pluginDirectories,
				createSkillDirectories: createConfigs[0].skillDirectories,
				createInstructionDirectories: createConfigs[0].instructionDirectories,
				createHasExitPlanHandler: typeof createConfigs[0].onExitPlanModeRequest === 'function',
				createLargeOutput: createConfigs[0].largeOutput,
				createManagedSettings: createConfigs[0].managedSettings,
				resumeClientName: resumeConfigs[0].clientName,
				resumeGitHubMcpToolConfig: resumeConfigs[0].githubMcpToolConfig,
				resumePluginDirectories: resumeConfigs[0].pluginDirectories,
				resumeSkillDirectories: resumeConfigs[0].skillDirectories,
				resumeInstructionDirectories: resumeConfigs[0].instructionDirectories,
				resumeHasExitPlanHandler: typeof resumeConfigs[0].onExitPlanModeRequest === 'function',
				resumeLargeOutput: resumeConfigs[0].largeOutput,
				resumeManagedSettings: resumeConfigs[0].managedSettings,
			}, {
				createClientName: 'vscode-agent-host',
				createGitHubMcpToolConfig: { disableFormDeferral: true },
				createPluginDirectories: [pluginDir.fsPath],
				createSkillDirectories: [],
				createInstructionDirectories: [URI.joinPath(pluginDir, 'rules').fsPath],
				createHasExitPlanHandler: true,
				createLargeOutput: { maxSizeBytes: 8192 },
				createManagedSettings: { permissions: managedSettingsPermissions },
				resumeClientName: 'vscode-agent-host',
				resumeGitHubMcpToolConfig: { disableFormDeferral: true },
				resumePluginDirectories: [pluginDir.fsPath],
				resumeSkillDirectories: [],
				resumeInstructionDirectories: [URI.joinPath(pluginDir, 'rules').fsPath],
				resumeHasExitPlanHandler: true,
				resumeLargeOutput: { maxSizeBytes: 8192 },
				resumeManagedSettings: { permissions: managedSettingsPermissions },
			});
		} finally {
			sessions.dispose();
			await launcher.disposeByokProxyHandle();
		}
	});
});

suite('CopilotSessionLauncher resume fallback', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestSdkError extends Error {
		constructor(message: string, readonly code: number) {
			super(message);
		}
	}

	function createResumeFailingLaunch(message: string, code = -32603): { readonly launcher: CopilotSessionLauncher; readonly plan: CopilotSessionLaunchPlan; readonly getCreateSessionCalls: () => number } {
		let createSessionCalls = 0;
		const session = {
			sessionId: 'session-1',
			on: () => () => { },
			disconnect: async () => { },
		} as unknown as CopilotSession;
		const client = {
			createSession: async () => {
				createSessionCalls++;
				return session;
			},
			resumeSession: async () => {
				throw new TestSdkError(message, code);
			},
		};
		return {
			launcher: createTestLauncher(),
			plan: {
				client,
				sessionId: 'session-1',
				workingDirectory: testWorkingDirectory,
				resolvedAgentName: undefined,
				snapshot: { tools: [], plugins: [], mcpServers: {} },
				activeClientToolSet: new ActiveClientToolSet(),
				shellManager: undefined,
				githubToken: undefined,
				kind: 'resume',
				fallback: { model: undefined },
			},
			getCreateSessionCalls: () => createSessionCalls,
		};
	}

	test('falls back to createSession after a Start Over truncate leaves the session empty', async () => {
		const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch(`Request session.resume failed with message: LocalRpcSession: 'session.getMessages' returned no events for session session-1`);

		const sessions = new DisposableStore();
		try {
			sessions.add(await launcher.launch(plan, testRuntime));
			assert.strictEqual(getCreateSessionCalls(), 1);
		} finally {
			sessions.dispose();
			await launcher.disposeByokProxyHandle();
		}
	});

	test('falls back to createSession when the SDK reports the session was not found', async () => {
		const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch('Request session.resume failed with message: Session not found: session-1');

		const sessions = new DisposableStore();
		try {
			sessions.add(await launcher.launch(plan, testRuntime));
			assert.strictEqual(getCreateSessionCalls(), 1);
		} finally {
			sessions.dispose();
			await launcher.disposeByokProxyHandle();
		}
	});

	test('does not replace a session with an empty one after a transient network failure', async () => {
		// Regression: this used to fall through to `createSession`, presenting a
		// session with real history as having zero turns — which the empty-session
		// GC then deleted along with its worktree.
		const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch('Request session.resume failed with message: network fetch failed: request failed: error sending request for url (https://api.github.com/copilot_internal/user)');

		try {
			await assert.rejects(() => launcher.launch(plan, testRuntime), /network fetch failed/);
			assert.strictEqual(getCreateSessionCalls(), 0);
		} finally {
			await launcher.disposeByokProxyHandle();
		}
	});

	test('does not replace a session with an empty one for an unrecognized -32603', async () => {
		const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch('Request session.resume failed: something went wrong');

		try {
			await assert.rejects(() => launcher.launch(plan, testRuntime), /something went wrong/);
			assert.strictEqual(getCreateSessionCalls(), 0);
		} finally {
			await launcher.disposeByokProxyHandle();
		}
	});

	test('does not replace a corrupted session file with an empty session', async () => {
		const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch('Request session.resume failed with message: Session file is corrupted (line 19567: data.compactionTokensUsed.copilotUsage.tokenDetails.0.batchSize: Number must be greater than 0)');

		try {
			await assert.rejects(() => launcher.launch(plan, testRuntime), /Session file is corrupted/);
			assert.strictEqual(getCreateSessionCalls(), 0);
		} finally {
			await launcher.disposeByokProxyHandle();
		}
	});
});

suite('CopilotSessionLauncher verbosity', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function applyVerbosity(verbosity: Verbosity): Promise<void> {
		const launcher = createTestLauncher() as unknown as {
			_applyVerbosity(session: CopilotSession, verbosity: Verbosity, sessionId: string): Promise<void>;
		};
		const session = {
			rpc: {
				options: {
					update: async (options: unknown) => updates.push(options),
				},
			},
		} as unknown as CopilotSession;
		return launcher._applyVerbosity(session, verbosity, 'session-1');
	}

	const updates: unknown[] = [];

	setup(() => updates.length = 0);

	test('forwards the requested verbosity', async () => {
		await applyVerbosity('high');

		assert.deepStrictEqual(updates, [{ verbosity: 'high' }]);
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

	// The model picker's options are `supportedReasoningEfforts.filter(isCopilotReasoningEffort)`,
	// so any tier this guard rejects silently disappears from the picker — that is how `'max'`
	// went missing. The guard must therefore recognize every canonical tier; re-introducing a
	// narrower private allow-list here has to fail.
	test('recognizes every canonical reasoning-effort tier so none is dropped from the picker', () => {
		assert.deepStrictEqual({
			accepted: reasoningEffortLevels.filter(isCopilotReasoningEffort),
			rejectsUnknown: isCopilotReasoningEffort('turbo'),
		}, {
			accepted: [...reasoningEffortLevels],
			rejectsUnknown: false,
		});
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
		// `never` satisfies the generic return type without widening to `any`.
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
				// ...but no picker fallback: unconfigured means "leave it alone"
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

	test('keeps Agent Host and SDK tool-search names consistent', () => {
		const names = new Set([CLIENT_TOOL_SEARCH_REFERENCE_NAME]);
		assert.deepStrictEqual(
			[
				[...filterClientToolNames(names, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], undefined)],
				[...filterClientToolNames(names, [RUNTIME_TOOL_SEARCH_TOOL_NAME], undefined)],
				[...filterClientToolNames(names, undefined, [`custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`])],
				toSdkToolFilterPatterns([CLIENT_TOOL_SEARCH_REFERENCE_NAME, `custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`, 'builtin:*']),
			],
			[
				[CLIENT_TOOL_SEARCH_REFERENCE_NAME],
				[CLIENT_TOOL_SEARCH_REFERENCE_NAME],
				[],
				[RUNTIME_TOOL_SEARCH_TOOL_NAME, `custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`, 'builtin:*'],
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
		services.set(IAgentHostManagedSettingsService, store.add(new AgentHostManagedSettingsService()));
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
	function buildResumeConfig(launcher: CopilotSessionLauncher, model: ModelSelection | undefined): Promise<{ model?: string; reasoningEffort?: string; availableTools?: string[]; excludedTools?: string[]; modelCapabilities?: Record<string, unknown> }> {
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
		return (launcher as unknown as { _buildSessionConfig(plan: unknown, runtime: unknown): Promise<{ model?: string; reasoningEffort?: string; availableTools?: string[]; excludedTools?: string[]; modelCapabilities?: Record<string, unknown> }> })._buildSessionConfig(plan, runtime);
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

	test('uses the resolved per-model family as the SDK model on resume', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'preview-model', config: { thinkingLevel: 'medium' } };
		const specific = await buildResumeConfig(createLauncher(store, {
			modelCapabilityOverrides: {
				'*': { family: 'gpt-5' },
				'preview-model': { family: 'claude-opus-4.8' },
			},
		}), model);
		const invalid = await buildResumeConfig(createLauncher(store, {
			modelCapabilityOverrides: { 'preview-model': { family: 'not a model id' } },
		}), model);
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		// Unlike the effort, the model IS re-sent without an override — the
		// resumed session is pinned to the selection the picker shows.
		assert.deepStrictEqual(
			[specific.model, invalid.model, none.model],
			['claude-opus-4.8', 'preview-model', 'preview-model']
		);
		store.dispose();
	});

	test('a session with no stored model still gets the wildcard entry effort and tool filters', async () => {
		const store = new DisposableStore();
		// Sessions created without an explicit model (server-side "Auto") resume
		// with `fallback.model === undefined`; `*` means every session, so
		// exempting them would make the entry mean "every model except Auto".
		const launcher = createLauncher(store, { modelCapabilityOverrides: { '*': { family: 'claude-opus-4.8', reasoningEffort: 'high', excludedTools: ['mcp:*'] }, 'gpt-5': { reasoningEffort: 'low' } } });
		const config = await buildResumeConfig(launcher, undefined);

		assert.deepStrictEqual(
			[config.model, config.reasoningEffort, config.excludedTools],
			['claude-opus-4.8', 'high', ['mcp:*']]
		);
		store.dispose();
	});

	test('forwards a configured modelCapabilities override and ignores a non-object one', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		const valid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { modelCapabilities: { supports: { vision: false } } } } }), model);
		const invalid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { modelCapabilities: 'oops' as never } } }), model);
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		assert.deepStrictEqual(
			[valid.modelCapabilities, invalid.modelCapabilities, none.modelCapabilities],
			[{ supports: { vision: false } }, undefined, undefined]
		);
		store.dispose();
	});

	test('maps tool-search reference names to the SDK runtime name', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		const config = await buildResumeConfig(createLauncher(store, {
			modelCapabilityOverrides: {
				'gpt-5': {
					availableTools: [CLIENT_TOOL_SEARCH_REFERENCE_NAME],
					excludedTools: [`custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`],
				},
			},
		}), model);

		assert.deepStrictEqual(
			[config.availableTools, config.excludedTools],
			[[RUNTIME_TOOL_SEARCH_TOOL_NAME], [`custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`]]
		);
		store.dispose();
	});
});
