/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient, type CopilotSession, type ResumeSessionConfig, type SessionConfig } from '@github/copilot-sdk';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { restore, stub } from 'sinon';
import { join } from '../../../../base/common/path.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { PluginFormat, toParsedAgent } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService, type IFileContent } from '../../../files/common/files.js';
import { CustomizationType, MessageKind, ResponsePartKind, TurnState } from '../../common/state/sessionState.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { buildSessionEventLogFromTurns } from '../../node/copilot/buildSessionEvents.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { CopilotGitHubSessionCredentials } from '../../node/copilot/copilotGitHubCredentials.js';
import { getCopilotAgentSelection, getCopilotAgentSelectionName, type CopilotSessionLaunchPlan } from '../../node/copilot/copilotSessionLauncher.js';
import { getSdkCustomAgentName } from '../../node/copilot/copilotPluginConverters.js';
import { createTestLauncher, testRuntime } from './copilotSessionLauncherTestHelpers.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';

suite('Copilot SDK - native agent launch', function () {
	this.timeout(60_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let home: string;
	let client: CopilotClient | undefined;

	setup(async () => {
		home = await realpath(await mkdtemp(join(tmpdir(), 'copilot-native-agent-')));
	});

	teardown(async () => {
		restore();
		try {
			await client?.stop();
		} finally {
			client = undefined;
			await rm(home, { recursive: true, force: true });
		}
	});

	for (const mode of ['copilot-cli', 'empty'] as const) {
		test(`${mode} resume: preserves a saved flat-layout selection registered with an authored SDK name`, async () => {
			const root = URI.file(join(home, 'cache', 'legacy-bundle', 'current'));
			const uri = URI.joinPath(root, 'agents', 'reviewer.agent.md');
			const savedUri = URI.file(join(home, 'cache', 'legacy-bundle', 'previous', 'agents', 'reviewer.agent.md')).toString();
			await mkdir(join(root.fsPath, 'agents'), { recursive: true });
			await writeFile(uri.fsPath, '---\nname: Reviewer\n---\nLegacy prompt.');
			const opens: string[] = [];
			client = new class extends CopilotClient {
				override async createSession(config: SessionConfig): Promise<CopilotSession> {
					opens.push('create');
					return super.createSession(config);
				}
				override async resumeSession(id: string, config: ResumeSessionConfig): Promise<CopilotSession> {
					opens.push('resume');
					return super.resumeSession(id, config);
				}
			}({
				mode, baseDirectory: home, useLoggedInUser: false,
				env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
					PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
					COPILOT_TELEMETRY_ENABLED: 'false',
				})),
			});
			await client.start();
			const providers = [{ name: 'local', type: 'openai' as const, wireApi: 'completions' as const, baseUrl: 'http://127.0.0.1:1/v1' }];
			const models = [{ id: 'legacy-test-model', provider: 'local' }];
			const sessionId = generateUuid();
			const original = await client.createSession({
				sessionId, workingDirectory: home, model: 'legacy-test-model', providers, models,
				availableTools: [],
				customAgents: [{ name: 'Reviewer', displayName: 'Reviewer', prompt: 'Legacy prompt.' }], agent: 'Reviewer',
			});
			const before = (await original.rpc.agent.getCurrent()).agent?.id;
			await original.disconnect();
			const directory = join(home, 'session-state', sessionId);
			await mkdir(directory, { recursive: true });
			await writeFile(join(directory, 'events.jsonl'), buildSessionEventLogFromTurns([{
				id: generateUuid(), message: { text: 'Retained question', origin: { kind: MessageKind.User } },
				responseParts: [{ id: generateUuid(), kind: ResponsePartKind.Markdown, content: 'Retained answer' }],
				state: TurnState.Complete, usage: undefined,
			}], { sessionId, workingDirectory: home }));
			const fileService = upcastPartial<IFileService>({
				readFile: async resource => upcastPartial<IFileContent>({ value: VSBuffer.wrap(await readFile(resource.fsPath)) }),
			});
			const launcher = createTestLauncher(undefined, {}, undefined, undefined, undefined, undefined, fileService);
			stub(launcher, 'resolveByokSessionConfig').resolves({ providers, models });
			const snapshot = {
				discoveredAgents: [],
				plugins: [{
					format: PluginFormat.Copilot, nonce: 'current', resourceDir: root, sourceUri: URI.parse('client-customizations:/legacy'),
					agents: [toParsedAgent({ uri, name: 'Reviewer' })], skills: [], hooks: [], instructions: [], mcpServers: [],
				}],
				additionalRootInstructions: [], tools: [], mcpServers: {},
			};
			const wrapper = await launcher.launch({
				kind: 'resume', client, sessionId, workingDirectory: URI.file(home), snapshot,
				resolvedAgentName: getCopilotAgentSelectionName(snapshot, savedUri, true),
				fallback: { model: { id: 'legacy-test-model' } },
				activeClientToolSet: new ActiveClientToolSet(), shellManager: undefined,
				githubCredentials: CopilotGitHubSessionCredentials.fromToken(undefined),
			}, testRuntime);
			try {
				assert.deepStrictEqual({
					before, after: (await wrapper.session.rpc.agent.getCurrent()).agent?.id, opens,
					restoredResource: getCopilotAgentSelection(snapshot, savedUri, true)?.uri,
				}, {
					before: 'Reviewer', after: getSdkCustomAgentName(uri, snapshot.plugins[0]), opens: ['create', 'resume'],
					restoredResource: uri.toString(),
				});
			} finally {
				wrapper.dispose();
			}
		});
	}

	for (const mode of ['copilot-cli', 'empty'] as const) {
		for (const { kind, sharedBundle } of (['create', 'resume', 'recover'] as const).flatMap(kind => [false, true].map(sharedBundle => ({ kind, sharedBundle })))) {
			test(`${mode} ${kind}: distinguishes and switches forwarded agents with identical display names from ${sharedBundle ? 'one bundle' : 'different plugins'}`, async () => {
				const uris = [0, 1].map(index => URI.file(join(home, `source-${index}`, 'shared.agent.md')));
				for (const [index, uri] of uris.entries()) {
					await mkdir(join(home, `source-${index}`), { recursive: true });
					await writeFile(uri.fsPath, `---\nname: Friendly Reviewer\n---\nPrompt ${index}`);
				}
				const opens: { kind: string; agent: string | undefined }[] = [];
				client = new class extends CopilotClient {
					override async createSession(config: SessionConfig): Promise<CopilotSession> {
						opens.push({ kind: 'create', agent: config.agent });
						return super.createSession(config);
					}
					override async resumeSession(id: string, config: ResumeSessionConfig): Promise<CopilotSession> {
						opens.push({ kind: 'resume', agent: config.agent });
						return super.resumeSession(id, config);
					}
				}({
					mode, baseDirectory: home, useLoggedInUser: false,
					env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
						PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
						COPILOT_TELEMETRY_ENABLED: 'false',
					})),
				});
				await client.start();
				const sessionId = generateUuid();
				if (kind === 'resume') {
					const directory = join(home, 'session-state', sessionId);
					await mkdir(directory, { recursive: true });
					await writeFile(join(directory, 'events.jsonl'), buildSessionEventLogFromTurns([{
						id: generateUuid(), message: { text: 'Retained question', origin: { kind: MessageKind.User } },
						responseParts: [{ id: generateUuid(), kind: ResponsePartKind.Markdown, content: 'Retained answer' }],
						state: TurnState.Complete, usage: undefined,
					}], { sessionId, workingDirectory: home }));
				}
				const fileService = upcastPartial<IFileService>({
					readFile: async resource => upcastPartial<IFileContent>({ value: VSBuffer.wrap(await readFile(resource.fsPath)) }),
				});
				const launcher = createTestLauncher(undefined, {}, undefined, undefined, undefined, undefined, fileService);
				stub(launcher, 'resolveByokSessionConfig').resolves({
					providers: [{ name: 'local', type: 'openai', wireApi: 'completions', baseUrl: 'http://127.0.0.1:1/v1' }],
					models: [{ id: 'forwarded-test-model', provider: 'local' }],
				});
				const groups = sharedBundle ? [uris] : uris.map(uri => [uri]);
				const snapshot = {
					discoveredAgents: [],
					plugins: groups.map((group, index) => ({
						format: PluginFormat.Copilot, nonce: 'content-revision',
						sourceUri: URI.parse(`client-plugin:/source-${index}`),
						resourceDir: URI.file(sharedBundle ? home : join(home, `source-${index}`)),
						agents: group.map(uri => toParsedAgent({ uri, name: 'Friendly Reviewer' })),
						skills: [], hooks: [], instructions: [], mcpServers: [],
					})),
					additionalRootInstructions: [], tools: [], mcpServers: {},
				};
				const sdkNames = uris.map((uri, index) => getSdkCustomAgentName(uri, snapshot.plugins[sharedBundle ? 0 : index]));
				const shared = {
					client, sessionId, workingDirectory: URI.file(home), snapshot,
					resolvedAgentName: getCopilotAgentSelectionName(snapshot, uris[0].toString()),
					activeClientToolSet: new ActiveClientToolSet(), shellManager: undefined,
					githubCredentials: CopilotGitHubSessionCredentials.fromToken(undefined),
				};
				const plan: CopilotSessionLaunchPlan = kind === 'create'
					? { ...shared, kind, model: { id: 'forwarded-test-model' } }
					: { ...shared, kind: 'resume', fallback: { model: { id: 'forwarded-test-model' } } };
				const wrapper = await launcher.launch(plan, testRuntime);
				try {
					const initial = (await wrapper.session.rpc.agent.getCurrent()).agent;
					const catalog = (await wrapper.session.rpc.agent.list({ includeBuiltInAgents: false })).agents;
					await wrapper.session.rpc.agent.select({ name: getCopilotAgentSelectionName(snapshot, uris[1].toString())! });
					const switched = (await wrapper.session.rpc.agent.getCurrent()).agent;
					assert.deepStrictEqual({
						initial: initial?.id,
						switched: switched?.id,
						labels: sdkNames.map(name => catalog.find(agent => agent.id === name)?.displayName),
						opens,
					}, {
						initial: sdkNames[0],
						switched: sdkNames[1],
						labels: ['Friendly Reviewer', 'Friendly Reviewer'],
						opens: (kind === 'recover' ? ['resume', 'create'] : [kind]).map(kind => ({ kind, agent: sdkNames[0] })),
					});
				} finally {
					wrapper.dispose();
				}
			});
		}
	}

	for (const mode of ['copilot-cli', 'empty'] as const) {
		for (const kind of ['create', 'resume', 'recover'] as const) {
			test(`${mode} ${kind}: ${mode === 'empty' ? 'surfaces missing native catalog support' : 'selects a native-only agent after construction'}`, async () => {
				const pluginDir = join(home, 'plugin');
				const agentPath = join(pluginDir, 'agents', 'reviewer.agent.md');
				await mkdir(join(pluginDir, '.plugin'), { recursive: true });
				await mkdir(join(pluginDir, 'agents'), { recursive: true });
				await writeFile(join(pluginDir, '.plugin', 'plugin.json'), JSON.stringify({ name: 'review-native', version: '1.0.0' }));
				await writeFile(agentPath, '---\nname: Reviewer\ndescription: Local reviewer\n---\nReview locally.');

				const opens: { kind: string; agent: string | undefined; nativeDefinition: boolean }[] = [];
				const nativeAgent = {
					type: CustomizationType.Agent, id: 'review-native:reviewer',
					uri: URI.file(agentPath).toString(), name: 'Reviewer',
				} as const;
				const capture = (kind: string, config: ResumeSessionConfig | undefined) => {
					opens.push({
						kind, agent: config?.agent,
						nativeDefinition: config?.customAgents?.some(agent => agent.name === nativeAgent.id || agent.name === nativeAgent.name) ?? false,
					});
				};
				client = new class extends CopilotClient {
					override async createSession(config: SessionConfig): Promise<CopilotSession> {
						capture('create', config);
						return super.createSession(config);
					}
					override async resumeSession(id: string, config: ResumeSessionConfig): Promise<CopilotSession> {
						capture('resume', config);
						return super.resumeSession(id, config);
					}
				}({
					mode, baseDirectory: home, useLoggedInUser: false,
					env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
						PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
						COPILOT_TELEMETRY_ENABLED: 'false',
					})),
				});
				await client.start();

				const sessionId = generateUuid();
				if (kind === 'resume') {
					const directory = join(home, 'session-state', sessionId);
					await mkdir(directory, { recursive: true });
					await writeFile(join(directory, 'events.jsonl'), buildSessionEventLogFromTurns([{
						id: generateUuid(), message: { text: 'Retained question', origin: { kind: MessageKind.User } },
						responseParts: [{ id: generateUuid(), kind: ResponsePartKind.Markdown, content: 'Retained answer' }],
						state: TurnState.Complete, usage: undefined,
					}], { sessionId, workingDirectory: home }));
				}

				const launcher = createTestLauncher();
				stub(launcher, 'resolveByokSessionConfig').resolves({
					providers: [{ name: 'local', type: 'openai', wireApi: 'completions', baseUrl: 'http://127.0.0.1:1/v1' }],
					models: [{ id: 'native-test-model', provider: 'local' }],
				});
				const shared = {
					client, sessionId, workingDirectory: URI.file(home),
					resolvedAgentName: nativeAgent.id,
					snapshot: {
						discoveredAgents: [], nativeAgents: [nativeAgent], additionalRootInstructions: [], tools: [], mcpServers: {},
						plugins: [{ pluginDir: URI.file(pluginDir), format: PluginFormat.Copilot, agents: [], skills: [], instructions: [], hooks: [], mcpServers: [] }],
					},
					activeClientToolSet: new ActiveClientToolSet(), shellManager: undefined,
					githubCredentials: CopilotGitHubSessionCredentials.fromToken(undefined),
				};
				const plan: CopilotSessionLaunchPlan = kind === 'create'
					? { ...shared, kind, model: { id: 'native-test-model' } }
					: { ...shared, kind: 'resume', fallback: { model: { id: 'native-test-model' } } };

				if (mode === 'empty') {
					// The bundled empty-mode runtime omits plugin agents even after catalog discovery.
					await assert.rejects(launcher.launch(plan, testRuntime), /Custom agent 'review-native:reviewer' not found/);
				} else {
					const wrapper = await launcher.launch(plan, testRuntime);
					try {
						const current = await wrapper.session.rpc.agent.getCurrent();
						const events = await wrapper.session.getEvents();
						assert.deepStrictEqual({
							selected: current.agent?.id,
							userMessages: events.filter(event => event.type === 'user.message').map(event => event.data.content),
						}, { selected: nativeAgent.id, userMessages: kind === 'resume' ? ['Retained question'] : [] });
					} finally {
						wrapper.dispose();
					}
				}
				assert.deepStrictEqual(opens, (kind === 'recover' ? ['resume', 'create'] : [kind])
					.map(kind => ({ kind, agent: undefined, nativeDefinition: false })));
			});
		}
	}
});
