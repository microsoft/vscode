/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration tests running on a mocked LLM.
 */

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomizationType, type DirectoryCustomization, ResponsePartKind } from '../../../common/state/sessionState.js';
import { ActionType, SessionCustomizationsChangedAction } from '../../../common/state/sessionActions.js';
import { createRealSession, dispatchTurn, IRealSdkProviderConfig } from './realSdkTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

const COPILOT_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Copilot SDK Mocked LLM',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: true,
	supportsWorktreeIsolation: true,
	supportsSubagents: true,
	supportsPlanMode: true,
	githubToken: 'not-a-real-token', // The tests will use a mocked LLM, so the token doesn't need to be valid.
};

suite('Protocol WebSocket — Real Copilot SDK, Mocked LLM (Copilot-specific)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		server = await startRealServer({ mockLlm: true });
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(120_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();

		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('returns a hello response via mock LLM', async function () {
		this.timeout(180_000);

		const probeToken = 'MOCK_REQUEST_PROBE_12345';
		const workspaceDir = await mkdtemp(`${tmpdir()}/test-mock-hello`);
		tempDirs.push(workspaceDir);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-mock-hello', createdSessions, URI.file(workspaceDir));
		dispatchTurn(client, sessionUri, 'turn-mock-hello', `Reply with exactly: ${probeToken}`, 1);
		try {
			await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		} catch (err) {
			console.error(`Failed to receive chat/turnComplete notification within timeout: ${err}, receivedNotifications: ${JSON.stringify(client.receivedNotifications())}, logMessages: ${server.mockLlm?.logMessages.join('\n') ?? 'no mockllm server'}`);
			throw new Error(`Failed to receive chat/turnComplete notification within timeout: ${err}, receivedNotifications: ${JSON.stringify(client.receivedNotifications())}, logMessages: ${server.mockLlm?.logMessages.join('\n') ?? 'no mockllm server'}`);
		}

		assert.ok((server.mockLlm?.requestCount() ?? 0) >= 1, 'expected at least one request to the mock LLM');

		const state = await fetchSessionWithChat(client, sessionUri);

		const turn = state.turns.find(t => t.id === 'turn-mock-hello');
		const markdownText = turn?.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('\n') ?? ``;
		assert.ok(markdownText.trim().length > 0, `expected non-empty assistant markdown; got: ${JSON.stringify(markdownText)}`);
		assert.match(markdownText, new RegExp(`\\b${probeToken}\\b`, 'i'), `expected probe token in assistant markdown; got: ${JSON.stringify(markdownText)}`);
	});

	test('detects workspace agents, instructions, skills, and hooks via session/customizationsChanged after hello (mock LLM)', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-test-mock-`);
		tempDirs.push(workspaceDir);
		const githubDir = join(workspaceDir, '.github');
		const agentsDir = join(githubDir, 'agents');
		const instructionsDir = join(githubDir, 'instructions');
		const skillsDir = join(githubDir, 'skills', 'hello-skill');
		const hooksDir = join(githubDir, 'hooks');

		await Promise.all([
			mkdir(agentsDir, { recursive: true }),
			mkdir(instructionsDir, { recursive: true }),
			mkdir(skillsDir, { recursive: true }),
			mkdir(hooksDir, { recursive: true }),
		]);
		await Promise.all([
			writeFile(join(agentsDir, 'hello.agent.md'), [
				'---',
				'name: Hello Agent',
				'description: Handles hello requests',
				'---',
				'You are a test agent.',
			].join('\n')),
			writeFile(join(instructionsDir, 'policy.instructions.md'), [
				'---',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Prefer short answers.',
			].join('\n')),
			writeFile(join(skillsDir, 'SKILL.md'), [
				'---',
				'name: Hello Skill',
				'description: Says hello',
				'---',
				'Return a greeting.',
			].join('\n')),
			writeFile(join(hooksDir, 'pre-tool.json'), JSON.stringify({ PreToolUse: [] }, undefined, 2)),
		]);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-customizations-mock', createdSessions, URI.file(workspaceDir));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'real-sdk-customizations-client-mock',
					tools: [],
				},
			},
		});
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-customizations-mock', 'hello', 2);

		const [customizationsNotif] = await Promise.all([
			client.waitForNotification(n => isActionNotification(n, ActionType.SessionCustomizationsChanged) && getActionEnvelope(n).channel === sessionUri, 120_000),
			client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 120_000),
		]);

		const customizationsAction = getActionEnvelope(customizationsNotif).action as SessionCustomizationsChangedAction;
		const directories = customizationsAction.customizations.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory);
		const expectChildType = (directoryUri: string, expectedType: CustomizationType, expectedName: string): void => {
			const directory = directories.find(customization => customization.uri === directoryUri);
			assert.ok(directory, `expected discovered directory ${directoryUri}`);
			const matchingChildren = directory.children?.filter(child => child.type === expectedType && child.name === expectedName) ?? [];
			assert.ok(
				matchingChildren.length === 1,
				`expected ${directoryUri} to contain a ${expectedType} customization with name ${expectedName}; got: ${JSON.stringify(directory.children)}`,
			);
		};
		expectChildType(URI.file(agentsDir).toString(), CustomizationType.Agent, 'Hello Agent');
		expectChildType(URI.file(instructionsDir).toString(), CustomizationType.Rule, 'policy');
		expectChildType(URI.file(join(githubDir, 'skills')).toString(), CustomizationType.Skill, 'Hello Skill');
		expectChildType(URI.file(hooksDir).toString(), CustomizationType.Hook, 'pre-tool.json');
	});
});
