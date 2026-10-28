/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient, type CopilotSession, type ResumeSessionConfig, type SessionConfig } from '@github/copilot-sdk';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { restore, stub } from 'sinon';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import { CustomizationType, MessageKind, ResponsePartKind, TurnState } from '../../common/state/sessionState.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { buildSessionEventLogFromTurns } from '../../node/copilot/buildSessionEvents.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { CopilotGitHubSessionCredentials } from '../../node/copilot/copilotGitHubCredentials.js';
import type { CopilotSessionLaunchPlan } from '../../node/copilot/copilotSessionLauncher.js';
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
