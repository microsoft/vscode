/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { AgentSession, fixedChatOwnerRef, type AgentSignal, type IAgentChatContext, type IAgentCreateChatResult } from '../../../common/agent.js';
import { captureCredentialSource } from '../../../common/agentHostCredentials.js';
import { subagentChatUri } from '../../../common/agentHostChatMinting.js';
import { AgentHostMcpConnectorsEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ChatOriginKind, MessageKind, ToolResultContentType, type Turn } from '../../../common/state/sessionState.js';
import { AgentHostAuthenticationScope } from '../../../node/agentHostAuthenticationScope.js';
import { getAppNodeModulesUri } from '../../../node/appNodeModules.js';
import { resolveCopilotRuntimePaths } from '../../../node/copilot/copilotRuntimePaths.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createLocalEndpointCopilotAgent } from './copilotAgentIntegrationTestHarness.js';
import { credentialEnvironmentSentinels, fakeCapiCredentialForLabel, labelTestCredential, normalizeTestSystemPrompt } from './copilotCredentialTestUtils.js';

interface ModelRequest {
	messages: { role: string; content?: string; tool_call_id?: string }[];
	tools: { type: string; name?: string; function?: { name: string }; custom?: { name: string } }[];
}

interface ModelTraffic {
	readonly probe: string;
	readonly token: string;
	readonly tools: readonly string[];
	readonly results: readonly string[];
	readonly instructions: boolean;
	readonly environment: boolean;
	readonly ancestorInstructions: boolean;
	readonly workspaceSkill: boolean;
	readonly normalizedPrompt: string;
}

