/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession, ReasoningSummary, Verbosity } from '@github/copilot-sdk';
import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import type { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { IAgentHostManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { reasoningEffortLevels } from '../../common/reasoningEffort.js';
import { CustomizationType, type ModelSelection } from '../../common/state/protocol/state.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import type { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, IByokLmProxyService, type IByokLmProxyHandle } from '../../node/copilot/byokLmProxyService.js';
import type { ICopilotPluginInfo } from '../../node/copilot/copilotAgent.js';
import { CopilotSessionLauncher, filterClientToolNames, getCopilotReasoningEffort, isCopilotReasoningEffort, resolveByokSessionConfig, normalizeToolFilterPatterns, resolveConfiguredReasoningEffortOverride, resolveCopilotReasoningEffort, toSdkToolFilterPatterns, type CopilotSessionLaunchPlan, type ICopilotSessionRuntime } from '../../node/copilot/copilotSessionLauncher.js';

const testRuntime: ICopilotSessionRuntime = {
	handlePermissionRequest: async () => { throw new Error('Unexpected permission request'); },
	handleExitPlanModeRequest: async () => { throw new Error('Unexpected exit plan mode request'); },
	handleUserInputRequest: async () => { throw new Error('Unexpected user input request'); },
	handleElicitationRequest: async () => { throw new Error('Unexpected elicitation request'); },
	handleMcpAuthRequest: async () => { throw new Error('Unexpected MCP auth request'); },
	requestUnsandboxedCommandConfirmation: async () => false,
	handlePreToolUse: async () => { },
	handlePostToolUse: async () => { },
	handleUserPromptSubmitted: () => undefined,
	createClientSdkTools: () => [],
	createServerSdkTools: () => [],
};

const testWorkingDirectory = URI.file(process.cwd());

function createTestLauncher(managedSettingsPermissions?: IAgentHostManagedSettingsPermissions, rootValues: Partial<Record<CopilotCliConfigKey, unknown>> = {}): CopilotSessionLauncher {
	const configurationService = {
		getRootValue: (_schema: unknown, key: CopilotCliConfigKey) => rootValues[key],
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
			disabledMcpServers: ['azure', 'azure'],
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
			disabledRootMcpServers: ['github', 'azure'],
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
				createDisabledMcpServers: createConfigs[0].disabledMcpServers,
				createHasExitPlanHandler: typeof createConfigs[0].onExitPlanModeRequest === 'function',
				createLargeOutput: createConfigs[0].largeOutput,
				createManagedSettings: createConfigs[0].managedSettings,
				resumeClientName: resumeConfigs[0].clientName,
				resumeGitHubMcpToolConfig: resumeConfigs[0].githubMcpToolConfig,
				resumePluginDirectories: resumeConfigs[0].pluginDirectories,
				resumeSkillDirectories: resumeConfigs[0].skillDirectories,
				resumeInstructionDirectories: resumeConfigs[0].instructionDirectories,
				resumeDisabledMcpServers: resumeConfigs[0].disabledMcpServers,
				resumeHasExitPlanHandler: typeof resumeConfigs[0].onExitPlanModeRequest === 'function',
				resumeLargeOutput: resumeConfigs[0].largeOutput,
				resumeManagedSettings: resumeConfigs[0].managedSettings,
			}, {
				createClientName: 'vscode-agent-host',
				createGitHubMcpToolConfig: { disableFormDeferral: true },
				createPluginDirectories: [pluginDir.fsPath],
				createSkillDirectories: [],
				createInstructionDirectories: [URI.joinPath(pluginDir, 'rules').fsPath],
				createDisabledMcpServers: ['azure', 'github'],
				createHasExitPlanHandler: true,
				createLargeOutput: { maxSizeBytes: 8192 },
				createManagedSettings: { permissions: managedSettingsPermissions },
				resumeClientName: 'vscode-agent-host',
				resumeGitHubMcpToolConfig: { disableFormDeferral: true },
				resumePluginDirectories: [pluginDir.fsPath],
				resumeSkillDirectories: [],
				resumeInstructionDirectories: [URI.joinPath(pluginDir, 'rules').fsPath],
				resumeDisabledMcpServers: ['azure', 'github'],
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

suite('CopilotSessionLauncher reasoning summary', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function applyReasoningSummary(reasoningSummary: ReasoningSummary): Promise<void> {
		const launcher = createTestLauncher() as unknown as {
			_applyReasoningSummary(session: CopilotSession, reasoningSummary: ReasoningSummary, sessionId: string): Promise<void>;
		};
		const session = {
			rpc: {
				options: {
					update: async (options: unknown) => updates.push(options),
				},
			},
		} as unknown as CopilotSession;
		return launcher._applyReasoningSummary(session, reasoningSummary, 'session-1');
	}

	const updates: unknown[] = [];

	setup(() => updates.length = 0);

	test('forwards the requested reasoning summary', async () => {
		await applyReasoningSummary('detailed');

		assert.deepStrictEqual(updates, [{ reasoningSummary: 'detailed' }]);
	});
});

suite('CopilotSessionLauncher GPT-5.6 customizations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies verbosity and concise reasoning summary when enabled by experiment', async () => {
		const updates: unknown[] = [];
		const launcher = createTestLauncher(undefined, { [CopilotCliConfigKey.ReasoningSummary]: true }) as unknown as {
			_applyGpt56Customizations(session: CopilotSession, sessionId: string): Promise<void>;
		};
		const session = {
			rpc: {
				options: {
					update: async (options: unknown) => updates.push(options),
				},
			},
		} as unknown as CopilotSession;

		await launcher._applyGpt56Customizations(session, 'session-1');

		assert.deepStrictEqual(updates, [
			{ verbosity: 'medium' },
			{ reasoningSummary: 'concise' },
		]);
	});

	test('does not apply reasoning summary when the experiment is unset or disabled', async () => {
		for (const reasoningSummary of [undefined, false]) {
			const updates: unknown[] = [];
			const launcher = createTestLauncher(undefined, { [CopilotCliConfigKey.ReasoningSummary]: reasoningSummary }) as unknown as {
				_applyGpt56Customizations(session: CopilotSession, sessionId: string): Promise<void>;
			};
			const session = {
				rpc: { options: { update: async (options: unknown) => updates.push(options) } },
			} as unknown as CopilotSession;

			await launcher._applyGpt56Customizations(session, 'session-1');

			assert.deepStrictEqual(updates, [{ verbosity: 'medium' }]);
		}
	});

	test('applies GPT-5.6 customizations when resuming an existing session', async () => {
		const updates: unknown[] = [];
		const session = {
			sessionId: 'session-1',
			on: () => () => { },
			disconnect: async () => { },
			rpc: { options: { update: async (options: unknown) => updates.push(options) } },
		} as unknown as CopilotSession;
		const launcher = createTestLauncher(undefined, { [CopilotCliConfigKey.ReasoningSummary]: true });
		const plan: CopilotSessionLaunchPlan = {
			kind: 'resume',
			client: { resumeSession: async () => session } as unknown as CopilotClient,
			sessionId: 'session-1',
			workingDirectory: testWorkingDirectory,
			resolvedAgentName: undefined,
			snapshot: { tools: [], plugins: [], mcpServers: {} },
			activeClientToolSet: new ActiveClientToolSet(),
			shellManager: undefined,
			githubToken: undefined,
			fallback: { model: { id: 'gpt-5.6-sol', config: {} } },
		};

		const wrapper = await launcher.launch(plan, testRuntime);
		try {
			assert.deepStrictEqual(updates, [
				{ verbosity: 'medium' },
				{ reasoningSummary: 'concise' },
			]);
		} finally {
			wrapper.dispose();
			await launcher.disposeByokProxyHandle();
		}
	});
});

/**
 * Covers the reasoning-effort resolution fed into `createSession` and
 * `CopilotAgent._changeModel`: a valid capability override wins over the model
 * picker's thinking level, and degrades to the picker value otherwise.
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

/** A specific entry wins over `*`, which wins over the picker; invalid falls through. */
suite('resolveCopilotReasoningEffort', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Stubs the config service with a fixed root-value bag. */
	function configOf(values: SchemaValues<typeof copilotCliConfigSchema.definition>): Pick<IAgentConfigurationService, 'getRootValue'> {
		// `never` satisfies the generic return type without widening to `any`.
		return { getRootValue: (_schema, key) => values[key as keyof typeof values] as never };
	}

	test('a specific entry beats the wildcard beats the picker; invalid values fall through', () => {
		const log = new NullLogService();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		assert.deepStrictEqual(
			[
				// a specific entry wins over the picker
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				// the wildcard applies to any model; a specific entry wins over it
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' } } }), log, 's1'),
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' }, 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				// an invalid specific value is ignored, so it cannot mask the wildcard
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' }, 'gpt-5': { reasoningEffort: 'turbo' } } }), log, 's1'),
				// an invalid value falls through to the picker
				resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'turbo' } } }), log, 's1'),
				// nothing configured → picker value
				resolveCopilotReasoningEffort(model, configOf({}), log, 's1'),
				// no model (server-side "Auto"): the `*` entry still matches, but a
				// model-id entry cannot
				resolveCopilotReasoningEffort(undefined, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'low' } } }), log, 's1'),
				resolveCopilotReasoningEffort(undefined, configOf({ modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
			],
			['low', 'high', 'low', 'high', 'medium', 'medium', 'low', undefined]
		);
	});

	test('resolveConfiguredReasoningEffortOverride reports only the configured override, never the picker value', () => {
		const log = new NullLogService();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		assert.deepStrictEqual(
			[
				// same resolution as above...
				resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), log, 's1'),
				resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { '*': { reasoningEffort: 'high' } } }), log, 's1'),
				// ...but no picker fallback: unconfigured or invalid means "leave it alone"
				resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'turbo' } } }), log, 's1'),
				resolveConfiguredReasoningEffortOverride(model, configOf({}), log, 's1'),
			],
			['low', 'high', undefined, undefined]
		);
	});
});

