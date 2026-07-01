/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration tests.
 *
 * The cross-provider portion lives in {@link defineSharedRealSdkTests}; this
 * file layers on Copilot-specific assertions (cost metadata, cd-prefix
 * stripping).
 *
 * Disabled by default. To run them, set `AGENT_HOST_REAL_SDK=1`:
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/copilotRealSdk.integrationTest.ts
 *
 * Authentication: By default the token is obtained from `gh auth token`.
 * You can override it by setting `GITHUB_TOKEN=ghp_xxx`.
 *
 * SAFETY: These tests create real agent sessions backed by the Copilot SDK.
 * Prompts are kept to read-only questions, safe `echo` commands, and isolated
 * temp directories.
 */

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomizationType, MessageAttachmentKind, buildDefaultChatUri, ToolCallConfirmationReason, type DirectoryCustomization, type MessageAttachment } from '../../../common/state/sessionState.js';
import { ActionType, SessionCustomizationsChangedAction, type ChatUsageAction } from '../../../common/state/sessionActions.js';
import {
	createRealSession, defineSharedRealSdkTests, dispatchTurn, driveTurnWithAttachmentsToCompletion,
	type IRealSdkProviderConfig,
} from './realSdkTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

const COPILOT_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Copilot SDK',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_SDK_ENABLED,
	supportsWorktreeIsolation: true,
	supportsSubagents: true,
	supportsPlanMode: true,
};

defineSharedRealSdkTests(COPILOT_CONFIG);

