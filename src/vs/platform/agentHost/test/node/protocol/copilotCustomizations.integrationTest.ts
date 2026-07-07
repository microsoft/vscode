/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK customization integration tests running on a mocked LLM.
 *
 * agent host log file: ~/.vscode-insiders/tmp/tmp_vscode_1/ahp-customizations-home-mock-ZBucPX/Library/Application Support/Code - OSS Dev/logs/20260701T192836/agenthost-server.log
 */

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ActionType, SessionCustomizationsChangedAction } from '../../../common/state/sessionActions.js';
import { CustomizationType, type DirectoryCustomization } from '../../../common/state/sessionState.js';
import { type AhpNotification } from '../../../common/state/sessionProtocol.js';
import { createRealSession, dispatchTurn, IRealSdkProviderConfig } from './realSdkTestHelpers.js';
import { getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

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

const SETUP_TIMEOUT_MS = 45_000;
const TEST_TIMEOUT_MS = 90_000;
const NOTIFICATION_TIMEOUT_MS = 10_000;

suite('Protocol WebSocket — Real Copilot SDK, Mocked LLM (Copilot customizations)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let userHomeDir: string;

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
		client = new TestProtocolClient(server.port);
		await client.connect();
		await cleanHomeFolder();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();
	});

	async function cleanHomeFolder() {
		const foldersToClean = ['.copilot/agents', '.copilot/instructions', '.copilot/skills', '.copilot/hooks', '.agents', '.claude'];
		await Promise.all([
			...foldersToClean.map(folder => rm(join(userHomeDir, folder), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })),
		]);
	}

	test('detects only directory customizations on an empty workspace via session/customizationsChanged after hello (mock LLM)', async function () {
		this.timeout(TEST_TIMEOUT_MS);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-empty-mock-`);
		tempDirs.push(workspaceDir);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-customizations-empty-mock', createdSessions, URI.file(workspaceDir));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'real-sdk-customizations-empty-client-mock',
					tools: [],
				},
			},
		});
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-customizations-empty-mock', 'hello', 2);

		const [customizationsNotif] = await Promise.all([
			client.waitForNotification(n => isSettledCustomizationsNotification(n, sessionUri), NOTIFICATION_TIMEOUT_MS),
			client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), NOTIFICATION_TIMEOUT_MS),
		]);

		const customizationsAction = getActionEnvelope(customizationsNotif).action as SessionCustomizationsChangedAction;
		const mappedCustomizations = customizationsAction.customizations.map(customization => ({
			type: customization.type,
			uri: customization.uri,
			children: customization.type === CustomizationType.Directory ? (customization.children ?? []).map(child => child.uri) : undefined,
		}));
		const expectedCustomizations = [
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.agents', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [] },
		];
		const actualByUri = new Map(mappedCustomizations.map(customization => [customization.uri, customization]));
		assert.strictEqual(actualByUri.size, expectedCustomizations.length, `expected ${expectedCustomizations.length} unique customizations, got: ${JSON.stringify(mappedCustomizations)}`);
		const actualCustomizations = expectedCustomizations.map(expected => actualByUri.get(expected.uri));
		assert.deepStrictEqual(actualCustomizations, expectedCustomizations);
	});

	test('detects workspace agents, instructions, skills, and hooks via session/customizationsChanged after hello (mock LLM)', async function () {
		this.timeout(TEST_TIMEOUT_MS);

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
			client.waitForNotification(n => isSettledCustomizationsNotification(n, sessionUri), NOTIFICATION_TIMEOUT_MS),
			client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), NOTIFICATION_TIMEOUT_MS),
		]);

		const customizationsAction = getActionEnvelope(customizationsNotif).action as SessionCustomizationsChangedAction;
		const mappedCustomizations = customizationsAction.customizations.map(customization => ({
			type: customization.type,
			uri: customization.uri,
			children: customization.type === CustomizationType.Directory ? (customization.children ?? []).map(child => child.uri) : undefined,
		}));
		const expectedCustomizations = [
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.agents', 'skills')).toString(), children: [URI.file(userSkillFile).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'agents')).toString(), children: [URI.file(userAgentFile).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'hooks')).toString(), children: [URI.file(userHookFile).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'instructions')).toString(), children: [URI.file(userInstructionFile).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(userHomeDir, '.copilot', 'skills')).toString(), children: [URI.file(userCopilotSkillFile).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.agents', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.agents', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.claude', 'agents')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.claude', 'skills')).toString(), children: [] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'agents')).toString(), children: [URI.file(join(agentsDir, 'hello.agent.md')).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'hooks')).toString(), children: [URI.file(join(hooksDir, 'pre-tool.json')).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'instructions')).toString(), children: [URI.file(join(instructionsDir, 'policy.instructions.md')).toString()] },
			{ type: CustomizationType.Directory, uri: URI.file(join(workspaceDir, '.github', 'skills')).toString(), children: [URI.file(join(skillsDir, 'SKILL.md')).toString()] },
		];
		const actualByUri = new Map(mappedCustomizations.map(customization => [customization.uri, customization]));
		assert.strictEqual(actualByUri.size, expectedCustomizations.length, `expected ${expectedCustomizations.length} unique customizations, got: ${JSON.stringify(mappedCustomizations)}`);
		const actualCustomizations = expectedCustomizations.map(expected => actualByUri.get(expected.uri));
		assert.deepStrictEqual(actualCustomizations, expectedCustomizations);
	});

	test('emits session/customizationsChanged when customization files are edited, added, and removed (mock LLM)', async function () {
		this.timeout(TEST_TIMEOUT_MS);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-customizations-watch-mock-`);
		tempDirs.push(workspaceDir);
		const githubDir = join(workspaceDir, '.github');
		const agentsDir = join(githubDir, 'agents');
		const skillsDir = join(githubDir, 'skills');
		const instructionsDir = join(githubDir, 'instructions');
		const hooksDir = join(githubDir, 'hooks');
		const homeAgentsDir = join(userHomeDir, '.copilot', 'agents');
		const homeCopilotSkillsDir = join(userHomeDir, '.copilot', 'skills');
		const homeSkillsDir = join(userHomeDir, '.agents', 'skills');
		const homeInstructionsDir = join(userHomeDir, '.copilot', 'instructions');
		const homeHooksDir = join(userHomeDir, '.copilot', 'hooks');
		const agentFile = join(agentsDir, 'hello.agent.md');
		const addedAgentFile = join(agentsDir, 'added.agent.md');
		const skillFile = join(skillsDir, 'watch-skill', 'SKILL.md');
		const addedSkillFile = join(skillsDir, 'added-skill', 'SKILL.md');
		const instructionFile = join(instructionsDir, 'watch.instructions.md');
		const addedInstructionFile = join(instructionsDir, 'added.instructions.md');
		const hookFile = join(hooksDir, 'pre-tool.json');
		const addedHookFile = join(hooksDir, 'post-tool.json');
		const homeAgentFile = join(homeAgentsDir, 'home.agent.md');
		const homeCopilotSkillFile = join(homeCopilotSkillsDir, 'nls', 'SKILL.md');
		const addedHomeAgentFile = join(homeAgentsDir, 'added-home.agent.md');
		const homeSkillFile = join(homeSkillsDir, 'home-skill', 'SKILL.md');
		const addedHomeSkillFile = join(homeSkillsDir, 'added-home-skill', 'SKILL.md');
		const homeInstructionFile = join(homeInstructionsDir, 'home.instructions.md');
		const addedHomeInstructionFile = join(homeInstructionsDir, 'added-home.instructions.md');
		const homeHookFile = join(homeHooksDir, 'home-pre-tool.json');
		const addedHomeHookFile = join(homeHooksDir, 'home-post-tool.json');
		const agentsInstructionsFile = join(workspaceDir, 'AGENTS.md');
		const workspaceAgentsDir = join(workspaceDir, '.agents', 'agents');
		const workspaceAgentsFile = join(workspaceAgentsDir, 'workspace-folder.agent.md');
		const workspaceRootUri = URI.file(workspaceDir).toString();

		await Promise.all([
			mkdir(agentsDir, { recursive: true }),
			mkdir(join(skillsDir, 'watch-skill'), { recursive: true }),
			mkdir(instructionsDir, { recursive: true }),
			mkdir(hooksDir, { recursive: true }),
			mkdir(homeAgentsDir, { recursive: true }),
			mkdir(join(homeSkillsDir, 'home-skill'), { recursive: true }),
			mkdir(homeInstructionsDir, { recursive: true }),
			mkdir(homeHooksDir, { recursive: true }),
		]);
		await Promise.all([
			writeFile(agentFile, [
				'---',
				'name: Hello Agent',
				'description: Handles hello requests',
				'---',
				'You are a test agent.',
			].join('\n')),
			writeFile(skillFile, [
				'---',
				'name: watch-skill',
				'description: Watches skill changes',
				'---',
				'Return a greeting.',
			].join('\n')),
			writeFile(instructionFile, [
				'---',
				'name: Watch Policy',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Be concise.',
			].join('\n')),
			writeFile(hookFile, JSON.stringify({ PreToolUse: [] }, undefined, 2)),
			writeFile(homeAgentFile, [
				'---',
				'name: Home Agent',
				'description: Home scoped agent',
				'---',
				'You are a home test agent.',
			].join('\n')),
			writeFile(homeSkillFile, [
				'---',
				'name: home-skill',
				'description: Home scoped skill',
				'---',
				'Return a greeting.',
			].join('\n')),
			writeFile(homeInstructionFile, [
				'---',
				'name: Home Policy',
				'applyTo:',
				'  - "**/*"',
				'---',
				'Prefer home defaults.',
			].join('\n')),
			writeFile(homeHookFile, JSON.stringify({ PreToolUse: [] }, undefined, 2)),
		]);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-customizations-watch-mock', createdSessions, URI.file(workspaceDir));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'real-sdk-customizations-watch-client-mock',
					tools: [],
				},
			},
		});
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-customizations-watch-mock', 'hello', 2);

		const getChildNamesAtDirectory = (action: SessionCustomizationsChangedAction, directoryUri: string, type: CustomizationType): string[] => {
			const directories = action.customizations.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory);
			const directory = directories.find(customization => customization.uri === directoryUri);
			return (directory?.children ?? [])
				.filter(child => child.type === type)
				.map(child => child.name)
				.sort((a, b) => a.localeCompare(b));
		};

		const waitForDirectoryChildNames = async (directoryUri: string, type: CustomizationType, expectedNames: readonly string[], timeoutMs = NOTIFICATION_TIMEOUT_MS): Promise<void> => {
			const expectedSorted = [...expectedNames].sort((a, b) => a.localeCompare(b));
			const assertSingleCustomizationChangeNotification = (): void => {
				const matchingNotifications = client.receivedNotifications().filter(notification =>
					isActionNotification(notification, ActionType.SessionCustomizationsChanged) &&
					getActionEnvelope(notification).channel === sessionUri
				);
				// Only settled (non-empty) notifications represent a real state
				// change; transient pre-discovery `customizations: []` snapshots
				// may straddle a `clearReceived()` (see
				// `isSettledCustomizationsNotification`) and must not be counted.
				const settledNotifications = matchingNotifications.filter(notification => isSettledCustomizationsNotification(notification, sessionUri));
				assert.strictEqual(
					settledNotifications.length,
					1,
					`expected exactly one settled ${ActionType.SessionCustomizationsChanged} notification for ${directoryUri}; got ${settledNotifications.length} settled of ${matchingNotifications.length} total: ${JSON.stringify(matchingNotifications)}`,
				);
			};

			const getMatchingActionFromNotifications = (notifications: ReturnType<TestProtocolClient['receivedNotifications']>): SessionCustomizationsChangedAction | undefined => {
				for (const notification of notifications) {
					if (!isSettledCustomizationsNotification(notification, sessionUri)) {
						continue;
					}
					const action = getActionEnvelope(notification).action as SessionCustomizationsChangedAction;
					const names = getChildNamesAtDirectory(action, directoryUri, type);
					if (JSON.stringify(names) === JSON.stringify(expectedSorted)) {
						return action;
					}
				}
				return undefined;
			};

			const existingAction = getMatchingActionFromNotifications(client.receivedNotifications());
			if (existingAction) {
				assert.deepStrictEqual(getChildNamesAtDirectory(existingAction, directoryUri, type), expectedSorted);
				assertSingleCustomizationChangeNotification();
				return;
			}

			let notif;
			try {
				notif = await client.waitForNotification(n => {
					if (!isSettledCustomizationsNotification(n, sessionUri)) {
						return false;
					}
					const action = getActionEnvelope(n).action as SessionCustomizationsChangedAction;
					const names = getChildNamesAtDirectory(action, directoryUri, type);
					return JSON.stringify(names) === JSON.stringify(expectedSorted);
				}, timeoutMs);
			} catch (error) {
				throw new Error(`Timeout waiting for customizations update. directory=${directoryUri}, type=${type}, expected=${JSON.stringify(expectedSorted)}, received=${JSON.stringify(client.receivedNotifications())}, error=${error}`);
			}
			const action = getActionEnvelope(notif).action as SessionCustomizationsChangedAction;
			assert.deepStrictEqual(getChildNamesAtDirectory(action, directoryUri, type), expectedSorted);
			assertSingleCustomizationChangeNotification();
		};

		await Promise.all([
			waitForDirectoryChildNames(URI.file(agentsDir).toString(), CustomizationType.Agent, ['Hello Agent']),
			waitForDirectoryChildNames(URI.file(homeAgentsDir).toString(), CustomizationType.Agent, ['Home Agent']),
			client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), NOTIFICATION_TIMEOUT_MS),
		]);

		client.clearReceived();
		await writeFile(agentFile, [
			'---',
			'name: Hello Agent Renamed',
			'description: Handles hello requests',
			'---',
			'You are a renamed test agent.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(agentsDir).toString(), CustomizationType.Agent, ['Hello Agent Renamed']);

		client.clearReceived();
		await writeFile(addedAgentFile, [
			'---',
			'name: Added Agent',
			'description: Added after startup',
			'---',
			'You are a newly added test agent.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(agentsDir).toString(), CustomizationType.Agent, ['Added Agent', 'Hello Agent Renamed']);

		client.clearReceived();
		await rm(addedAgentFile, { force: true });
		await waitForDirectoryChildNames(URI.file(agentsDir).toString(), CustomizationType.Agent, ['Hello Agent Renamed']);

		client.clearReceived();
		await writeFile(agentsInstructionsFile, 'Be concise in all responses.');
		await waitForDirectoryChildNames(workspaceRootUri, CustomizationType.Rule, ['AGENTS.md']);

		client.clearReceived();
		await rm(agentsInstructionsFile, { force: true });
		await waitForDirectoryChildNames(workspaceRootUri, CustomizationType.Rule, []);

		client.clearReceived();
		await mkdir(workspaceAgentsDir, { recursive: true });
		await writeFile(workspaceAgentsFile, [
			'---',
			'name: Workspace Folder Agent',
			'description: Found in .agents/agents',
			'---',
			'You are a workspace-folder test agent.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(workspaceAgentsDir).toString(), CustomizationType.Agent, ['Workspace Folder Agent']);

		client.clearReceived();
		await writeFile(skillFile, [
			'---',
			'name: watch-skill-renamed',
			'description: Watches skill changes',
			'---',
			'Return a greeting.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(skillsDir).toString(), CustomizationType.Skill, ['watch-skill-renamed']);

		client.clearReceived();
		await mkdir(join(skillsDir, 'added-skill'), { recursive: true });
		await writeFile(addedSkillFile, [
			'---',
			'name: added-skill',
			'description: Added after startup',
			'---',
			'Return a greeting.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(skillsDir).toString(), CustomizationType.Skill, ['added-skill', 'watch-skill-renamed']);

		client.clearReceived();
		await rm(addedSkillFile, { force: true });
		await waitForDirectoryChildNames(URI.file(skillsDir).toString(), CustomizationType.Skill, ['watch-skill-renamed']);

		client.clearReceived();
		await writeFile(instructionFile, [
			'---',
			'name: Watch Policy Renamed',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Be concise.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(instructionsDir).toString(), CustomizationType.Rule, ['Watch Policy Renamed']);

		client.clearReceived();
		await writeFile(addedInstructionFile, [
			'---',
			'name: Added Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Prefer short answers.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(instructionsDir).toString(), CustomizationType.Rule, ['Added Policy', 'Watch Policy Renamed']);

		client.clearReceived();
		await rm(addedInstructionFile, { force: true });
		await waitForDirectoryChildNames(URI.file(instructionsDir).toString(), CustomizationType.Rule, ['Watch Policy Renamed']);

		client.clearReceived();
		await writeFile(hookFile, JSON.stringify({ PreToolUse: [{ command: 'echo changed' }] }, undefined, 2));
		await waitForDirectoryChildNames(URI.file(hooksDir).toString(), CustomizationType.Hook, ['pre-tool.json']);

		client.clearReceived();
		await writeFile(addedHookFile, JSON.stringify({ PostToolUse: [] }, undefined, 2));
		await waitForDirectoryChildNames(URI.file(hooksDir).toString(), CustomizationType.Hook, ['post-tool.json', 'pre-tool.json']);

		client.clearReceived();
		await rm(addedHookFile, { force: true });
		await waitForDirectoryChildNames(URI.file(hooksDir).toString(), CustomizationType.Hook, ['pre-tool.json']);

		client.clearReceived();
		await writeFile(homeAgentFile, [
			'---',
			'name: Home Agent Renamed',
			'description: Home scoped agent',
			'---',
			'You are a renamed home test agent.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeAgentsDir).toString(), CustomizationType.Agent, ['Home Agent Renamed']);

		client.clearReceived();
		await writeFile(addedHomeAgentFile, [
			'---',
			'name: Added Home Agent',
			'description: Added after startup in home',
			'---',
			'You are a newly added home test agent.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeAgentsDir).toString(), CustomizationType.Agent, ['Added Home Agent', 'Home Agent Renamed']);

		client.clearReceived();
		await rm(addedHomeAgentFile, { force: true });
		await waitForDirectoryChildNames(URI.file(homeAgentsDir).toString(), CustomizationType.Agent, ['Home Agent Renamed']);

		client.clearReceived();
		await writeFile(homeSkillFile, [
			'---',
			'name: home-skill-renamed',
			'description: Home scoped skill',
			'---',
			'Return a greeting.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeSkillsDir).toString(), CustomizationType.Skill, ['home-skill-renamed']);

		client.clearReceived();
		await mkdir(join(homeCopilotSkillsDir, 'nls'), { recursive: true });
		await writeFile(homeCopilotSkillFile, [
			'---',
			'name: nls-copilot-home-skill',
			'description: Added under ~/.copilot/skills',
			'---',
			'Return localized strings.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeCopilotSkillsDir).toString(), CustomizationType.Skill, ['nls-copilot-home-skill']);

		client.clearReceived();
		await mkdir(join(homeSkillsDir, 'added-home-skill'), { recursive: true });
		await writeFile(addedHomeSkillFile, [
			'---',
			'name: added-home-skill',
			'description: Added after startup in home',
			'---',
			'Return a greeting.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeSkillsDir).toString(), CustomizationType.Skill, ['added-home-skill', 'home-skill-renamed']);

		client.clearReceived();
		await rm(addedHomeSkillFile, { force: true });
		await waitForDirectoryChildNames(URI.file(homeSkillsDir).toString(), CustomizationType.Skill, ['home-skill-renamed']);

		client.clearReceived();
		await writeFile(homeInstructionFile, [
			'---',
			'name: Home Policy Renamed',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Prefer home defaults.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeInstructionsDir).toString(), CustomizationType.Rule, ['Home Policy Renamed']);

		client.clearReceived();
		await writeFile(addedHomeInstructionFile, [
			'---',
			'name: Added Home Policy',
			'applyTo:',
			'  - "**/*"',
			'---',
			'Prefer short answers.',
		].join('\n'));
		await waitForDirectoryChildNames(URI.file(homeInstructionsDir).toString(), CustomizationType.Rule, ['Added Home Policy', 'Home Policy Renamed']);

		client.clearReceived();
		await rm(addedHomeInstructionFile, { force: true });
		await waitForDirectoryChildNames(URI.file(homeInstructionsDir).toString(), CustomizationType.Rule, ['Home Policy Renamed']);

		client.clearReceived();
		await writeFile(homeHookFile, JSON.stringify({ PreToolUse: [{ command: 'echo home-changed' }] }, undefined, 2));
		await waitForDirectoryChildNames(URI.file(homeHooksDir).toString(), CustomizationType.Hook, ['home-pre-tool.json']);

		client.clearReceived();
		await writeFile(addedHomeHookFile, JSON.stringify({ PostToolUse: [] }, undefined, 2));
		await waitForDirectoryChildNames(URI.file(homeHooksDir).toString(), CustomizationType.Hook, ['home-post-tool.json', 'home-pre-tool.json']);

		client.clearReceived();
		await rm(addedHomeHookFile, { force: true });
		await waitForDirectoryChildNames(URI.file(homeHooksDir).toString(), CustomizationType.Hook, ['home-pre-tool.json']);
	});
});