/**
 * Client tools are all `custom:`-source, so only a bare name, `custom:<name>` or
 * `custom:*` matches, and `excludedTools` wins — mirroring the SDK.
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

		const withSearch = new Set([CLIENT_TOOL_SEARCH_REFERENCE_NAME, 'runTask']);
		const resolveSearch = (excluded: string[]) => [...filterClientToolNames(withSearch, undefined, excluded)].sort();
		assert.deepStrictEqual(
			[
				resolveSearch([`builtin:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`]),
				resolveSearch(['builtin:*']),
				resolveSearch([RUNTIME_TOOL_SEARCH_TOOL_NAME]),
				// Client tools are custom-source even when they override a built-in.
				[...filterClientToolNames(withSearch, ['builtin:*'], undefined)],
			],
			[
				['runTask', 'toolSearch'],
				['runTask', 'toolSearch'],
				['runTask'],
				[],
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
 * A resumed session keeps the effort the runtime journaled unless an override is
 * configured; `_createSession` resolves the full effort for a create.
 */
suite('normalizeToolFilterPatterns', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('expands a bare wildcard and coerces a lone string; unusable values read as unset', () => {
		assert.deepStrictEqual(
			[
				// a bare '*' is expanded, not dropped — an "exclude everything"
				// denylist must not degrade into "exclude nothing"
				normalizeToolFilterPatterns(['*']),
				normalizeToolFilterPatterns(['mcp:*', '*']),
				// a lone string reads as a one-element list
				normalizeToolFilterPatterns('mcp:*'),
				// an empty allowlist means "no tools", so it must not read as unset
				normalizeToolFilterPatterns([]),
				// not a list at all → unusable
				normalizeToolFilterPatterns(undefined),
				normalizeToolFilterPatterns(42),
				normalizeToolFilterPatterns(['ok', 7]),
			],
			[
				['builtin:*', 'mcp:*', 'custom:*'],
				['mcp:*', 'builtin:*', 'custom:*'],
				['mcp:*'],
				[],
				undefined,
				undefined,
				undefined,
			]
		);
	});
});

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
	function buildResumeConfig(
		launcher: CopilotSessionLauncher,
		model: ModelSelection | undefined,
		snapshot: CopilotSessionLaunchPlan['snapshot'] = { tools: [], plugins: [], mcpServers: {} },
		createClientSdkTools: ICopilotSessionRuntime['createClientSdkTools'] = () => [],
	): Promise<{ model?: string; reasoningEffort?: string; contextTier?: string; availableTools?: string[]; excludedTools?: string[]; modelCapabilities?: Record<string, unknown>; toolSearch?: { enabled: boolean } }> {
		const plan = {
			kind: 'resume',
			client: { createSession: async () => { throw new Error('unused'); }, resumeSession: async () => { throw new Error('unused'); } },
			sessionId: 'sess-1',
			workingDirectory: URI.file('/workspace'),
			resolvedAgentName: undefined,
			snapshot,
			activeClientToolSet: new ActiveClientToolSet(),
			shellManager: undefined,
			githubToken: 'token',
			fallback: { model },
		};
		const runtime = { createClientSdkTools, createServerSdkTools: () => [] };
		return (launcher as unknown as { _buildSessionConfig(plan: unknown, runtime: unknown): Promise<{ model?: string; reasoningEffort?: string; contextTier?: string; availableTools?: string[]; excludedTools?: string[]; modelCapabilities?: Record<string, unknown>; toolSearch?: { enabled: boolean } }> })._buildSessionConfig(plan, runtime);
	}

	test('forwards a configured override on resume and leaves the effort untouched otherwise', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		const perModel = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { reasoningEffort: 'low' } } }), model);
		const wildcard = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { '*': { reasoningEffort: 'xhigh' } } }), model);
		// The picker value is NOT re-sent: without an override the resumed
		// session keeps whatever effort the runtime persisted for it.
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		assert.deepStrictEqual(
			[perModel.reasoningEffort, wildcard.reasoningEffort, none.reasoningEffort],
			['low', 'xhigh', undefined]
		);
		store.dispose();
	});

	test('never sends the model or context tier on resume, aliased or not', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'preview-model', config: { thinkingLevel: 'medium' } };
		// A `family` alias routes the host prompt only, so the resumed session keeps
		// the model and tier the runtime journaled for it.
		const aliased = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'preview-model': { family: 'claude-opus-4.8' } } }), model);
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		assert.deepStrictEqual(
			[aliased.model, aliased.contextTier, none.model, none.contextTier],
			[undefined, undefined, undefined, undefined]
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

	test('forwards a configured modelCapabilities override and ignores a non-object one', async () => {
		const store = new DisposableStore();
		const model: ModelSelection = { id: 'gpt-5', config: { thinkingLevel: 'medium' } };
		const valid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { modelCapabilities: { supports: { vision: false } } } } }), model);
		const invalid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { 'gpt-5': { modelCapabilities: 'oops' as never } } }), model);
		const wildcardFallback = await buildResumeConfig(createLauncher(store, {
			modelCapabilityOverrides: {
				'*': {
					availableTools: ['custom:*'],
					excludedTools: ['mcp:*'],
					modelCapabilities: { supports: { vision: true } },
				},
				'gpt-5': {
					availableTools: 42 as never,
					excludedTools: 42 as never,
					modelCapabilities: 'oops' as never,
				},
			},
		}), model);
		const none = await buildResumeConfig(createLauncher(store, {}), model);

		assert.deepStrictEqual(
			[
				valid.modelCapabilities,
				invalid.modelCapabilities,
				{
					availableTools: wildcardFallback.availableTools,
					excludedTools: wildcardFallback.excludedTools,
					modelCapabilities: wildcardFallback.modelCapabilities,
				},
				none.modelCapabilities,
			],
			[
				{ supports: { vision: false } },
				undefined,
				{
					availableTools: ['custom:*'],
					excludedTools: ['mcp:*'],
					modelCapabilities: { supports: { vision: true } },
				},
				undefined,
			]
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

	test('tool search gates on the flag, model support, and the family alias', async () => {
		const store = new DisposableStore();
		const searchSnapshot = {
			tools: [{ name: CLIENT_TOOL_SEARCH_REFERENCE_NAME, description: 'Search tools', inputSchema: { type: 'object' as const, properties: {} } }],
			plugins: [],
			mcpServers: {},
		};
		const toolSearchOf = async (values: SchemaValues<typeof copilotCliConfigSchema.definition>, model: ModelSelection) =>
			(await buildResumeConfig(createLauncher(store, values), model, searchSnapshot)).toolSearch;

		assert.deepStrictEqual(
			[
				// flag off → disabled even on a supported model
				await toolSearchOf({ toolSearchEnabled: false }, { id: 'claude-opus-4.8' }),
				// unsupported model → disabled even with the flag on
				await toolSearchOf({ toolSearchEnabled: true }, { id: 'preview-model-x' }),
				// a family alias makes an unsupported preview model tool-search-capable
				await toolSearchOf({ toolSearchEnabled: true, modelCapabilityOverrides: { 'preview-model-x': { family: 'claude-opus-4.8' } } }, { id: 'preview-model-x' }),
			],
			[
				{ enabled: false },
				{ enabled: false },
				{ enabled: true, deferThreshold: 1 },
			]
		);
		store.dispose();
	});

	test('uses one launch-time tool-search decision for the config and client tools', async () => {
		const store = new DisposableStore();
		const decisions: boolean[] = [];
		const model: ModelSelection = { id: 'claude-opus-4.8', config: { thinkingLevel: 'medium' } };
		const config = await buildResumeConfig(
			createLauncher(store, {
				toolSearchEnabled: true,
				modelCapabilityOverrides: { 'claude-opus-4.8': { availableTools: ['custom:*'] } },
			}),
			model,
			{
				tools: [{ name: CLIENT_TOOL_SEARCH_REFERENCE_NAME, description: 'Search tools', inputSchema: { type: 'object', properties: {} } }],
				plugins: [],
				mcpServers: {},
			},
			toolSearchActive => {
				decisions.push(toolSearchActive);
				return [];
			},
		);

		assert.deepStrictEqual({ config: config.toolSearch, decisions }, {
			config: { enabled: true, deferThreshold: 1 },
			decisions: [true],
		});
		store.dispose();
	});
});
