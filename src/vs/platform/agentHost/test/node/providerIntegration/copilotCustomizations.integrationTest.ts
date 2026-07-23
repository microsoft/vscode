/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent host end-to-end tests (Copilot customizations, mocked LLM).
 *
 * agent host log file: ~/.vscode-insiders/tmp/tmp_vscode_1/ahp-customizations-home-mock-ZBucPX/Library/Application Support/Code - OSS Dev/logs/20260701T192836/agenthost-server.log
 */

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentHostConfigKey, type SessionCustomizationDiscoveryMode } from '../../../common/agentHostCustomizationConfig.js';
import { ActionType, SessionCustomizationsChangedAction } from '../../../common/state/sessionActions.js';
import { customizationId, CustomizationType, ISessionWithDefaultChat, ROOT_STATE_URI, type ClientPluginCustomization, type DirectoryCustomization, type PluginCustomization, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { type AhpNotification } from '../../../common/state/sessionProtocol.js';
import { createProviderSession, dispatchTurn, type IAgentHostProviderTestConfig } from '../providerIntegrationTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

/**
 * Whether `notification` is a *settled* `session/customizationsChanged` for
 * `sessionUri`.
 *
 * Filesystem customization discovery is asynchronous: a client
 * `SessionActiveClientSet`/`sync` can publish a snapshot before the initial
 * disk scan has settled, producing a transient `customizations: []`
 * notification (see `SessionPluginController.getCustomizationsSettled`).
 * Because `clearReceived()` clears the local buffer but cannot retract an
 * already-sent socket message, such a pre-discovery snapshot may even be
 * delivered *after* a `clearReceived()`. These empty snapshots are not
 * meaningful state changes, so the tests match and count only non-empty
 * (settled) notifications — every session discovers at least the standard
 * customization directories, so a settled snapshot always has a non-empty list.
 */
function isSettledCustomizationsNotification(notification: AhpNotification, sessionUri: string): boolean {
	if (!isActionNotification(notification, ActionType.SessionCustomizationsChanged) || getActionEnvelope(notification).channel !== sessionUri) {
		return false;
	}
	return (getActionEnvelope(notification).action as SessionCustomizationsChangedAction).customizations.length > 0;
}

const COPILOT_CONFIG: IAgentHostProviderTestConfig = {
	provider: 'copilotcli',
	scheme: 'copilotcli',
	githubToken: 'not-a-real-token', // The tests will use a mocked LLM, so the token doesn't need to be valid.
};

const SETUP_TIMEOUT_MS = 45_000;
const TEST_TIMEOUT_MS = 90_000;
const NOTIFICATION_TIMEOUT_MS = 10_000;
const WATCH_ASSERT_TIMEOUT_MS = 30_000;
const WATCH_ASSERT_POLL_INTERVAL_MS = 100;

async function waitForAssert(
	assertion: () => Promise<void> | void,
	timeoutMs = WATCH_ASSERT_TIMEOUT_MS,
	pollIntervalMs = WATCH_ASSERT_POLL_INTERVAL_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await assertion();
			return;
		} catch (error) {
			lastError = error;
		}
		await new Promise<void>(resolve => setTimeout(resolve, pollIntervalMs));
	}
	throw new Error(
		`Timed out waiting for expected customizations state (${timeoutMs}ms). Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
	);
}

const TEST_WATCH = true;

suite('Agent Host Provider Integration — Copilot Customizations', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let userHomeDir: string;
	let testTempDirStartIndex = 0;

	suiteSetup(async function () {
		this.timeout(SETUP_TIMEOUT_MS);
		userHomeDir = await mkdtemp(`${tmpdir()}/ahp-customizations-home-mock-`);
		server = await startRealServer({ mockLlm: true, homeDir: userHomeDir });
		tempDirs.push(userHomeDir);
	});

	suiteTeardown(async function () {
		server?.process.kill();

		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	setup(async function () {
		this.timeout(SETUP_TIMEOUT_MS);
		testTempDirStartIndex = tempDirs.length;
		client = new TestProtocolClient(server.port);
		await client.connect();
		await cleanHomeFolder();
	});

	teardown(async function () {
		const disposeErrors: string[] = [];
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 15_000);
			} catch (error) {
				disposeErrors.push(`Failed to dispose session ${session}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		createdSessions.length = 0;
		client.close();
		if (tempDirs.length > testTempDirStartIndex) {
			const testTempDirs = tempDirs.splice(testTempDirStartIndex);
			await Promise.all(testTempDirs.map(dir => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })));
		}
		assert.deepStrictEqual(disposeErrors, []);
	});


	test('empty workspace [scan]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runEmptyWorkspaceCustomizationsTest('scan');
	});
	test('empty workspace [discover]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runEmptyWorkspaceCustomizationsTest('discover');
	});

	test('agent-instructions [scan]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runAgentInstructionsDiscoveryTest('scan');
	});

	test('agent-instructions [discover]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runAgentInstructionsDiscoveryTest('discover');
	});

	test('agents, instructions, skills, and hooks [scan]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runWorkspaceCustomizationsTest('scan');
	});

	test('agents, instructions, skills, and hooks [discover]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runWorkspaceCustomizationsTest('discover');
	});

	test('workspace with plugin [scan]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runWorkspaceAndPluginCustomizationsTest('scan');
	});

	test('workspace with plugin [discover]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runWorkspaceAndPluginCustomizationsTest('discover');
	});

	test('workspace and synced-bundle plugin [scan]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runSyncedBundlePluginCustomizationsTest('scan');
	});

	test('workspace and synced-bundle plugin with agents, instructions, and skills [discover]', async function () {
		this.timeout(TEST_TIMEOUT_MS);
		await runSyncedBundlePluginCustomizationsTest('discover');
	});
	if (TEST_WATCH) {

		test('watch skill file changes [scan]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleSkillWatchTest('scan');
		});

		// skipped for https://github.com/github/copilot-agent-runtime/issues/13285
		test.skip('watch skill file changes [discover]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleSkillWatchTest('discover');
		});

		test('watch agent file changes [scan]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleAgentWatchTest('scan');
		});

		test('watch agent file changes [discover]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleAgentWatchTest('discover');
		});

		test('watch instruction file changes [scan]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleInstructionWatchTest('scan');
		});

		// skipped for https://github.com/github/copilot-agent-runtime/issues/13000
		test.skip('watch instruction file changes [discover]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleInstructionWatchTest('discover');
		});

		test('watch agent instruction file changes [scan]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleAgentInstructionWatchTest('scan');
		});

		test('watch agent instruction file changes [discover]', async function () {
			this.timeout(TEST_TIMEOUT_MS);
			await runSimpleAgentInstructionWatchTest('discover');
		});
	}

	async function cleanHomeFolder() {
		const foldersToClean = ['.copilot/agents', '.copilot/instructions', '.copilot/skills', '.copilot/hooks', '.agents', '.claude'];
		const filesToClean = ['.copilot/copilot-instructions.md'];
		await Promise.all([
			...foldersToClean.map(folder => rm(join(userHomeDir, folder), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })),
			...filesToClean.map(file => rm(join(userHomeDir, file), { force: true, maxRetries: 5, retryDelay: 200 })),
		]);
	}

	async function setupSession(sessionUri: string, clientId: string, discoveryMode: SessionCustomizationDiscoveryMode, turnId = 'turn-customizations-empty-mock', configuredCustomizations?: readonly { uri: string; displayName: string; description?: string }[]): Promise<ISessionWithDefaultChat> {
		client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 0,
			action: {
				type: ActionType.RootConfigChanged,
				config: {
					[AgentHostConfigKey.SessionCustomizationDiscoveryMode]: discoveryMode,
				},
			},
		});
		const activeClientCustomizations = configuredCustomizations?.map((customization): ClientPluginCustomization => ({
			type: CustomizationType.Plugin,
			id: customizationId(customization.uri),
			uri: customization.uri as ProtocolURI,
			name: customization.displayName,
			nonce: '1',
			enabled: true,
		}));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: clientId,
					tools: [],
					customizations: activeClientCustomizations,
				},
			},
		});
		await client.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet) && getActionEnvelope(n).channel === sessionUri, NOTIFICATION_TIMEOUT_MS);
		client.clearReceived();
		dispatchTurn(client, sessionUri, turnId, 'hello', 2);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), NOTIFICATION_TIMEOUT_MS);
		await client.waitForNotification(
			n => isActionNotification(n, ActionType.SessionReady) && getActionEnvelope(n).channel === sessionUri,
			NOTIFICATION_TIMEOUT_MS,
		);

		return await fetchSessionWithChat(client, sessionUri);
	}

	const builtInCustomizations = (customization: { type: CustomizationType; contents?: CustomizationType; uri: string }): boolean => {
		return !(customization.type === CustomizationType.Directory && customization.contents === CustomizationType.Skill && customization.uri.endsWith('/builtin/customize-cloud-agent'));
	};

	async function runEmptyWorkspaceCustomizationsTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-empty-mock-`);
		tempDirs.push(workspaceDir);

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-customizations-empty-mock', createdSessions, URI.file(workspaceDir));
		const session = await setupSession(sessionUri, 'real-sdk-customizations-empty-client-mock', discoveryMode);
		assert.ok(session.customizations);

		const mappedCustomizations = session.customizations
			.map(customization => ({
				type: customization.type,
				contents: customization.type === CustomizationType.Directory ? customization.contents : undefined,
				uri: customization.uri,
				children: customization.type === CustomizationType.Directory ? (customization.children ?? []).map(child => child.uri) : undefined,
			}))
			.filter(builtInCustomizations)
			.sort((a, b) => a.uri.localeCompare(b.uri));

		const expectedCustomizations = [
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
		].sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);

	}

	async function runWorkspaceCustomizationsTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-test-mock-`);
		tempDirs.push(workspaceDir);
		const githubDir = join(workspaceDir, '.github');
		const agentsDir = join(githubDir, 'agents');
		const instructionsDir = join(githubDir, 'instructions');
		const skillsDir = join(githubDir, 'skills', 'hello-skill');
		const hooksDir = join(githubDir, 'hooks');
		const userAgentsDir = join(userHomeDir, '.copilot', 'agents');
		const userInstructionsDir = join(userHomeDir, '.copilot', 'instructions');
		const userCopilotSkillsDir = join(userHomeDir, '.copilot', 'skills', 'copilot-hello-skill');
		const userSkillsDir = join(userHomeDir, '.agents', 'skills', 'user-hello-skill');
		const userHooksDir = join(userHomeDir, '.copilot', 'hooks');
		const userAgentFile = join(userAgentsDir, 'user-hello.agent.md');
		const userInstructionFile = join(userInstructionsDir, 'user-policy.instructions.md');
		const userCopilotSkillFile = join(userCopilotSkillsDir, 'SKILL.md');
		const userSkillFile = join(userSkillsDir, 'SKILL.md');
		const userHookFile = join(userHooksDir, 'user-pre-tool.json');

		await Promise.all([
			mkdir(agentsDir, { recursive: true }),
			mkdir(instructionsDir, { recursive: true }),
			mkdir(skillsDir, { recursive: true }),
			mkdir(hooksDir, { recursive: true }),
			mkdir(userAgentsDir, { recursive: true }),
			mkdir(userInstructionsDir, { recursive: true }),
			mkdir(userCopilotSkillsDir, { recursive: true }),
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
				'name: hello-skill',
				'description: Says hello',
				'---',
				'Return a greeting.',
			].join('\n')),
			writeFile(join(hooksDir, 'pre-tool.json'), JSON.stringify({ PreToolUse: [] }, undefined, 2)),
			writeFile(userAgentFile, [
				'---',
				'name: User Hello Agent',
				'description: Handles user hello requests',
				'---',
				'You are a user-scope test agent.',
			].join('\n')),
			writeFile(userInstructionFile, [
				'---',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Prefer concise language.',
			].join('\n')),
			writeFile(userCopilotSkillFile, [
				'---',
				'name: user-copilot-skill',
				'description: Says hello from Copilot home',
				'---',
				'Return a Copilot home greeting.',
			].join('\n')),
			writeFile(userSkillFile, [
				'---',
				'name: user-hello-skill',
				'description: Says hello from user home',
				'---',
				'Return a user-level greeting.',
			].join('\n')),
			writeFile(userHookFile, JSON.stringify({ PreToolUse: [] }, undefined, 2)),
		]);
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-customizations-mock', createdSessions, URI.file(workspaceDir));
		const session = await setupSession(sessionUri, 'real-sdk-customizations-client-mock', discoveryMode, 'turn-customizations-mock');
		assert.ok(session.customizations);

		const mappedCustomizations = session.customizations.map(customization => ({
			type: customization.type,
			contents: customization.type === CustomizationType.Directory ? customization.contents : undefined,
			uri: customization.uri,
			children: customization.type === CustomizationType.Directory ? (customization.children ?? []).map(child => child.uri) : undefined,
		})).filter(builtInCustomizations).sort((a, b) => a.uri.localeCompare(b.uri));
		const expectedCustomizations = [
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [URI.file(userSkillFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [URI.file(userAgentFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [URI.file(userHookFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [URI.file(userCopilotSkillFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [URI.file(join(agentsDir, 'hello.agent.md')).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [URI.file(join(hooksDir, 'pre-tool.json')).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [URI.file(join(instructionsDir, 'policy.instructions.md')).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [URI.file(join(skillsDir, 'SKILL.md')).toString()] },
			{
				type: CustomizationType.Directory,
				contents: CustomizationType.Rule,
				uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(),
				children: discoveryMode === 'scan' ? [URI.file(userInstructionFile).toString()] : [],
			},
		].sort((a, b) => a.uri.localeCompare(b.uri));
		assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
	}

	async function runWorkspaceAndPluginCustomizationsTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-workspace-plugin-mock-`);
		tempDirs.push(workspaceDir);

		const workspaceAgentsDir = join(workspaceDir, '.github', 'agents');
		const workspaceAgentFile = join(workspaceAgentsDir, 'workspace.agent.md');
		const pluginDir = join(workspaceDir, '.github', 'copilot', 'plugins', 'workspace-plugin');
		const pluginManifestFile = join(pluginDir, '.plugin', 'plugin.json');
		const pluginAgentFile = join(pluginDir, 'agents', 'plugin.agent.md');
		const pluginSkillFile = join(pluginDir, 'skills', 'plugin-skill', 'SKILL.md');
		const pluginInstructionFile = join(pluginDir, 'rules', 'plugin.instructions.md');
		const pluginUri = URI.file(pluginDir).toString();
		const configuredCustomizations = [{ uri: pluginUri, displayName: 'Workspace Plugin' }];

		await Promise.all([
			mkdir(workspaceAgentsDir, { recursive: true }),
			mkdir(join(pluginDir, '.plugin'), { recursive: true }),
			mkdir(join(pluginDir, 'agents'), { recursive: true }),
			mkdir(join(pluginDir, 'skills', 'plugin-skill'), { recursive: true }),
			mkdir(join(pluginDir, 'rules'), { recursive: true }),
		]);
		await Promise.all([
			writeFile(workspaceAgentFile, [
				'---',
				'name: Workspace Agent',
				'description: Workspace-level test agent',
				'---',
				'You are a workspace test agent.',
			].join('\n')),
			writeFile(pluginManifestFile, JSON.stringify({ name: 'Workspace Plugin' }, undefined, 2)),
			writeFile(pluginAgentFile, [
				'---',
				'name: Plugin Agent',
				'description: Plugin-level test agent',
				'---',
				'You are a plugin test agent.',
			].join('\n')),
			writeFile(pluginSkillFile, [
				'---',
				'name: plugin-skill',
				'description: Plugin-level test skill',
				'---',
				'Return a plugin greeting.',
			].join('\n')),
			writeFile(pluginInstructionFile, [
				'---',
				'name: Plugin Instruction',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Prefer plugin defaults.',
			].join('\n')),
		]);

		const clientId = 'real-sdk-customizations-workspace-plugin-client-mock';
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, clientId, discoveryMode, 'turn-customizations-workspace-plugin-mock', configuredCustomizations);
		await waitForPluginCustomizationUpdate(sessionUri, pluginUri);
		const session = await fetchSessionWithChat(client, sessionUri);
		assert.ok(session.customizations);

		const mappedCustomizations = session.customizations
			.map(customization => ({
				type: customization.type,
				contents: customization.type === CustomizationType.Directory ? customization.contents : undefined,
				uri: customization.uri,
				children: customization.type === CustomizationType.Directory
					? (customization.children ?? []).map(child => child.uri).sort((a, b) => a.localeCompare(b))
					: customization.type === CustomizationType.Plugin
						? (customization.children ?? []).map(child => ({ type: child.type, name: child.name })).sort((a, b) => a.name.localeCompare(b.name))
						: undefined,
			}))
			.filter(builtInCustomizations)
			.sort((a, b) => a.uri.localeCompare(b.uri));

		const expectedCustomizations = [
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [URI.file(workspaceAgentFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			{
				type: CustomizationType.Plugin,
				contents: undefined,
				uri: pluginUri,
				children: [
					{ type: CustomizationType.Agent, name: 'Plugin Agent' },
					{ type: CustomizationType.Rule, name: 'plugin' },
					{ type: CustomizationType.Skill, name: 'plugin-skill' },
				].sort((a, b) => a.name.localeCompare(b.name)),
			},
		].sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
	}

	async function runSyncedBundlePluginCustomizationsTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-workspace-synced-plugin-mock-`);
		tempDirs.push(workspaceDir);
		const syncedBundleDir = await mkdtemp(`${tmpdir()}/ahp-synced-customizations-plugin-mock-`);
		tempDirs.push(syncedBundleDir);

		const workspaceAgentsDir = join(workspaceDir, '.github', 'agents');
		const workspaceAgentFile = join(workspaceAgentsDir, 'workspace.agent.md');
		const pluginDir = join(syncedBundleDir, 'copilot-synced-customizations');
		const pluginManifestFile = join(pluginDir, '.plugin', 'plugin.json');
		const pluginAgentFile = join(pluginDir, 'agents', 'bundled-user.agent.md');
		const pluginSkillFile = join(pluginDir, 'skills', 'bundled-extension-skill', 'SKILL.md');
		const pluginUserInstructionFile = join(pluginDir, 'rules', 'bundled-user.instructions.md');
		const pluginExtensionInstructionFile = join(pluginDir, 'rules', 'bundled-extension.instructions.md');
		const pluginUri = URI.file(pluginDir).toString();
		const configuredCustomizations = [{ uri: pluginUri, displayName: 'VS Code Synced Data' }];

		await Promise.all([
			mkdir(workspaceAgentsDir, { recursive: true }),
			mkdir(join(pluginDir, '.plugin'), { recursive: true }),
			mkdir(join(pluginDir, 'agents'), { recursive: true }),
			mkdir(join(pluginDir, 'skills', 'bundled-extension-skill'), { recursive: true }),
			mkdir(join(pluginDir, 'rules'), { recursive: true }),
		]);
		await Promise.all([
			writeFile(workspaceAgentFile, [
				'---',
				'name: Workspace Agent',
				'description: Workspace-level test agent',
				'---',
				'You are a workspace test agent.',
			].join('\n')),
			writeFile(pluginManifestFile, JSON.stringify({ name: 'VS Code Synced Data', description: 'Customization data synced from VS Code' }, undefined, 2)),
			writeFile(pluginAgentFile, [
				'---',
				'name: Bundled User Agent',
				'description: Bundled user-level agent',
				'---',
				'You are a bundled user agent.',
			].join('\n')),
			writeFile(pluginSkillFile, [
				'---',
				'name: bundled-extension-skill',
				'description: Bundled extension-level skill',
				'---',
				'Return a bundled extension greeting.',
			].join('\n')),
			writeFile(pluginUserInstructionFile, 'Prefer bundled user defaults.'),
			writeFile(pluginExtensionInstructionFile, 'Prefer bundled extension defaults.'),
		]);

		const clientId = 'real-sdk-customizations-workspace-synced-plugin-client-mock';
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, clientId, discoveryMode, 'turn-customizations-workspace-synced-plugin-mock', configuredCustomizations);
		await waitForPluginCustomizationUpdate(sessionUri, pluginUri);
		const session = await fetchSessionWithChat(client, sessionUri);
		assert.ok(session.customizations);

		const mappedCustomizations = session.customizations
			.map(customization => ({
				type: customization.type,
				contents: customization.type === CustomizationType.Directory ? customization.contents : undefined,
				uri: customization.uri,
				children: customization.type === CustomizationType.Directory
					? (customization.children ?? []).map(child => child.uri).sort((a, b) => a.localeCompare(b))
					: customization.type === CustomizationType.Plugin
						? (customization.children ?? []).map(child => ({ type: child.type, name: child.name })).sort((a, b) => a.name.localeCompare(b.name))
						: undefined,
			}))
			.filter(builtInCustomizations)
			.sort((a, b) => a.uri.localeCompare(b.uri));

		const expectedCustomizations = [
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [URI.file(workspaceAgentFile).toString()] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			{
				type: CustomizationType.Plugin,
				contents: undefined,
				uri: pluginUri,
				children: [
					{ type: CustomizationType.Agent, name: 'Bundled User Agent' },
					{ type: CustomizationType.Rule, name: 'bundled-extension' },
					{ type: CustomizationType.Rule, name: 'bundled-user' },
					{ type: CustomizationType.Skill, name: 'bundled-extension-skill' },
				].sort((a, b) => a.name.localeCompare(b.name)),
			},
		].sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
	}

	async function waitForPluginCustomizationUpdate(sessionUri: string, pluginUri: string): Promise<void> {
		const notificationHasPluginUpdate = (notification: AhpNotification): boolean => {
			if (isSettledCustomizationsNotification(notification, sessionUri)) {
				const action = getActionEnvelope(notification).action as SessionCustomizationsChangedAction;
				if (action.customizations.some(customization =>
					customization.type === CustomizationType.Plugin &&
					customization.uri === pluginUri
				)) {
					return true;
				}
			}
			if (isActionNotification(notification, ActionType.SessionCustomizationUpdated) && getActionEnvelope(notification).channel === sessionUri) {
				const action = getActionEnvelope(notification).action as { customization: PluginCustomization };
				return action.customization.type === CustomizationType.Plugin
					&& action.customization.uri === pluginUri;
			}
			return false;
		};
		const existingMatch = client.receivedNotifications().find(notification => notificationHasPluginUpdate(notification));
		if (existingMatch) {
			return;
		}

		await client.waitForNotification(notification => notificationHasPluginUpdate(notification), NOTIFICATION_TIMEOUT_MS);
	}

	async function runAgentInstructionsDiscoveryTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-agent-instructions-mock-`);
		tempDirs.push(workspaceDir);
		const workspaceGithubDir = join(workspaceDir, '.github');
		const workspaceCopilotInstructionsFile = join(workspaceGithubDir, 'copilot-instructions.md');
		const workspaceAgentsInstructionsFile = join(workspaceDir, 'AGENTS.md');
		const workspaceClaudeInstructionsFile = join(workspaceDir, 'CLAUDE.md');
		const userCopilotDir = join(userHomeDir, '.copilot');
		const userCopilotInstructionsFile = join(userCopilotDir, 'copilot-instructions.md');

		await Promise.all([
			mkdir(workspaceGithubDir, { recursive: true }),
			mkdir(userCopilotDir, { recursive: true }),
		]);
		await Promise.all([
			writeFile(workspaceCopilotInstructionsFile, 'Use workspace copilot instructions.'),
			writeFile(workspaceAgentsInstructionsFile, 'Use workspace AGENTS instructions.'),
			writeFile(workspaceClaudeInstructionsFile, 'Use workspace CLAUDE instructions.'),
			writeFile(userCopilotInstructionsFile, 'Use user copilot instructions.'),
		]);

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-agent-instructions-mock', createdSessions, URI.file(workspaceDir));
		const session = await setupSession(sessionUri, 'real-sdk-agent-instructions-client-mock', discoveryMode, 'turn-agent-instructions-mock');
		assert.ok(session.customizations);

		const expectedCustomizations = [
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			{
				type: CustomizationType.Directory,
				contents: CustomizationType.Rule,
				uri: URI.file(userHomeDir).toString(),
				children: [URI.file(userCopilotInstructionsFile).toString()],
			},
			{
				type: CustomizationType.Directory,
				contents: CustomizationType.Rule,
				uri: URI.file(workspaceDir).toString(),
				children: [
					URI.file(workspaceAgentsInstructionsFile).toString(),
					URI.file(workspaceClaudeInstructionsFile).toString(),
					URI.file(workspaceCopilotInstructionsFile).toString(),
				].sort((a, b) => a.localeCompare(b)),
			},
		].sort((a, b) => a.uri.localeCompare(b.uri));

		const mappedCustomizations = session.customizations
			.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
			.map(customization => ({
				type: customization.type,
				contents: customization.contents,
				uri: customization.uri,
				children: (customization.children ?? []).map(child => child.uri).sort((a, b) => a.localeCompare(b)),
			}))
			.filter(builtInCustomizations)
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);

	}



	async function runSimpleInstructionWatchTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-watch-simple-${discoveryMode}-`);
		tempDirs.push(workspaceDir);

		const instructionsDir = join(workspaceDir, '.github', 'instructions');
		const instructionFile = join(instructionsDir, 'policy.instructions.md');
		const addedInstructionFile = join(instructionsDir, 'added.instructions.md');
		const userInstructionsDir = join(userHomeDir, '.copilot', 'instructions');
		const userInstructionFile = join(userInstructionsDir, 'user.instructions.md');
		await mkdir(instructionsDir, { recursive: true });
		await mkdir(userInstructionsDir, { recursive: true });
		await writeFile(instructionFile, [
			'---',
			'name: Initial Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Initial instruction body.',
		].join('\n'));
		await writeFile(userInstructionFile, [
			'---',
			'name: User Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'User instruction body.',
		].join('\n'));

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, `real-sdk-customizations-watch-simple-${discoveryMode}`, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, `real-sdk-customizations-watch-simple-client-${discoveryMode}`, discoveryMode, `turn-customizations-watch-simple-${discoveryMode}`);
		const instructionsUri = URI.file(instructionsDir).toString();

		const assertAllCustomizations = async (instructionChildren: ReadonlyArray<{ uri: string; name: string }>): Promise<void> => {
			const session = await fetchSessionWithChat(client, sessionUri);
			assert.ok(session.customizations);
			const mappedCustomizations = session.customizations
				.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
				.map(customization => ({
					type: customization.type,
					contents: customization.contents,
					uri: customization.uri,
					children: (customization.children ?? []).map(child => ({ type: child.type, uri: child.uri, name: child.name })).sort((a, b) => a.uri.localeCompare(b.uri)),
				}))
				.filter(builtInCustomizations)
				.sort((a, b) => a.uri.localeCompare(b.uri));

			const expectedCustomizations = [
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
				{
					type: CustomizationType.Directory,
					contents: CustomizationType.Rule,
					uri: instructionsUri,
					children: instructionChildren
						.map(child => ({ type: CustomizationType.Rule, uri: child.uri, name: child.name }))
						.sort((a, b) => a.uri.localeCompare(b.uri)),
				},
				{
					type: CustomizationType.Directory,
					contents: CustomizationType.Rule,
					uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(),
					children: [{ type: CustomizationType.Rule, uri: URI.file(userInstructionFile).toString(), name: 'User Policy' }],
				},
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			].sort((a, b) => a.uri.localeCompare(b.uri));

			assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
		};

		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(instructionFile).toString(), name: 'Initial Policy' }]));

		client.clearReceived();
		await writeFile(instructionFile, [
			'---',
			'name: Updated Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Updated instruction body.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(instructionFile).toString(), name: 'Updated Policy' }]));

		client.clearReceived();
		await writeFile(addedInstructionFile, [
			'---',
			'name: Added Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Added instruction body.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([
			{ uri: URI.file(instructionFile).toString(), name: 'Updated Policy' },
			{ uri: URI.file(addedInstructionFile).toString(), name: 'Added Policy' },
		]));

		client.clearReceived();
		await rm(instructionFile, { force: true });
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(addedInstructionFile).toString(), name: 'Added Policy' }]));
	}

	async function runSimpleAgentInstructionWatchTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-watch-simple-agent-instructions-${discoveryMode}-`);
		tempDirs.push(workspaceDir);

		const workspaceAgentInstructionsFile = join(workspaceDir, 'AGENTS.md');
		const workspaceClaudeInstructionsFile = join(workspaceDir, 'CLAUDE.md');
		const userCopilotDir = join(userHomeDir, '.copilot');
		const userCopilotInstructionsFile = join(userCopilotDir, 'copilot-instructions.md');
		await mkdir(userCopilotDir, { recursive: true });
		await writeFile(workspaceAgentInstructionsFile, 'Use workspace AGENTS instructions.');
		await writeFile(userCopilotInstructionsFile, 'Use user copilot instructions.');

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, `real-sdk-customizations-watch-simple-agent-instructions-${discoveryMode}`, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, `real-sdk-customizations-watch-simple-agent-instructions-client-${discoveryMode}`, discoveryMode, `turn-customizations-watch-simple-agent-instructions-${discoveryMode}`);

		const assertAllCustomizations = async (workspaceInstructionUris: ReadonlyArray<string>, userInstructionUris: ReadonlyArray<string>): Promise<void> => {
			const session = await fetchSessionWithChat(client, sessionUri);
			assert.ok(session.customizations);
			const mappedCustomizations = session.customizations
				.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
				.map(customization => ({
					type: customization.type,
					contents: customization.contents,
					uri: customization.uri,
					children: (customization.children ?? []).map(child => child.uri).sort((a, b) => a.localeCompare(b)),
				}))
				.filter(builtInCustomizations)
				.sort((a, b) => a.uri.localeCompare(b.uri));

			const expectedCustomizations: Array<{ type: CustomizationType; contents: CustomizationType; uri: string; children: string[] }> = [
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			].sort((a, b) => a.uri.localeCompare(b.uri));
			if (userInstructionUris.length > 0) {
				expectedCustomizations.push({
					type: CustomizationType.Directory,
					contents: CustomizationType.Rule,
					uri: URI.file(userHomeDir).toString(),
					children: [...userInstructionUris].sort((a, b) => a.localeCompare(b)),
				});
			}
			if (workspaceInstructionUris.length > 0) {
				expectedCustomizations.push({
					type: CustomizationType.Directory,
					contents: CustomizationType.Rule,
					uri: URI.file(workspaceDir).toString(),
					children: [...workspaceInstructionUris].sort((a, b) => a.localeCompare(b)),
				});
			}
			expectedCustomizations.sort((a, b) => a.uri.localeCompare(b.uri));

			assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
		};

		await waitForAssert(() => assertAllCustomizations(
			[URI.file(workspaceAgentInstructionsFile).toString()],
			[URI.file(userCopilotInstructionsFile).toString()],
		));

		client.clearReceived();
		await writeFile(workspaceAgentInstructionsFile, 'Use updated workspace AGENTS instructions.');
		await waitForAssert(() => assertAllCustomizations(
			[URI.file(workspaceAgentInstructionsFile).toString()],
			[URI.file(userCopilotInstructionsFile).toString()],
		));

		client.clearReceived();
		await writeFile(userCopilotInstructionsFile, 'Use updated user copilot instructions.');
		await waitForAssert(() => assertAllCustomizations(
			[URI.file(workspaceAgentInstructionsFile).toString()],
			[URI.file(userCopilotInstructionsFile).toString()],
		));

		client.clearReceived();
		await writeFile(workspaceClaudeInstructionsFile, 'Use workspace CLAUDE instructions.');
		await waitForAssert(() => assertAllCustomizations(
			[
				URI.file(workspaceAgentInstructionsFile).toString(),
				URI.file(workspaceClaudeInstructionsFile).toString(),
			],
			[URI.file(userCopilotInstructionsFile).toString()],
		));

		client.clearReceived();
		await rm(workspaceAgentInstructionsFile, { force: true });
		await waitForAssert(() => assertAllCustomizations(
			[URI.file(workspaceClaudeInstructionsFile).toString()],
			[URI.file(userCopilotInstructionsFile).toString()],
		));

		client.clearReceived();
		await rm(userCopilotInstructionsFile, { force: true });
		await waitForAssert(() => assertAllCustomizations(
			[URI.file(workspaceClaudeInstructionsFile).toString()],
			[],
		));
	}


	async function runSimpleSkillWatchTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-watch-simple-skill-${discoveryMode}-`);
		tempDirs.push(workspaceDir);

		const skillsDir = join(workspaceDir, '.github', 'skills');
		const skillDir = join(skillsDir, 'watch-skill');
		const skillFile = join(skillDir, 'SKILL.md');
		const addedSkillDir = join(skillsDir, 'added-skill');
		const addedSkillFile = join(addedSkillDir, 'SKILL.md');
		await mkdir(skillDir, { recursive: true });
		await writeFile(skillFile, [
			'---',
			'name: watch-skill',
			'description: Watches skill changes',
			'---',
			'Return a greeting.',
		].join('\n'));

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, `real-sdk-customizations-watch-simple-skill-${discoveryMode}`, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, `real-sdk-customizations-watch-simple-skill-client-${discoveryMode}`, discoveryMode, `turn-customizations-watch-simple-skill-${discoveryMode}`);
		const skillsUri = URI.file(skillsDir).toString();

		const assertAllCustomizations = async (skillChildren: ReadonlyArray<{ uri: string; name: string }>): Promise<void> => {
			const session = await fetchSessionWithChat(client, sessionUri);
			assert.ok(session.customizations);
			const mappedCustomizations = session.customizations
				.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
				.map(customization => ({
					type: customization.type,
					contents: customization.contents,
					uri: customization.uri,
					children: (customization.children ?? []).map(child => ({ type: child.type, uri: child.uri, name: child.name })).sort((a, b) => a.uri.localeCompare(b.uri)),
				}))
				.filter(builtInCustomizations)
				.sort((a, b) => a.uri.localeCompare(b.uri));

			const expectedCustomizations = [
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
				{
					type: CustomizationType.Directory,
					contents: CustomizationType.Skill,
					uri: skillsUri,
					children: skillChildren
						.map(child => ({ type: CustomizationType.Skill, uri: child.uri, name: child.name }))
						.sort((a, b) => a.uri.localeCompare(b.uri)),
				},
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			].sort((a, b) => a.uri.localeCompare(b.uri));

			assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
		};

		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(skillFile).toString(), name: 'watch-skill' }]));

		client.clearReceived();
		await writeFile(skillFile, [
			'---',
			'name: watch-skill-renamed',
			'description: Watches skill changes',
			'---',
			'Return a renamed greeting.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(skillFile).toString(), name: 'watch-skill-renamed' }]));

		client.clearReceived();
		await mkdir(addedSkillDir, { recursive: true });
		await writeFile(addedSkillFile, [
			'---',
			'name: added-skill',
			'description: Added after startup',
			'---',
			'Return another greeting.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([
			{ uri: URI.file(skillFile).toString(), name: 'watch-skill-renamed' },
			{ uri: URI.file(addedSkillFile).toString(), name: 'added-skill' },
		]));

		client.clearReceived();
		await rm(skillFile, { force: true });
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(addedSkillFile).toString(), name: 'added-skill' }]));
	}

	async function runSimpleAgentWatchTest(discoveryMode: SessionCustomizationDiscoveryMode): Promise<void> {
		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-watch-simple-agent-${discoveryMode}-`);
		tempDirs.push(workspaceDir);

		const agentsDir = join(workspaceDir, '.github', 'agents');
		const agentFile = join(agentsDir, 'watch.agent.md');
		const addedAgentFile = join(agentsDir, 'added.agent.md');
		await mkdir(agentsDir, { recursive: true });
		await writeFile(agentFile, [
			'---',
			'name: Watch Agent',
			'description: Watches agent changes',
			'---',
			'You are a test agent.',
		].join('\n'));

		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, `real-sdk-customizations-watch-simple-agent-${discoveryMode}`, createdSessions, URI.file(workspaceDir));
		await setupSession(sessionUri, `real-sdk-customizations-watch-simple-agent-client-${discoveryMode}`, discoveryMode, `turn-customizations-watch-simple-agent-${discoveryMode}`);
		const agentsUri = URI.file(agentsDir).toString();

		const assertAllCustomizations = async (agentChildren: ReadonlyArray<{ uri: string; name: string }>): Promise<void> => {
			const session = await fetchSessionWithChat(client, sessionUri);
			assert.ok(session.customizations);
			const mappedCustomizations = session.customizations
				.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
				.map(customization => ({
					type: customization.type,
					contents: customization.contents,
					uri: customization.uri,
					children: (customization.children ?? []).map(child => ({ type: child.type, uri: child.uri, name: child.name })).sort((a, b) => a.uri.localeCompare(b.uri)),
				}))
				.filter(builtInCustomizations)
				.sort((a, b) => a.uri.localeCompare(b.uri));

			const expectedCustomizations = [
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
				{
					type: CustomizationType.Directory,
					contents: CustomizationType.Agent,
					uri: agentsUri,
					children: agentChildren
						.map(child => ({ type: CustomizationType.Agent, uri: child.uri, name: child.name }))
						.sort((a, b) => a.uri.localeCompare(b.uri)),
				},
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Agent, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Hook, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Rule, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
				{ type: CustomizationType.Directory, contents: CustomizationType.Skill, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
			].sort((a, b) => a.uri.localeCompare(b.uri));

			assert.deepStrictEqual(mappedCustomizations, expectedCustomizations);
		};

		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(agentFile).toString(), name: 'Watch Agent' }]));

		client.clearReceived();
		await writeFile(agentFile, [
			'---',
			'name: Watch Agent Renamed',
			'description: Watches agent changes',
			'---',
			'You are a renamed test agent.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(agentFile).toString(), name: 'Watch Agent Renamed' }]));

		client.clearReceived();
		await writeFile(addedAgentFile, [
			'---',
			'name: Added Agent',
			'description: Added after startup',
			'---',
			'You are an added test agent.',
		].join('\n'));
		await waitForAssert(() => assertAllCustomizations([
			{ uri: URI.file(agentFile).toString(), name: 'Watch Agent Renamed' },
			{ uri: URI.file(addedAgentFile).toString(), name: 'Added Agent' },
		]));

		client.clearReceived();
		await rm(agentFile, { force: true });
		await waitForAssert(() => assertAllCustomizations([{ uri: URI.file(addedAgentFile).toString(), name: 'Added Agent' }]));
	}


});