suite('Copilot Agent credential sponsorship', function () {
	this.timeout(120_000);

	const resource = 'https://api.github.com';
	const metadata = [{ resource }];
	let server: Server;
	let directory: string;
	let endpoint: string;
	let agent: ReturnType<typeof createLocalEndpointCopilotAgent>;
	let store: DisposableStore;
	let githubTokens: string[];
	let modelTraffic: ModelTraffic[];
	let connectorTokens: string[];
	let unexpectedRequests: string[];
	let originalEnvironment: Map<string, string | undefined>;
	const signals: AgentSignal[] = [];

	function onProgress(signal: AgentSignal): void {
		signals.push(signal);
		if (signal.kind === 'pending_confirmation') {
			agent.respondToPermissionRequest(signal.state.toolCallId, true);
		}
	}

	setup(async () => {
		originalEnvironment = new Map(Object.entries(process.env).filter(([key]) =>
			/(?:AUTH|TOKEN|_KEY|SECRET|PASSWORD)|^(?:GIT_CONFIG_|COPILOT_|GITHUB_|GH_|ANTHROPIC_|OPENAI_|AZURE_OPENAI_|AWS_|AZURE_|VSCODE_AGENT_HOST_CAPI_)|^(?:HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
		for (const key of new Set([...originalEnvironment.keys(), ...Object.keys(credentialEnvironmentSentinels)])) {
			const hasOriginal = isWindows
				? [...originalEnvironment.keys()].some(original => original.toUpperCase() === key.toUpperCase())
				: originalEnvironment.has(key);
			if (!hasOriginal) {
				originalEnvironment.set(key, undefined);
			}
			delete process.env[key];
		}
		Object.assign(process.env, credentialEnvironmentSentinels);
		store = new DisposableStore();
		githubTokens = [];
		modelTraffic = [];
		connectorTokens = [];
		unexpectedRequests = [];
		signals.length = 0;
		const { runtimePath } = await resolveCopilotRuntimePaths(getAppNodeModulesUri());
		const skillsRoot = join(dirname(runtimePath), '..', '..', 'builtin-skills');
		assert.deepStrictEqual((await readdir(skillsRoot)).sort(), ['customize-cloud-agent', 'discover-resources', 'github-pr-media']);
		assert.ok((await readFile(join(skillsRoot, 'github-pr-media', 'SKILL.md'), 'utf8')).includes('gh auth token'), 'Excluded SDK skill no longer has its reviewed ambient-auth behavior');
		directory = createTestDirectory(join(tmpdir(), 'copilot-sponsorship-'));
		assert.ok(!isEqualOrParent(URI.file(directory), URI.file(process.cwd())), 'Synthetic provider data must be outside the source workspace');
		const { createServer } = await import('http');
		server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			const authorization = labelTestCredential(request.headers.authorization);
			const credentialHeaders = Object.entries(request.headers).filter(([key]) => /authorization|token|api[-_]key|secret|cookie/i.test(key))
				.flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(token => ({ key, label: labelTestCredential(token) })));
			if (credentialHeaders.some(header => header.label === 'UNEXPECTED')) {
				unexpectedRequests.push(`Unexpected credential header on ${request.method} ${path}`);
				response.writeHead(401, { 'x-should-retry': 'false' });
				response.end('Unexpected credential');
				return;
			}
			const json = (value: object) => {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(value));
			};
			if (path === '/user') {
				githubTokens.push(authorization);
				json({ login: 'replay-user', id: 1, type: 'User' });
			} else if (path === '/copilot_internal/managed_settings') {
				githubTokens.push(authorization);
				json({});
			} else if (path.includes('/copilot_internal/') && (path.includes('/token') || path.includes('/nltoken'))) {
				githubTokens.push(authorization);
				const token = fakeCapiCredentialForLabel(authorization);
				if (token === undefined) {
					unexpectedRequests.push(`Unrecognized fake credential for ${path}`);
					response.writeHead(401, { 'x-should-retry': 'false' });
					response.end('Unrecognized fake credential');
					return;
				}
				json({
					token,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					refresh_in: 1800,
					endpoints: { api: endpoint, proxy: endpoint, telemetry: endpoint },
				});
			} else if (path === '/copilot-connectors/api/v1/plugins' && request.method === 'GET') {
				connectorTokens.push(authorization);
				json({ plugins: [] });
			} else if (path === '/chat/completions' && request.method === 'POST') {
				const model = JSON.parse(body) as ModelRequest;
				const prompt = [...model.messages].reverse().find(message => message.role === 'user')?.content ?? '';
				const probe = /CREDENTIAL_PROBE:(?<probe>[A-Z-]+)/.exec(prompt)?.groups?.probe;
				if (!probe) {
					unexpectedRequests.push('Model request without a credential probe');
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end();
					return;
				}
				const tools = model.tools.map(tool => tool.function?.name ?? tool.custom?.name ?? tool.name ?? tool.type);
				const results = model.messages.filter(message => message.role === 'tool').map(message => message.content ?? '');
				const workspace = join(directory, probe.split('-')[0]);
				const context = model.messages.map(message => message.content ?? '').join('\n');
				const normalizedPrompt = normalizeTestSystemPrompt(model.messages.filter(message => message.role === 'system' || message.role === 'developer')
					.map(message => message.content ?? '').join('\n'), workspace, directory);
				modelTraffic.push({
					probe, token: authorization, tools, results,
					instructions: context.includes('SYNTHETIC_REPOSITORY_INSTRUCTION'),
					environment: context.includes(workspace) || context.includes(workspace.replaceAll('\\', '/')),
					ancestorInstructions: context.includes('VS Code Copilot Instructions'),
					workspaceSkill: context.includes('sponsorship-workspace-skill'),
					normalizedPrompt,
				});
				const operations = [
					{ name: 'view', arguments: { path: join(workspace, 'probe.txt') } },
					{ name: 'apply_patch', input: `*** Begin Patch\n*** Update File: ${join(workspace, 'probe.txt')}\n@@\n-before\n+after\n*** Add File: ${join(workspace, 'created.txt')}\n+created-proof\n*** End Patch\n` },
					{ name: 'glob', arguments: { pattern: '*.txt', path: workspace } },
					{ name: 'rg', arguments: { pattern: 'after', paths: workspace } },
					{
						name: isWindows ? 'powershell' : 'bash', arguments: {
							command: isWindows
								? ['Write-Output SHELL_EXECUTION_PROOF', `if ($env:GITHUB_TOKEN -eq '${probe === 'A' ? 'scope-a' : probe === 'B' ? 'scope-b' : 'legacy-l'}') { Write-Output SHELL_CREDENTIAL_PROOF }`, ...Object.entries(credentialEnvironmentSentinels).map(([key, value]) =>
									`if ($env:${key} -eq '${value}') { Write-Output 'ENV_FAKE_${key}=present' } else { Write-Output 'ENV_FAKE_${key}=absent' }`)].join('; ')
								: ['printf "SHELL_EXECUTION_PROOF\\n"', `if [ "\${GITHUB_TOKEN-}" = '${probe === 'A' ? 'scope-a' : probe === 'B' ? 'scope-b' : 'legacy-l'}' ]; then printf 'SHELL_CREDENTIAL_PROOF\\n'; fi`, ...Object.entries(credentialEnvironmentSentinels).map(([key, value]) =>
									`if [ "\${${key}-}" = '${value}' ]; then printf 'ENV_FAKE_${key}=present\\n'; else printf 'ENV_FAKE_${key}=absent\\n'; fi`)].join('; '),
							description: 'Audit synthetic credential sentinels without printing environment values',
						}
					},
				];
				const calls = modelTraffic.filter(traffic => traffic.probe === probe).length;
				const operation = probe === 'A-DELEGATED' && calls === 1
					? { name: 'task', arguments: { name: 'fixture-child', agent_type: 'explore', model: 'gpt-4o', description: 'Read-only fixture child', prompt: 'CREDENTIAL_PROBE:A-CHILD. Reply briefly without using tools.' } }
					: probe.includes('-') ? undefined : operations[calls - 1];
				if (operation && !tools.includes(operation.name)) {
					unexpectedRequests.push(`Unavailable coding tool: ${probe}:${operation.name}`);
				}
				json({
					id: `sponsorship-${probe}-${calls}`,
					choices: [{
						index: 0,
						message: operation ? {
							role: 'assistant', content: null,
							tool_calls: [hasKey(operation, { input: true })
								? { id: `call-${probe}-${calls}`, type: 'custom', custom: { name: operation.name, input: operation.input } }
								: { id: `call-${probe}-${calls}`, type: 'function', function: { name: operation.name, arguments: JSON.stringify(operation.arguments) } }],
						} : { role: 'assistant', content: `DONE:${probe}` },
						finish_reason: operation ? 'tool_calls' : 'stop',
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					if (path.includes('/copilot_internal/')) {
						githubTokens.push(authorization);
					}
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', endpoint));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end('Unexpected credential-sponsorship endpoint');
				}
			}
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
		agent = createLocalEndpointCopilotAgent(store, directory, endpoint, { [AgentHostMcpConnectorsEnabledConfigKey]: true });
		store.add(agent.onDidChatProgress(onProgress));
	});

	teardown(async () => {
		try {
			try {
				await agent?.shutdown();
			} finally {
				store?.dispose();
				server?.closeAllConnections();
				if (server?.listening) {
					await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
				}
				if (directory) {
					await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				}
			}
		} finally {
			for (const key of Object.keys(credentialEnvironmentSentinels)) {
				delete process.env[key];
			}
			for (const [key, value] of originalEnvironment ?? []) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
	});

	async function createScope(token: string): Promise<AgentHostAuthenticationScope> {
		const scope = store.add(new AgentHostAuthenticationScope(async params => params, () => { }, { apiOrigin: resource, userId: '1' }));
		await scope.authenticate({ resource, token, scopes: ['contents:read'], expiresIn: 7200 }, [resource]);
		return scope;
	}

	function context(name: string, scope?: AgentHostAuthenticationScope): IAgentChatContext {
		const session = AgentSession.uri('copilotcli', `sponsorship-${name}`);
		return {
			resource: session, owner: fixedChatOwnerRef(session),
			sessionSettings: undefined, launchWorkingDirectories: undefined, workspaceless: false,
			...(scope ? { credentials: captureCredentialSource(scope, metadata) } : {}),
		};
	}

	async function createChat(name: string, scope?: AgentHostAuthenticationScope): Promise<IAgentCreateChatResult> {
		const workspace = join(directory, name);
		await mkdir(workspace);
		// The nested repository bounds instruction discovery to synthetic files.
		execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', '--template='], { cwd: workspace });
		execFileSync('git', ['config', 'gc.auto', '0'], { cwd: workspace });
		execFileSync('git', ['config', 'maintenance.auto', 'false'], { cwd: workspace });
		await writeFile(join(workspace, 'probe.txt'), 'before\n');
		await writeFile(join(workspace, 'AGENTS.md'), 'SYNTHETIC_REPOSITORY_INSTRUCTION');
		const skill = join(workspace, '.github', 'skills', 'sponsorship-workspace-skill');
		await mkdir(skill, { recursive: true });
		await writeFile(join(skill, 'SKILL.md'), '---\nname: sponsorship-workspace-skill\ndescription: Synthetic workspace discovery proof\n---\nSynthetic skill for credential parity tests.\n');
		const chatContext = context(name, scope);
		const created = await agent.chats.createChat(URI.parse(buildDefaultChatUri(chatContext.resource)), chatContext, {
			deferBacking: true, model: { id: 'gpt-4o' }, workingDirectories: [URI.file(workspace)],
			config: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
		});
		assert.ok(created);
		return created;
	}

	async function send(probe: string, scope?: AgentHostAuthenticationScope): Promise<void> {
		const name = probe.split('-')[0];
		const chatContext = context(name, scope);
		const chat = URI.parse(buildDefaultChatUri(chatContext.resource));
		const completed = new DeferredPromise<boolean>();
		const listener = agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && signal.action.type === ActionType.ChatTurnComplete && signal.action.turnId === probe) {
				void completed.complete(true);
			}
		});
		try {
			await agent.chats.prepareTurn!(chat, probe, [URI.file(join(directory, name))], chatContext);
			await agent.chats.sendMessage(chat, `CREDENTIAL_PROBE:${probe}`, [URI.file(join(directory, name))], undefined, probe, undefined, chatContext);
			assert.notStrictEqual(await raceTimeout(completed.p, 30_000), undefined, `Turn ${probe} did not complete: ${JSON.stringify(signals.map(signal => signal.kind === 'action' ? signal.action.type : signal.kind))}; requests: ${JSON.stringify(unexpectedRequests)}`);
		} finally {
			listener.dispose();
		}
	}

	test('after restart, isolated history matches live history without authentication, activation or network traffic', async () => {
		const scope = await createScope('scope-a');
		const created = await createChat('A', scope);
		await send('A', scope);
		await send('A-DELEGATED', scope);
		const original = context('A', scope);
		const chat = URI.parse(buildDefaultChatUri(original.resource));
		const live = await agent.chats.getMessages(chat, original);
		const child = URI.parse(subagentChatUri('shaped', original.resource.toString(), chat.toString(), 'call-A-DELEGATED-1'));
		const childContext = { ...original, origin: { kind: ChatOriginKind.Tool as const, chat: chat.toString(), toolCallId: 'call-A-DELEGATED-1' } };
		const liveChild = await agent.chats.getMessages(child, childContext);
		assert.ok(liveChild.length > 0, `The fixture must generate a real child transcript: ${JSON.stringify({
			probes: modelTraffic.map(request => request.probe),
			task: signals.filter(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete && signal.action.toolCallId === 'call-A-DELEGATED-1'),
		})}`);
		await agent.chats.releaseChat(chat, original);
		await agent.shutdown();
		agent = createLocalEndpointCopilotAgent(store, directory, endpoint, { [AgentHostMcpConnectorsEnabledConfigKey]: true });
		store.add(agent.onDidChatProgress(onProgress));
		const observing = {
			...original,
			credentials: { getCredential: () => { assert.fail('History must not acquire execution credentials'); } },
		};
		const beforeRead = { github: githubTokens.length, model: modelTraffic.length, connectors: connectorTokens.length, clients: agent.clients.length };
		const metadata = await agent.getChatMetadata(chat, observing, created.providerData);
		assert.ok(metadata);
		await agent.materializeChat(chat, observing, created.providerData);
		const [restored, restoredChild] = await Promise.all([
			agent.chats.getMessages(chat, observing),
			agent.chats.getMessages(child, { ...childContext, credentials: observing.credentials }),
		]);
		const canvases = await agent.listSessionCanvases(original.resource, chat, observing);
		const transcript = (turns: readonly Turn[]) => turns.map(turn => ({
			...turn,
			id: turn.message.origin.kind === MessageKind.Tool ? 'generated-tool-turn' : turn.id,
			responseParts: turn.responseParts.map(part => {
				if (!hasKey(part, { id: true })) {
					return part;
				}
				const { id, ...content } = part;
				return content;
			}),
		}));
		assert.deepStrictEqual({
			history: transcript(restored),
			child: transcript(restoredChild),
			canvases,
			traffic: { github: githubTokens.length, model: modelTraffic.length, connectors: connectorTokens.length },
			clients: agent.clients.slice(beforeRead.clients).map(entry => ({
				mode: entry.options.mode, token: entry.options.gitHubToken, stops: entry.client.stopCount, errors: entry.client.stopErrorCount,
			})),
			unexpectedRequests,
		}, {
			history: transcript(live),
			child: transcript(liveChild),
			canvases: [],
			traffic: { github: beforeRead.github, model: beforeRead.model, connectors: beforeRead.connectors },
			clients: [0, 1].map(() => ({ mode: 'empty', token: undefined, stops: 1, errors: 0 })),
			unexpectedRequests: [],
		});
		await agent.chats.releaseChat(chat, observing);
		const snapshotStarted = new DeferredPromise<void>();
		const snapshotGate = new DeferredPromise<void>();
		agent.onClientStarted = (client, options) => {
			if (options.mode === 'empty') {
				const read = client.rpc.sessions.readPersistedEvents;
				client.rpc.sessions.readPersistedEvents = async params => {
					const page = await read(params);
					snapshotStarted.complete();
					await snapshotGate.p;
					return page;
				};
			}
		};
		const snapshot = agent.chats.getMessages(chat, observing);
		try {
			await Promise.race([snapshotStarted.p, snapshot]);
			await send('A-CONTINUED', scope);
		} finally {
			snapshotGate.complete();
			agent.onClientStarted = undefined;
		}
		assert.deepStrictEqual(transcript(await snapshot), transcript(restored));
		await agent.chats.releaseChat(chat, original);
		const afterContinuation = await agent.chats.getMessages(chat, observing);
		assert.deepStrictEqual(afterContinuation.map(turn => turn.message.text), [
			...restored.map(turn => turn.message.text), 'CREDENTIAL_PROBE:A-CONTINUED',
		]);
	});

	test('real Agent startup preserves coding tools and separates A, B and legacy credentials through idle rotation', async () => {
		const [a, b] = await Promise.all([createScope('scope-a'), createScope('scope-b')]);
		await agent.authenticate(resource, 'legacy-l', 7200);
		await Promise.all([createChat('A', a), createChat('B', b), createChat('L')]);
		const prewarmed = await Promise.all([context('A', a), context('L')].map(chatContext =>
			agent.chats.warmChat!(URI.parse(buildDefaultChatUri(chatContext.resource)), chatContext)));
		assert.deepStrictEqual(prewarmed, [true, true]);
		await Promise.all([send('A', a), send('B', b), send('L')]);
		await a.authenticate({ resource, token: 'scope-a-rotated', expiresIn: 7200 }, [resource]);
		await Promise.all([send('A-ROTATED', a), send('B-UNCHANGED', b), send('L-UNCHANGED')]);
		agent.configuration!.updateRootConfig({ [CopilotCliConfigKey.SkillCharBudget]: 40_000 });
		await Promise.all([send('A-CONFIG', a), send('B-CONFIG', b), send('L-CONFIG')]);
		const beforeDeletion = { github: githubTokens.length, model: modelTraffic.length, connectors: connectorTokens.length };
		const aContext = context('A', a);
		const bContext = context('B', b);
		const aChat = URI.parse(buildDefaultChatUri(aContext.resource));
		const bChat = URI.parse(buildDefaultChatUri(bContext.resource));
		await Promise.all([agent.chats.releaseChat(aChat, aContext), agent.chats.releaseChat(bChat, bContext)]);
		const missingCredential = { getCredential: () => { throw new Error('Deleting local storage must not request authentication'); } };
		await Promise.all([
			agent.chats.disposeChat(aChat, { ...aContext, credentials: missingCredential }),
			agent.chats.disposeChat(aChat, { ...aContext, credentials: missingCredential }),
			agent.chats.disposeChat(bChat, { ...bContext, credentials: missingCredential }),
		]);
		assert.deepStrictEqual({ github: githubTokens.length, model: modelTraffic.length, connectors: connectorTokens.length }, beforeDeletion);
		await send('L-AFTER-DISPOSAL');
		const codingTools = ['apply_patch', 'glob', 'rg', 'view', isWindows ? 'powershell' : 'bash'].sort();
		const tokensByProbe = Object.fromEntries(['A', 'B', 'L', 'A-ROTATED', 'B-UNCHANGED', 'L-UNCHANGED', 'A-CONFIG', 'B-CONFIG', 'L-CONFIG', 'L-AFTER-DISPOSAL'].map(probe =>
			[probe, [...new Set(modelTraffic.filter(traffic => traffic.probe === probe).map(traffic => traffic.token))]]));
		const toolsByProbe = Object.fromEntries(['A', 'B', 'L'].map(probe =>
			[probe, modelTraffic.find(traffic => traffic.probe === probe)!.tools.filter(tool => codingTools.includes(tool)).sort()]));
		const aRequest = modelTraffic.find(traffic => traffic.probe === 'A')!;
		const legacyRequest = modelTraffic.find(traffic => traffic.probe === 'L')!;
		const mismatch = [...Array(Math.max(aRequest.normalizedPrompt.length, legacyRequest.normalizedPrompt.length)).keys()]
			.find(index => aRequest.normalizedPrompt[index] !== legacyRequest.normalizedPrompt[index]);
		const prefix = aRequest.normalizedPrompt.slice(0, mismatch);
		const sections = ['environment_context', 'available_skills', 'ask_user', 'task', 'rg', 'view', 'powershell', 'bash', 'custom_instructions', 'instructions'];
		const section = sections.filter(name => prefix.includes(`<${name}`)).sort((a, b) => prefix.lastIndexOf(`<${b}`) - prefix.lastIndexOf(`<${a}`))[0] ?? 'other';
		const promptDiagnostics = {
			mismatch, section, scopedLength: aRequest.normalizedPrompt.length, legacyLength: legacyRequest.normalizedPrompt.length,
			scopedCharacter: mismatch === undefined ? undefined : aRequest.normalizedPrompt.charCodeAt(mismatch),
			legacyCharacter: mismatch === undefined ? undefined : legacyRequest.normalizedPrompt.charCodeAt(mismatch),
			scopedEscapedWorkspacePresent: aRequest.normalizedPrompt.includes(JSON.stringify(join(directory, 'A')).slice(1, -1)),
			legacyEscapedWorkspacePresent: legacyRequest.normalizedPrompt.includes(JSON.stringify(join(directory, 'L')).slice(1, -1)),
		};
		assert.deepStrictEqual({
			onlyScopedTools: aRequest.tools.filter(tool => !legacyRequest.tools.includes(tool)).sort(),
			onlyLegacyTools: legacyRequest.tools.filter(tool => !aRequest.tools.includes(tool)).sort(),
			prompt: createHash('sha256').update(aRequest.normalizedPrompt).digest('hex'),
		}, {
			onlyScopedTools: [],
			onlyLegacyTools: [],
			prompt: createHash('sha256').update(legacyRequest.normalizedPrompt).digest('hex'),
		}, JSON.stringify(promptDiagnostics));
		const completions = signals.filter(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual(completions.map(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete ? signal.action.result : undefined).filter(result => !result?.success), []);
		const toolOutcomes = ['A', 'B', 'L'].map(probe => {
			const text = (index: number) => completions.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete && signal.action.toolCallId === `call-${probe}-${index}`
				? signal.action.result.content?.flatMap(content => content.type === ToolResultContentType.Text ? [content.text] : []) ?? []
				: []).join('\n');
			return {
				view: text(1).includes('before'),
				glob: text(3).includes('probe.txt') && text(3).includes('created.txt'),
				rg: text(4).includes('probe.txt'),
				shell: text(5).includes('SHELL_EXECUTION_PROOF'),
				shellCredential: probe === 'L' ? undefined : text(5).includes('SHELL_CREDENTIAL_PROOF'),
				scopedSentinelsAbsent: probe === 'L' ? undefined : Object.keys(credentialEnvironmentSentinels).every(key => text(5).includes(`ENV_FAKE_${key}=absent`)),
			};
		});
		const files = await Promise.all(['A', 'B', 'L'].map(async name => ({
			edited: await readFile(join(directory, name, 'probe.txt'), 'utf8'),
			created: await readFile(join(directory, name, 'created.txt'), 'utf8'),
			shellExecuted: modelTraffic.filter(traffic => traffic.probe === name).some(traffic => traffic.results.some(result => result.includes('SHELL_EXECUTION_PROOF'))),
		})));
		const storageClients = agent.clients.filter(entry => entry.options.mode === 'empty' && entry.options.gitHubToken === undefined);
		const promptContexts = ['A', 'B', 'L'].map(probe => {
			const request = modelTraffic.find(traffic => traffic.probe === probe)!;
			return { instructions: request.instructions, environment: request.environment, ancestorInstructions: request.ancestorInstructions, workspaceSkill: request.workspaceSkill };
		});
		assert.deepStrictEqual({
			tokensByProbe, toolsByProbe, files, toolCompletions: completions.length, toolOutcomes, promptContexts,
			storage: storageClients.map(entry => ({ token: entry.options.gitHubToken, mode: entry.options.mode, stops: entry.client.stopCount, errors: entry.client.stopErrorCount })),
			stoppedScoped: agent.clients.filter(entry => entry.options.gitHubToken !== undefined).map(entry => entry.client.stopCount),
			scopedProductEnvironment: agent.clients.filter(entry => entry.options.gitHubToken !== undefined || entry.options.mode === 'empty').map(entry =>
				Object.fromEntries(Object.keys(credentialEnvironmentSentinels).map(key => [key, entry.options.env?.[key] === undefined]))),
			legacyStartupTokenKinds: [...new Set(agent.clients.filter(entry => entry.options.mode !== 'empty' && entry.options.gitHubToken === undefined).map(entry => entry.options.gitHubToken))],
			legacyAmbientTokenKinds: [...new Set(agent.clients.filter(entry => entry.options.mode !== 'empty' && entry.options.gitHubToken === undefined).map(entry => entry.options.env?.COPILOT_SDK_AUTH_TOKEN))],
			connectorTokenKinds: [...new Set(connectorTokens)].sort(),
			unexpectedRequests,
			githubTokenKinds: [...new Set(githubTokens)].sort(),
			scopedRuntimeTokens: agent.clients.filter(entry => entry.options.gitHubToken !== undefined).map(entry => entry.options.gitHubToken).sort(),
		}, {
			tokensByProbe: { A: ['A'], B: ['B'], L: ['L'], 'A-ROTATED': ['AR'], 'B-UNCHANGED': ['B'], 'L-UNCHANGED': ['L'], 'A-CONFIG': ['AR'], 'B-CONFIG': ['B'], 'L-CONFIG': ['L'], 'L-AFTER-DISPOSAL': ['L'] },
			toolsByProbe: { A: [...codingTools], B: [...codingTools], L: [...codingTools] },
			files: [0, 1, 2].map(() => ({ edited: 'after\n', created: `created-proof${isWindows ? '\r\n' : '\n'}`, shellExecuted: true })),
			toolOutcomes: ['A', 'B', 'L'].map(probe => ({ view: true, glob: true, rg: true, shell: true, shellCredential: probe === 'L' ? undefined : true, scopedSentinelsAbsent: probe === 'L' ? undefined : true })),
			promptContexts: [0, 1, 2].map(() => ({ instructions: true, environment: true, ancestorInstructions: false, workspaceSkill: true })),
			storage: [0, 1].map(() => ({ token: undefined, mode: 'empty', stops: 1, errors: 0 })),
			stoppedScoped: [1, 1, 1, 1, 1],
			scopedProductEnvironment: [0, 1, 2, 3, 4, 5, 6].map(() => Object.fromEntries(Object.keys(credentialEnvironmentSentinels).map(key => [key, true]))),
			legacyStartupTokenKinds: [undefined],
			legacyAmbientTokenKinds: ['ENV_COPILOT_SDK_AUTH_TOKEN'],
			connectorTokenKinds: ['A', 'AR', 'B', 'L'],
			toolCompletions: 15, unexpectedRequests: [],
			githubTokenKinds: ['A', 'AR', 'B', 'ENV_COPILOT_SDK_AUTH_TOKEN', 'L'],
			scopedRuntimeTokens: ['A', 'AR', 'AR', 'B', 'B'],
		});
	});
});