(REAL_SDK_ENABLED ? suite : suite.skip)('Protocol WebSocket — Real Copilot SDK (Copilot-specific)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let userHomeDir: string;

	suiteSetup(async function () {
		this.timeout(60_000);
		userHomeDir = await mkdtemp(`${tmpdir()}/ahp-customizations-home-`);
		server = await startRealServer({ homeDir: userHomeDir });
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(30_000);
		if (!tempDirs.includes(userHomeDir)) {
			tempDirs.push(userHomeDir);
		}
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

	test('usage reports include Copilot cost metadata', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-usage', createdSessions, URI.file(tmpdir()).toString());
		dispatchTurn(client, sessionUri, 'turn-usage', 'Reply with exactly "usage-ok" and do not use tools.', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/usage'), 90_000);
		const usageEnvelope = getActionEnvelope(usageNotif);
		const usageAction = usageEnvelope.action as ChatUsageAction;
		assert.strictEqual(usageEnvelope.channel, buildDefaultChatUri(sessionUri));
		assert.strictEqual(usageAction.turnId, 'turn-usage');
		assert.strictEqual(typeof usageAction.usage.model, 'string');
		assert.ok(usageAction.usage.model);
		assert.ok(usageAction.usage.inputTokens === undefined || usageAction.usage.inputTokens > 0);
		assert.ok(usageAction.usage.outputTokens === undefined || usageAction.usage.outputTokens > 0);

		const cost = usageAction.usage._meta?.cost;
		if (typeof cost !== 'number') {
			assert.fail(`expected usage._meta.cost to be numeric: ${JSON.stringify(usageAction.usage)}`);
		}
		assert.ok(cost > 0, `expected usage._meta.cost to be positive: ${JSON.stringify(usageAction.usage)}`);

		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		const state = await fetchSessionWithChat(client, sessionUri);
		const turn = state.turns.find(t => t.id === 'turn-usage');
		assert.strictEqual(turn?.usage?._meta?.cost, cost);
	});

	test('attaches a Python file and reads its function names', async function () {
		this.timeout(120_000);

		const tempDir = await mkdtemp(`${tmpdir()}/ahp-attachment-test-`);
		tempDirs.push(tempDir);
		const filePath = join(tempDir, 'calculator.py');
		await writeFile(filePath, [
			'def add(a, b):',
			'\treturn a + b',
		].join('\n'));

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-attachment', createdSessions, URI.file(tempDir).toString());
		const prompt = 'Read the attached Python file. What function names are defined in it? Reply with only the function names.';
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Resource,
			uri: URI.file(filePath).toString(),
			label: 'calculator.py',
			displayKind: 'document',
		}];

		const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, 'turn-attachment', prompt, attachments, 1);

		assert.match(result.responseText, /\badd\b/i, `expected the model to identify the attached file function; got: ${JSON.stringify(result.responseText)}`);
	});

	test('attaches a text blob and reads its function names', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-blob-attachment', createdSessions, URI.file(tmpdir()).toString());
		const prompt = 'Read the attached Python text blob. What function names are defined in it? Reply with only the function names.';
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Simple,
			label: 'calculator.py',
			displayKind: 'document',
			modelRepresentation: [
				'def subtract(a, b):',
				'\treturn a - b',
			].join('\n'),
		}];

		const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, 'turn-blob-attachment', prompt, attachments, 1);

		assert.match(result.responseText, /\bsubtract\b/i, `expected the model to identify the attached blob function; got: ${JSON.stringify(result.responseText)}`);
	});

	test('detects workspace agents, instructions, skills, and hooks via session/customizationsChanged after hello', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-test-`);
		tempDirs.push(workspaceDir);
		const githubDir = join(workspaceDir, '.github');
		const agentsDir = join(githubDir, 'agents');
		const instructionsDir = join(githubDir, 'instructions');
		const skillsDir = join(githubDir, 'skills', 'hello-skill');
		const hooksDir = join(githubDir, 'hooks');
		const userAgentsDir = join(userHomeDir, '.copilot', 'agents');
		const userInstructionsDir = join(userHomeDir, '.copilot', 'instructions');
		const userSkillsDir = join(userHomeDir, '.agents', 'skills', 'user-hello-skill');
		const userHooksDir = join(userHomeDir, '.copilot', 'hooks');

		await Promise.all([
			mkdir(agentsDir, { recursive: true }),
			mkdir(instructionsDir, { recursive: true }),
			mkdir(skillsDir, { recursive: true }),
			mkdir(hooksDir, { recursive: true }),
			mkdir(userAgentsDir, { recursive: true }),
			mkdir(userInstructionsDir, { recursive: true }),
			mkdir(userSkillsDir, { recursive: true }),
			mkdir(userHooksDir, { recursive: true }),
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
			writeFile(join(userAgentsDir, 'user-hello.agent.md'), [
				'---',
				'name: User Hello Agent',
				'description: Handles user hello requests',
				'---',
				'You are a user-scope test agent.',
			].join('\n')),
			writeFile(join(userInstructionsDir, 'user-policy.instructions.md'), [
				'---',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Prefer concise language.',
			].join('\n')),
			writeFile(join(userSkillsDir, 'SKILL.md'), [
				'---',
				'name: User Hello Skill',
				'description: Says hello from user home',
				'---',
				'Return a user-level greeting.',
			].join('\n')),
			writeFile(join(userHooksDir, 'user-pre-tool.json'), JSON.stringify({ PreToolUse: [] }, undefined, 2)),
		]);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-customizations', createdSessions, URI.file(workspaceDir).toString());
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'real-sdk-customizations-client',
					tools: [],
				},
			},
		});
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-customizations', 'hello', 2);

		const [customizationsNotif] = await Promise.all([
			client.waitForNotification(n => isActionNotification(n, ActionType.SessionCustomizationsChanged) && getActionEnvelope(n).channel === sessionUri, 120_000),
			client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete') && getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri), 120_000),
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
		expectChildType(URI.file(userAgentsDir).toString(), CustomizationType.Agent, 'User Hello Agent');
		expectChildType(URI.file(userInstructionsDir).toString(), CustomizationType.Rule, 'user-policy');
		expectChildType(URI.file(join(userHomeDir, '.agents', 'skills')).toString(), CustomizationType.Skill, 'User Hello Skill');
		expectChildType(URI.file(userHooksDir).toString(), CustomizationType.Hook, 'user-pre-tool.json');

		const expectedWorkspaceSearchRoots = [
			{ uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), type: CustomizationType.Agent },
			{ uri: URI.file(join(workspaceDir, '.agents', 'agents')).toString(), type: CustomizationType.Agent },
			{ uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), type: CustomizationType.Agent },
			{ uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), type: CustomizationType.Skill },
			{ uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), type: CustomizationType.Skill },
			{ uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), type: CustomizationType.Skill },
			{ uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), type: CustomizationType.Rule },
			{ uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), type: CustomizationType.Hook },
		] as const;
		for (const expectedRoot of expectedWorkspaceSearchRoots) {
			const directory = directories.find(customization => customization.uri === expectedRoot.uri);
			assert.ok(directory, `expected directory customization for ${expectedRoot.uri}`);
			assert.strictEqual(directory.contents, expectedRoot.type, `expected ${expectedRoot.uri} to have contents type ${expectedRoot.type}`);
		}

		const expectedMissingWorkspaceSearchRoots = [
			URI.file(join(workspaceDir, '.agents', 'agents')).toString(),
			URI.file(join(workspaceDir, '.claude', 'agents')).toString(),
			URI.file(join(workspaceDir, '.agents', 'skills')).toString(),
			URI.file(join(workspaceDir, '.claude', 'skills')).toString(),
		] as const;
		for (const missingRootUri of expectedMissingWorkspaceSearchRoots) {
			const directory = directories.find(customization => customization.uri === missingRootUri);
			assert.ok(directory, `expected missing search root directory customization for ${missingRootUri}`);
			assert.deepStrictEqual(directory.children, [], `expected ${missingRootUri} to have no children`);
		}

		const expectedUserSearchRoots = [
			{ uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), type: CustomizationType.Agent },
			{ uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), type: CustomizationType.Skill },
			{ uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), type: CustomizationType.Rule },
			{ uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), type: CustomizationType.Hook },
		] as const;
		for (const expectedRoot of expectedUserSearchRoots) {
			const directory = directories.find(customization => customization.uri === expectedRoot.uri);
			assert.ok(directory, `expected user-home directory customization for ${expectedRoot.uri}`);
			assert.strictEqual(directory.contents, expectedRoot.type, `expected ${expectedRoot.uri} to have contents type ${expectedRoot.type}`);
		}
	});

	test('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const tempDir = await mkdtemp(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(tempDir);
		const expectedWorkingDirPath = tempDir;
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-cd-strip', createdSessions, URI.file(tempDir).toString());

		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-cd-strip',
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolInput?: string };
			return typeof action.toolInput === 'string' && action.toolInput.includes('echo strip-me-please');
		}, 90_000);

		const toolReadyEnvelope = getActionEnvelope(toolReadyNotif);
		const toolReadyAction = toolReadyEnvelope.action as { toolCallId: string; toolInput?: string; confirmed?: string };
		const toolInput = toolReadyAction.toolInput!;

		const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const redundantWorkingDirCdPrefix = new RegExp(
			`^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`,
		);
		assert.ok(
			!redundantWorkingDirCdPrefix.test(toolInput),
			`toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`,
		);
		assert.ok(
			toolInput.includes('echo strip-me-please'),
			`toolInput should contain the rewritten command body; got: ${JSON.stringify(toolInput)}`,
		);

		if (!toolReadyAction.confirmed) {
			client.dispatch({
				channel: toolReadyEnvelope.channel,
				clientSeq: 2,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: 'turn-cd-strip',
					toolCallId: toolReadyAction.toolCallId, approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
				},
			});
		}

		const seenSeqs = new Set<number>();
		seenSeqs.add(toolReadyEnvelope.serverSeq);
		let teardownSeq = 3;
		while (true) {
			const next = await client.waitForNotification(
				n => {
					if (isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error')) {
						return true;
					}
					if (!isActionNotification(n, 'chat/toolCallReady')) {
						return false;
					}
					return !seenSeqs.has(getActionEnvelope(n).serverSeq);
				},
				90_000,
			);
			if (isActionNotification(next, 'chat/turnComplete') || isActionNotification(next, 'chat/error')) {
				break;
			}
			const envelope = getActionEnvelope(next);
			seenSeqs.add(envelope.serverSeq);
			const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
			if (!action.confirmed) {
				client.dispatch({
					channel: envelope.channel,
					clientSeq: ++teardownSeq,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}
		}
	});

});
