/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient, CopilotClientOptions } from '@github/copilot-sdk';
import { execFile, type ExecFileException } from 'child_process';
import { cp, mkdir, readFile, realpath, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NativeEnvironmentService } from '../../../../environment/node/environmentService.js';
import { OPTIONS, parseArgs } from '../../../../environment/node/argv.js';
import { DiskFileSystemProvider } from '../../../../files/node/diskFileSystemProvider.js';
import { LogLevel, NullLogService } from '../../../../log/common/log.js';
import product from '../../../../product/common/product.js';
import type { IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { IAgentHostCanvasPackagesService, canvasPackageExtensionId } from '../../../common/agentHostCanvasPackages.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostGitHubMcpServerEnabledConfigKey, AgentHostLocalCanvasesConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { AgentHostLaunchKind } from '../../../common/agentHostTelemetry.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import type { CanvasEntry } from '../../../common/state/protocol/channels-canvas/state.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { createAgentChatContext } from '../../../node/agentChatContext.js';
import { createAgentHostRuntime, type IAgentHostRuntime } from '../../../node/agentHostBootstrap.js';
import { IAgentHostProviderService } from '../../../node/agentHostProviderService.js';
import { IAgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { CopilotAgent } from '../../../node/copilot/copilotAgent.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { loadCopilotCanvasSdk, readCopilotCanvasSdkConfiguration, type CopilotCanvasLaunchProvider, type ICopilotCanvasClientBridge, type ICopilotCanvasLaunchRequest } from '../../../node/copilot/copilotCanvasSdk.js';
import { waitFor } from './copilotCanvasTestUtils.js';

class RecordingCanvasAgent extends CopilotAgent {
	readonly resolutions: { request: ICopilotCanvasLaunchRequest; approved: boolean }[] = [];
	bridge: ICopilotCanvasClientBridge | undefined;
	bundledClientCreations = 0;

	protected override _createCopilotClient(options: CopilotClientOptions): CopilotClient {
		this.bundledClientCreations++;
		return super._createCopilotClient(options);
	}

	protected override async _createCanvasClient(options: CopilotClientOptions, resolve: CopilotCanvasLaunchProvider): Promise<ICopilotCanvasClientBridge | undefined> {
		this.bridge = await super._createCanvasClient(options, async request => {
			const response = await resolve(request);
			this.resolutions.push({ request, approved: response.launch !== null });
			return response;
		});
		return this.bridge;
	}
}

interface IStartupAudit {
	readonly kind: 'startup';
	readonly value: { readonly sessionId: string; readonly retained: boolean; readonly turns: number; readonly module: string; readonly data: string; readonly pid: number };
}

type CanvasFixtureAudit = IStartupAudit
	| { readonly kind: 'open' | 'close'; readonly value: { readonly instanceId: string } }
	| { readonly kind: 'action'; readonly value: { readonly value: number } };

class RecordingLogService extends NullLogService {
	readonly lines: string[] = [];
	override getLevel(): LogLevel { return LogLevel.Trace; }
	override trace(message: string): void { this.lines.push(message); }
	override debug(message: string): void { this.lines.push(message); }
	override info(message: string): void { this.lines.push(message); }
	override warn(message: string): void { this.lines.push(message); }
	override error(message: string | Error): void { this.lines.push(String(message)); }
}

async function stopHost(host: IAgentHostRuntime): Promise<void> {
	await host.agentService.shutdown();
	host.dispose();
	await timeout(0);
}

class UnwatchedDiskFileSystemProvider extends DiskFileSystemProvider {
	override watch() {
		return Disposable.None;
	}
}

function processIsRunning(pid: number): boolean {
	try {
		return process.kill(pid, 0);
	} catch (error) {
		if (error instanceof Error) {
			const nodeError: NodeJS.ErrnoException = error;
			if (nodeError.code === 'ESRCH') {
				return false;
			}
		}
		throw error;
	}
}

suite('Agent Host Provider Integration - Public Canvas SDK', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(120_000);

	test('canvas-first AHP execution retains the real backing, denies ambient code and survives a cold host restart', async function () {
		const configuredRoot = process.env.VSCODE_CANVAS_HOST_TEST_ROOT;
		if (!configuredRoot) {
			this.skip();
		}
		if (process.versions.electron) {
			try {
				const result = await promisify(execFile)('node', [
					join(process.cwd(), 'node_modules/mocha/bin/mocha.js'), 'test/unit/node/index.js',
					'--delay', '--ui=tdd', '--timeout=120000', '--exit', '--run',
					'src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvasSdk.integrationTest.ts',
				], { cwd: process.cwd(), env: process.env, timeout: 115_000, maxBuffer: 4 * 1024 * 1024 });
				await writeFile(`${configuredRoot}-node.log`, result.stdout);
			} catch (error) {
				if (error instanceof Error) {
					const execError: ExecFileException = error;
					if (typeof execError.stdout === 'string') {
						await writeFile(`${configuredRoot}-node.log`, execError.stdout);
					}
				}
				throw error;
			}
			return;
		}
		assert.ok(configuredRoot.startsWith(join(process.cwd(), '.build') + '/'));
		assert.strictEqual(process.env.COPILOT_HOME, join(configuredRoot, 'copilot-home'));
		assert.strictEqual(process.env.HOME, join(configuredRoot, 'home'));
		let runtime: IAgentHostRuntime | undefined;
		let root = configuredRoot;
		const modelCalls: IByokLmChatRequest[] = [];
		const log = store.add(new RecordingLogService());
		const agents: RecordingCanvasAgent[] = [];
		try {
			for (const path of ['home/.config', 'copilot-home/extensions/ambient', 'workspace', 'profile']) {
				await mkdir(join(root, path), { recursive: true });
			}
			root = await realpath(root);
			await promisify(execFile)('git', ['init', '--quiet', '--initial-branch=ulugbekna/canvas-sdk-test', join(root, 'workspace')]);
			const source = join(root, 'source');
			await cp(fileURLToPath(new URL('./fixtures/liveCanvas/', import.meta.url)), source, { recursive: true });
			const ambientMarker = join(root, 'ambient-executed');
			await writeFile(join(root, 'copilot-home/extensions/ambient/extension.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(ambientMarker)}, 'executed');`);
			const workspace = URI.file(join(root, 'workspace'));
			const startHost = async () => {
				const registry = new ByokLmBridgeRegistry();
				const models = store.add(new Emitter<IByokLmModelInfo[]>({
					onDidAddFirstListener: () => models.fire([{ vendor: 'canvas', id: 'offline', name: 'Offline Canvas Test', maxContextWindowTokens: 128_000 }]),
				}));
				store.add(registry.register('canvas-test', {
					onDidChangeModels: models.event,
					chat: async request => {
						modelCalls.push(request);
						const lastUserMessage = request.input.findLast(item => item.type === 'message' && item.role === 'user');
						const isCanvasRequest = lastUserMessage?.type === 'message' && lastUserMessage.content.some(part => part.type === 'text' && part.text.includes('Canvas-originated test request:'));
						const hasResult = request.input.some(item => item.type === 'function_call_output' && item.callId === 'canvas-originated-action');
						if (isCanvasRequest && !hasResult) {
							assert.ok(request.tools?.some(tool => tool.name === 'invoke_canvas_action'));
							return {
								output: [{
									type: 'function_call', callId: 'canvas-originated-action', name: 'invoke_canvas_action',
									argumentsJson: JSON.stringify({ instanceId: 'document', actionName: 'increment', input: {} }),
								}]
							};
						}
						return { output: [{ type: 'message', content: [{ type: 'text', text: 'The retained backing is ready.' }] }] };
					},
				}));
				const productService = { ...product, _serviceBrand: undefined };
				const environmentService = new NativeEnvironmentService(parseArgs([
					'--user-data-dir', join(root, 'profile'), '--extensions-dir', join(root, 'extensions'),
					'--agent-plugins-dir', join(root, 'plugins'),
				], OPTIONS), productService);
				const host = await createAgentHostRuntime({
					environmentService, productService, logService: log, loggerService: undefined,
					disableTelemetry: true, transientProxyConfiguration: true, hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
					providerConfigurations: [], byok: { kind: 'renderer', bridgeRegistry: registry },
					fileSystemProvider: new UnwatchedDiskFileSystemProvider(log),
				});
				runtime = host;
				const services = host.instantiationService.invokeFunction(accessor => ({
					config: accessor.get(IAgentConfigurationService),
					packages: accessor.get(IAgentHostCanvasPackagesService),
					providers: accessor.get(IAgentHostProviderService),
					state: accessor.get(IAgentHostStateManager),
				}));
				services.config.updateRootConfig({
					[AgentHostByokModelsEnabledConfigKey]: true,
					[AgentHostGitHubMcpServerEnabledConfigKey]: false,
					[AgentHostSessionSyncEnabledConfigKey]: false,
					[AgentHostSystemProxyEnabledConfigKey]: false,
				});
				const agent = host.instantiationService.createInstance(RecordingCanvasAgent);
				agents.push(agent);
				services.providers.registerProvider(agent);
				assert.ok(host.agentService.canvasProtocol.initialize);
				await host.agentService.canvasProtocol.initialize(true);
				return { host, agent, ...services };
			};
			let current = await startHost();
			runtime = current.host;
			assert.strictEqual(current.agent.supportsCanvasProtocol, true);
			const pkg = await current.packages.prepare(URI.file(source));
			await current.packages.approve(pkg.id, pkg.revision, workspace);
			const extensionId = canvasPackageExtensionId(pkg.id);
			const session = await runtime.agentService.createSession({
				provider: 'copilotcli', model: { id: 'canvas/offline' }, workingDirectories: [workspace],
				config: { [SessionConfigKey.Isolation]: 'folder' },
			});
			const chat = URI.parse(buildDefaultChatUri(session));
			assert.deepStrictEqual(await runtime.agentService.canvasProtocol.listTypes({ channel: chat.toString() }), { types: [] });
			assert.strictEqual(current.agent.resolutions.length, 0);
			const params = {
				channel: session.toString(), canvas: `ahp-canvas:/${generateUuid()}`, requestId: 'first-open', title: 'Retained Counter',
				identity: { chat: chat.toString(), source: current.agent.getCanvasSource(chat, extensionId), canvasType: 'counter', instanceId: 'document' },
				input: {},
			};
			const opened = await runtime.agentService.canvasProtocol.open('native-test', params);
			const stateFile = await runtime.agentService.getSessionStateFile(session, chat);
			assert.ok(stateFile);
			const readEvents = async (): Promise<{ type: string }[]> => (await readFile(stateFile.fsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
			const [snapshot] = await current.packages.getApprovedSnapshots(workspace);
			assert.ok(snapshot);
			const launch = await current.packages.resolveLaunch(extensionId, URI.joinPath(snapshot.pluginDirectory, 'com.github.copilot/extensions/main/extension.mjs').fsPath, workspace);
			assert.ok(launch);
			const readAudit = async (): Promise<CanvasFixtureAudit[]> => (await readFile(join(launch.dataDirectory.fsPath, 'audit.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
			const firstStartup = (await readAudit()).filter(entry => entry.kind === 'startup');
			assert.deepStrictEqual({
				retained: (await readEvents()).filter(event => event.type === 'session.retained').length,
				turns: (await readEvents()).filter(event => event.type === 'user.message' || event.type === 'assistant.message').length,
				firstStartup: firstStartup.map(entry => ({ retained: entry.value.retained, turns: entry.value.turns, installed: entry.value.module.startsWith(snapshot.pluginDirectory.toString()), separateData: entry.value.data === launch.dataDirectory.fsPath })),
				ambient: current.agent.resolutions.filter(entry => entry.request.id === 'user:ambient').map(entry => entry.approved),
				modelCalls: modelCalls.length,
			}, { retained: 1, turns: 0, firstStartup: [{ retained: true, turns: 0, installed: true, separateData: true }], ambient: [false], modelCalls: 0 });
			await assert.rejects(readFile(ambientMarker), { code: 'ENOENT' });
			assert.ok(current.agent.bridge);
			const unbound = await current.agent.bridge.client.createSession({
				sessionId: 'unbound-runtime-session', model: 'offline',
				provider: { type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1' },
				workingDirectory: workspace.fsPath, pluginDirectories: [snapshot.pluginDirectory.fsPath],
				requestExtensions: true, requestCanvasRenderer: true, enableConfigDiscovery: false, enableFileHooks: false,
				enableSessionTelemetry: false, availableTools: [], mcpServers: {}, disabledMcpServers: ['github-mcp-server'],
				onPermissionRequest: () => ({ kind: 'denied-no-approval-rule-and-could-not-request-from-user' }),
			});
			try {
				await waitFor(() => unbound.rpc.extensions.list(), value => value.extensions.some(extension => extension.id === extensionId && extension.status === 'failed'));
				assert.deepStrictEqual({
					decisions: current.agent.resolutions.filter(entry => entry.request.sessionId === unbound.sessionId).map(entry => entry.approved),
					startups: (await readAudit()).filter(entry => entry.kind === 'startup').length,
				}, { decisions: [false, false], startups: 1 });
			} finally {
				await unbound.disconnect();
			}
			const action = await runtime.agentService.canvasProtocol.invokeAction('native-test', {
				channel: opened.canvas.resource, incarnation: opened.canvas.identity.incarnation,
				actionId: 'increment', input: {}, requestId: 'first-action',
			});
			assert.deepStrictEqual(action.result, { result: { value: 1 } });
			const initialSource = await runtime.agentService.canvasProtocol.resolveSource({ channel: opened.canvas.resource });
			await stopHost(runtime);
			runtime = undefined;
			await waitFor(async () => processIsRunning(firstStartup[0].value.pid), running => !running);
			current = await startHost();
			runtime = current.host;
			await runtime.agentService.restoreSession(session);
			const coldState = await runtime.agentService.getCanvases(chat);
			log.info(`Cold backing loaded: ${coldState.loaded}`);
			assert.strictEqual((await readAudit()).filter(entry => entry.kind === 'startup').length, 1, 'cold membership reads must not execute code');
			const restored = current.state.getChatCanvasStates(chat.toString())[0];
			assert.ok(restored);
			await runtime.agentService.canvasProtocol.restart('native-test', {
				channel: restored.resource, incarnation: restored.identity.incarnation, requestId: 'cold-restart',
			});
			await waitFor(() => runtime!.agentService.getCanvases(chat), value => value.instances.some(instance => instance.availability === 'ready'));
			const coldSource = await runtime.agentService.canvasProtocol.resolveSource({ channel: restored.resource });
			assert.notDeepStrictEqual(coldSource, initialSource);
			assert.deepStrictEqual({
				startups: (await readAudit()).filter(entry => entry.kind === 'startup').map(entry => ({ retained: entry.value.retained, turns: entry.value.turns, id: entry.value.sessionId })),
				retained: (await readEvents()).filter(event => event.type === 'session.retained').length,
				document: JSON.parse(await readFile(join(launch.dataDirectory.fsPath, 'document.json'), 'utf8')),
				modelCalls: modelCalls.length,
			}, {
				startups: [{ retained: true, turns: 0, id: firstStartup[0].value.sessionId }, { retained: true, turns: 0, id: firstStartup[0].value.sessionId }],
				retained: 1, document: { value: 1 }, modelCalls: 0,
			});
			await current.agent.chats.sendMessage(chat, 'Confirm that you are ready.', [workspace], undefined, generateUuid());
			await waitFor(readEvents, events => events.some(event => event.type === 'assistant.message'));
			assert.deepStrictEqual({
				startups: (await readAudit()).filter(entry => entry.kind === 'startup').length,
				userMessages: (await readEvents()).filter(event => event.type === 'user.message').length,
				modelCalls: modelCalls.length,
			}, { startups: 2, userMessages: 1, modelCalls: 1 });
			current.agent.getOrCreateActiveClient(chat, session, { clientId: 'native-test' }).tools = [{
				name: 'canvas_qualification_noop',
				description: 'A newly registered client tool that requires a fresh session configuration.',
				inputSchema: { type: 'object', properties: {} },
			}];
			await current.agent.chats.sendMessage(chat, 'Confirm readiness after the client configuration changed.', [workspace], undefined, generateUuid());
			await waitFor(readEvents, events => events.filter(event => event.type === 'assistant.message').length === 2);
			await waitFor(() => runtime!.agentService.getCanvases(chat), value => value.instances.some(instance => instance.availability === 'ready'));
			assert.deepStrictEqual({
				userMessages: (await readEvents()).filter(event => event.type === 'user.message').length,
				modelCalls: modelCalls.length,
				document: JSON.parse(await readFile(join(launch.dataDirectory.fsPath, 'document.json'), 'utf8')),
				retained: (await readEvents()).filter(event => event.type === 'session.retained').length,
				samplingInterestReleaseErrors: log.lines.filter(line => line.includes('session.eventLog.releaseInterest')),
			}, { userMessages: 2, modelCalls: 2, document: { value: 1 }, retained: 1, samplingInterestReleaseErrors: [] });

			const liveCanvas = (await runtime.agentService.getCanvases(chat)).instances.find(instance => instance.instanceId === 'document');
			assert.ok(liveCanvas?.availability === 'ready');
			const externalRequest = Promise.allSettled([fetch(new URL('/request-turn', liveCanvas.url), { method: 'POST', signal: AbortSignal.timeout(30_000) })]);
			const pendingTurn = await waitFor(async () => current.state.getChatState(chat.toString())?.activeTurn, turn =>
				!!turn?.responseParts.some(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation));
			assert.ok(pendingTurn);
			const pendingTool = pendingTurn.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation);
			assert.ok(pendingTool?.kind === ResponsePartKind.ToolCall);
			assert.deepStrictEqual({
				message: pendingTurn.message.text,
				tool: pendingTool.toolCall.toolName,
				document: JSON.parse(await readFile(join(launch.dataDirectory.fsPath, 'document.json'), 'utf8')),
			}, {
				message: 'Canvas-originated test request: invoke increment on the open document instance.',
				tool: 'invoke_canvas_action',
				document: { value: 1 },
			});
			runtime.agentService.dispatchAction(chat.toString(), {
				type: ActionType.ChatToolCallConfirmed, turnId: pendingTurn.id, toolCallId: pendingTool.toolCall.toolCallId,
				approved: true, confirmed: ToolCallConfirmationReason.UserAction,
			}, 'native-test', 1);
			const [externalResponse] = await externalRequest;
			if (externalResponse.status === 'rejected') {
				throw externalResponse.reason;
			}
			assert.strictEqual(externalResponse.value.status, 200);
			assert.deepStrictEqual(await externalResponse.value.json(), { value: 2 });
			await waitFor(async () => current.state.getChatState(chat.toString()), state =>
				!state?.activeTurn && !!state?.turns.some(turn => turn.id === pendingTurn.id));
			assert.strictEqual((await readEvents()).filter(event => event.type === 'user.message').length, 3);

			const failedSession = await runtime.agentService.createSession({
				provider: 'copilotcli', model: { id: 'canvas/offline' }, workingDirectories: [workspace],
				config: { [SessionConfigKey.Isolation]: 'folder' },
			});
			const failedChat = URI.parse(buildDefaultChatUri(failedSession));
			await assert.rejects(runtime.agentService.canvasProtocol.open('native-test', {
				...params, channel: failedSession.toString(), canvas: `ahp-canvas:/${generateUuid()}`, requestId: 'failed-first-open',
				identity: { ...params.identity, chat: failedChat.toString() }, input: { failAfterWrite: true },
			}), { data: { outcome: 'indeterminate' } });
			const failedStateFile = await runtime.agentService.getSessionStateFile(failedSession, failedChat);
			assert.ok(failedStateFile);
			const failedEvents: { type: string }[] = (await readFile(failedStateFile.fsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
			const failedStartup = (await readAudit()).filter(entry => entry.kind === 'startup').at(-1);
			assert.deepStrictEqual({
				retained: failedEvents.filter(event => event.type === 'session.retained').length,
				turns: failedEvents.filter(event => event.type === 'user.message' || event.type === 'assistant.message').length,
				membership: current.state.getSessionState(failedSession.toString())?.canvases?.length,
				retainedBeforeImport: failedStartup?.value.retained,
			}, { retained: 1, turns: 0, membership: 1, retainedBeforeImport: true });
			await writeFile(join(source, 'new-revision.txt'), 'This revision has not been approved.');
			const updated = await current.packages.prepare(URI.file(source));
			assert.notStrictEqual(updated.revision, pkg.revision);
			const unapprovedModule = URI.joinPath(URI.parse(updated.snapshot), 'com.github.copilot/extensions/main/extension.mjs');
			assert.strictEqual(await current.packages.resolveLaunch(extensionId, unapprovedModule.fsPath, workspace), undefined);
			await current.packages.revoke(pkg.id);
			await current.agent.revokeCanvasExecution(chat);
			const pids = (await readAudit()).filter(entry => entry.kind === 'startup').map(entry => entry.value.pid);
			await waitFor(async () => pids.some(processIsRunning), running => !running);
			const before = (await readAudit()).length;
			const latest: CanvasEntry = current.state.getSessionState(session.toString())!.canvases![0];
			await assert.rejects(runtime.agentService.canvasProtocol.invokeAction('native-test', {
				channel: latest.resource, incarnation: latest.identity.incarnation, requestId: 'revoked-action', actionId: 'increment', input: {},
			}));
			await timeout(100);
			assert.strictEqual((await readAudit()).length, before);
			assert.deepStrictEqual(JSON.parse(await readFile(join(launch.dataDirectory.fsPath, 'document.json'), 'utf8')), { value: 2 });
			const callbackCountBeforeRollback = current.agent.resolutions.length;
			current.config.updateRootConfig({ [AgentHostLocalCanvasesConfigKey]: false });
			assert.strictEqual(current.agent.supportsCanvasProtocol, false);
			const rollbackSession = await runtime.agentService.createSession({
				provider: 'copilotcli', model: { id: 'canvas/offline' }, workingDirectories: [workspace],
				config: { [SessionConfigKey.Isolation]: 'folder' },
			});
			const rollbackChat = URI.parse(buildDefaultChatUri(rollbackSession));
			await current.agent.chats.sendMessage(rollbackChat, 'Confirm that ordinary chat still works.', [workspace], undefined, generateUuid(), undefined, createAgentChatContext(current.state, rollbackSession, rollbackChat));
			const rollbackStateFile = await waitFor(() => runtime!.agentService.getSessionStateFile(rollbackSession, rollbackChat), file => !!file);
			assert.ok(rollbackStateFile);
			await waitFor(async (): Promise<{ type: string }[]> => (await readFile(rollbackStateFile.fsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), events => events.some(event => event.type === 'assistant.message'));
			assert.deepStrictEqual({
				bundledClients: current.agent.bundledClientCreations,
				resolverCalls: current.agent.resolutions.length,
				startups: (await readAudit()).filter(entry => entry.kind === 'startup').length,
				modelCalls: modelCalls.length,
			}, {
				bundledClients: 1, resolverCalls: callbackCountBeforeRollback,
				startups: 4, modelCalls: 5,
			});
			const sdkConfiguration = readCopilotCanvasSdkConfiguration(false);
			assert.ok(sdkConfiguration);
			const require = createRequire(import.meta.url);
			const oldSdkEntry = pathToFileURL(require.resolve('@github/copilot-sdk')).href;
			await assert.rejects(loadCopilotCanvasSdk({ ...sdkConfiguration, sdkEntry: oldSdkEntry, bridgeEntry: oldSdkEntry }), /not built for this public/);
			const factory = await loadCopilotCanvasSdk(sdkConfiguration);
			const oldRuntime = join(dirname(require.resolve(`@github/copilot-${process.platform}-${process.arch}`)), 'index.js');
			const unsupported = factory.createClient(oldRuntime, {
				env: createCopilotCliEnvironment(process.env), useLoggedInUser: false, enableRemoteSessions: false, logLevel: 'error',
				workingDirectory: workspace.fsPath, baseDirectory: join(root, 'unsupported-runtime'),
			}, async () => ({ launch: null }));
			try {
				await assert.rejects(unsupported.start(), /launch.provider|contract.?version|contractVersion/i);
			} finally {
				await unsupported.client.stop();
			}
			await assert.rejects(readFile(ambientMarker), { code: 'ENOENT' });
			await writeFile(`${configuredRoot}-evidence.json`, JSON.stringify({
				sdkEntry: sdkConfiguration.sdkEntry,
				bridgeEntry: sdkConfiguration.bridgeEntry,
				runtimeCli: sdkConfiguration.runtimeCli,
				requiredLaunchContractVersion: 1,
				startups: (await readAudit()).filter(entry => entry.kind === 'startup').map(entry => ({ ...entry.value, running: processIsRunning(entry.value.pid) })),
				resolutions: agents.map(agent => agent.resolutions.map(entry => ({ id: entry.request.id, sessionId: entry.request.sessionId, approved: entry.approved }))),
				mockModelCalls: modelCalls.length,
				bundledClientsAfterDisablingPreview: current.agent.bundledClientCreations,
				previewAvailableAfterDisabling: current.agent.supportsCanvasProtocol,
				retainedEvents: (await readEvents()).filter(event => event.type === 'session.retained').length,
				failedFirstOpenRetainedEvents: failedEvents.filter(event => event.type === 'session.retained').length,
				samplingInterestReleaseErrors: log.lines.filter(line => line.includes('session.eventLog.releaseInterest')),
				document: JSON.parse(await readFile(join(launch.dataDirectory.fsPath, 'document.json'), 'utf8')),
				unsupportedSdkAndRuntimeRejected: true,
			}, null, '\t') + '\n');
		} finally {
			if (runtime) {
				await stopHost(runtime);
			}
			await writeFile(`${configuredRoot}-host.log`, log.lines.join('\n') + '\n' + JSON.stringify(agents.map(agent => agent.resolutions.map(entry => ({ id: entry.request.id, sessionId: entry.request.sessionId, approved: entry.approved }))), null, '\t'));
			await rm(root, { recursive: true, force: true });
		}
	});

	test('package approval after a completed turn refreshes the same retained backing', async function () {
		const configuredRoot = process.env.VSCODE_CANVAS_HOST_TEST_ROOT;
		if (!configuredRoot) {
			this.skip();
		}
		if (process.versions.electron) {
			const result = await promisify(execFile)('node', [
				join(process.cwd(), 'node_modules/mocha/bin/mocha.js'), 'test/unit/node/index.js',
				'--delay', '--ui=tdd', '--timeout=120000', '--exit', '--run',
				'src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvasSdk.integrationTest.ts',
				'--grep', 'package approval after a completed turn',
			], { cwd: process.cwd(), env: process.env, timeout: 115_000, maxBuffer: 4 * 1024 * 1024 });
			await writeFile(`${configuredRoot}-approval-node.log`, result.stdout);
			return;
		}
		assert.ok(configuredRoot.startsWith(join(process.cwd(), '.build') + '/'));
		assert.strictEqual(process.env.COPILOT_HOME, join(configuredRoot, 'copilot-home'));
		assert.strictEqual(process.env.HOME, join(configuredRoot, 'home'));
		let runtime: IAgentHostRuntime | undefined;
		const log = store.add(new RecordingLogService());
		let modelCalls = 0;
		try {
			for (const path of ['home/.config', 'copilot-home', 'workspace', 'profile']) {
				await mkdir(join(configuredRoot, path), { recursive: true });
			}
			const workspace = URI.file(await realpath(join(configuredRoot, 'workspace')));
			await promisify(execFile)('git', ['init', '--quiet', '--initial-branch=ulugbekna/canvas-approval-test', workspace.fsPath]);
			const source = join(configuredRoot, 'source');
			await cp(fileURLToPath(new URL('./fixtures/liveCanvas/', import.meta.url)), source, { recursive: true });
			const registry = new ByokLmBridgeRegistry();
			const models = store.add(new Emitter<IByokLmModelInfo[]>({
				onDidAddFirstListener: () => models.fire([{ vendor: 'canvas', id: 'offline', name: 'Offline Canvas Test', maxContextWindowTokens: 128_000 }]),
			}));
			store.add(registry.register('canvas-approval-test', {
				onDidChangeModels: models.event,
				chat: async () => {
					modelCalls++;
					return { output: [{ type: 'message', content: [{ type: 'text', text: 'The existing chat is ready.' }] }] };
				},
			}));
			const productService = { ...product, _serviceBrand: undefined };
			const environmentService = new NativeEnvironmentService(parseArgs([
				'--user-data-dir', join(configuredRoot, 'profile'), '--extensions-dir', join(configuredRoot, 'extensions'),
				'--agent-plugins-dir', join(configuredRoot, 'plugins'),
			], OPTIONS), productService);
			runtime = await createAgentHostRuntime({
				environmentService, productService, logService: log, loggerService: undefined,
				disableTelemetry: true, transientProxyConfiguration: true, hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				providerConfigurations: [], byok: { kind: 'renderer', bridgeRegistry: registry },
				fileSystemProvider: new UnwatchedDiskFileSystemProvider(log),
			});
			const services = runtime.instantiationService.invokeFunction(accessor => ({
				config: accessor.get(IAgentConfigurationService),
				packages: accessor.get(IAgentHostCanvasPackagesService),
				providers: accessor.get(IAgentHostProviderService),
				state: accessor.get(IAgentHostStateManager),
			}));
			services.config.updateRootConfig({
				[AgentHostByokModelsEnabledConfigKey]: true,
				[AgentHostGitHubMcpServerEnabledConfigKey]: false,
				[AgentHostSessionSyncEnabledConfigKey]: false,
				[AgentHostSystemProxyEnabledConfigKey]: false,
			});
			const agent = runtime.instantiationService.createInstance(RecordingCanvasAgent);
			services.providers.registerProvider(agent);
			assert.ok(runtime.agentService.canvasProtocol.initialize);
			await runtime.agentService.canvasProtocol.initialize(true);
			const session = await runtime.agentService.createSession({
				provider: 'copilotcli', model: { id: 'canvas/offline' }, workingDirectories: [workspace],
				config: { [SessionConfigKey.Isolation]: 'folder' },
			});
			const chat = URI.parse(buildDefaultChatUri(session));
			await agent.chats.sendMessage(chat, 'Complete this first turn before any canvas package is approved.', [workspace], undefined, generateUuid(), undefined, createAgentChatContext(services.state, session, chat));
			const stateFile = await runtime.agentService.getSessionStateFile(session, chat);
			assert.ok(stateFile);
			const readEvents = async (): Promise<{ type: string }[]> => (await readFile(stateFile.fsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
			await waitFor(readEvents, events => events.filter(event => event.type === 'assistant.message').length === 1);
			assert.strictEqual(agent.resolutions.filter(resolution => resolution.approved).length, 0);
			const pkg = await services.packages.prepare(URI.file(source));
			await services.packages.approve(pkg.id, pkg.revision, workspace);
			await Promise.all([
				agent.chats.changeModel(chat, { id: 'canvas/offline' }, createAgentChatContext(services.state, session, chat)),
				agent.chats.changeAgent(chat, undefined, createAgentChatContext(services.state, session, chat)),
			]);
			await agent.chats.sendMessage(chat, 'Continue the same chat after approving its first canvas package.', [workspace], undefined, generateUuid(), undefined, createAgentChatContext(services.state, session, chat));
			await waitFor(readEvents, events => events.filter(event => event.type === 'assistant.message').length === 2);
			const extensionId = canvasPackageExtensionId(pkg.id);
			await waitFor(() => runtime!.agentService.getCanvases(chat), value => value.catalog.some(canvas => canvas.extensionId === extensionId));
			const [snapshot] = await services.packages.getApprovedSnapshots(workspace);
			assert.ok(snapshot);
			const launch = await services.packages.resolveLaunch(extensionId, URI.joinPath(snapshot.pluginDirectory, 'com.github.copilot/extensions/main/extension.mjs').fsPath, workspace);
			assert.ok(launch);
			const audit: CanvasFixtureAudit[] = (await readFile(join(launch.dataDirectory.fsPath, 'audit.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
			const events = await readEvents();
			const afterStateFile = await runtime.agentService.getSessionStateFile(session, chat);
			const result = {
				sameBacking: afterStateFile?.toString() === stateFile.toString(),
				retained: events.filter(event => event.type === 'session.retained').length,
				userMessages: events.filter(event => event.type === 'user.message').length,
				assistantMessages: events.filter(event => event.type === 'assistant.message').length,
				modelCalls,
				startups: audit.filter(entry => entry.kind === 'startup').map(entry => ({ retained: entry.value.retained, turns: entry.value.turns })),
				lifecycleErrors: log.lines.filter(line => /Hook processor is not configured|Session not found|session\.eventLog\.releaseInterest/.test(line)),
			};
			assert.deepStrictEqual(result, {
				sameBacking: true, retained: 1, userMessages: 2, assistantMessages: 2, modelCalls: 2,
				startups: [{ retained: true, turns: 2 }], lifecycleErrors: [],
			});
			await writeFile(`${configuredRoot}-approval-evidence.json`, JSON.stringify(result, null, '\t') + '\n');
		} finally {
			if (runtime) {
				await stopHost(runtime);
			}
			await writeFile(`${configuredRoot}-approval-host.log`, log.lines.join('\n') + '\n');
			await rm(configuredRoot, { recursive: true, force: true });
		}
	});
});
