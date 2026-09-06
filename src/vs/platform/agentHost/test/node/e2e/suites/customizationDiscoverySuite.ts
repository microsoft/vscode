/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostConfigKey, type SessionCustomizationDiscoveryMode } from '../../../../common/agentHostCustomizationConfig.js';
import { customizationId, CustomizationType, ROOT_STATE_URI, type ClientPluginCustomization, type Customization, type DirectoryCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { ActionType, type SessionCustomizationsChangedAction } from '../../../../common/state/sessionActions.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineCustomizationDiscoveryTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	function customizationDiscoveryTest(title: string, run: Mocha.AsyncFunc, enabled = config.supportsCustomizationDiscoveryE2E === true): void {
		if (context.tier !== 'parity') {
			return;
		}
		(enabled ? test : test.skip)(title, function () {
			this.timeout(180_000);
			return run.call(this);
		});
	}

	function createWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-customizations-${prefix}-`));
		tempDirs.push(workspace);
		mkdirSync(join(workspace, '.git'), { recursive: true });
		return workspace;
	}

	async function createDiscoverySession(prefix: string, workspace: string, mode: SessionCustomizationDiscoveryMode, customizations?: readonly ClientPluginCustomization[]): Promise<string> {
		const sessionUri = await createRealSession(context.client, config, `customizations-${prefix}`, createdSessions, URI.file(workspace));
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 1,
			action: { type: ActionType.RootConfigChanged, config: { [AgentHostConfigKey.SessionCustomizationDiscoveryMode]: mode } },
		});
		if (customizations) {
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 2,
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: { clientId: `customizations-${prefix}`, tools: [], customizations: [...customizations] },
				},
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/activeClientSet') && getActionEnvelope(n).channel === sessionUri,
				30_000,
			);
		}
		await driveTurnToCompletion(context.client, sessionUri, `turn-${prefix}`, 'Reply exactly "READY".', customizations ? 3 : 2);
		return sessionUri;
	}

	async function sessionCustomizations(sessionUri: string): Promise<readonly Customization[]> {
		const read = async (): Promise<readonly Customization[]> => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			return (result.snapshot!.state as SessionState).customizations ?? [];
		};
		let customizations = await read();
		if (customizations.length === 0) {
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/customizationsChanged')
				&& getActionEnvelope(n).channel === sessionUri
				&& (getActionEnvelope(n).action as SessionCustomizationsChangedAction).customizations.length > 0,
				60_000,
			);
			customizations = await read();
		}
		return customizations;
	}

	function directoryChildren(customizations: readonly Customization[], directory: string): readonly string[] {
		const found = customizations.find((customization): customization is DirectoryCustomization =>
			customization.type === CustomizationType.Directory && customization.uri === URI.file(directory).toString());
		return (found?.children ?? []).map(child => child.uri).sort();
	}

	function writeWorkspaceCustomizations(workspace: string): readonly { readonly type: CustomizationType; readonly path: string }[] {
		const agent = join(workspace, '.github', 'agents', 'hello.agent.md');
		mkdirSync(join(workspace, '.github', 'agents'), { recursive: true });
		writeFileSync(agent, '---\nname: Hello Agent\ndescription: Handles hello requests\n---\nYou are a test agent.');
		if (config.provider === 'codex') {
			return [{ type: CustomizationType.Agent, path: agent }];
		}
		const skill = join(workspace, '.github', 'skills', 'hello-skill', 'SKILL.md');
		const instruction = join(workspace, '.github', 'instructions', 'policy.instructions.md');
		const hook = join(workspace, '.github', 'hooks', 'pre-tool.json');
		for (const directory of [join(workspace, '.github', 'instructions'), join(workspace, '.github', 'skills', 'hello-skill'), join(workspace, '.github', 'hooks')]) {
			mkdirSync(directory, { recursive: true });
		}
		writeFileSync(instruction, '---\napplyTo:\n  - "**/*"\n---\nPrefer short answers.');
		writeFileSync(skill, '---\nname: hello-skill\ndescription: Says hello\n---\nReturn a greeting.');
		writeFileSync(hook, JSON.stringify({ PreToolUse: [] }));
		return [
			{ type: CustomizationType.Agent, path: agent },
			{ type: CustomizationType.Rule, path: instruction },
			{ type: CustomizationType.Skill, path: skill },
			{ type: CustomizationType.Hook, path: hook },
		];
	}

	function discoveredFixtureFiles(customizations: readonly Customization[], files: readonly { readonly type: CustomizationType; readonly path: string }[]): readonly { readonly type: CustomizationType; readonly uri: string }[] {
		const expectedUris = new Set(files.map(file => URI.file(file.path).toString()));
		return customizations
			.filter((customization): customization is DirectoryCustomization => customization.type === CustomizationType.Directory)
			.flatMap(customization => customization.children ?? [])
			.filter(child => expectedUris.has(child.uri))
			.map(child => ({ type: child.type, uri: child.uri }))
			.sort((a, b) => a.uri.localeCompare(b.uri));
	}

	for (const mode of ['scan', 'discover'] as const) {
		const supportedCustomizations = config.provider === 'copilotcli'
			? 'workspace agents instructions skills and hooks'
			: 'provider-supported workspace customizations';
		customizationDiscoveryTest(`customization discovery: ${mode} finds ${supportedCustomizations}`, async function () {
			const workspace = createWorkspace(`all-${mode}`);
			const files = writeWorkspaceCustomizations(workspace);
			const sessionUri = await createDiscoverySession(`all-${mode}`, workspace, mode);
			const customizations = await sessionCustomizations(sessionUri);

			assert.deepStrictEqual(discoveredFixtureFiles(customizations, files), files
				.map(file => ({ type: file.type, uri: URI.file(file.path).toString() }))
				.sort((a, b) => a.uri.localeCompare(b.uri)));
		});
	}

	const fixedInstructionTitle = config.provider === 'copilotcli'
		? 'customization discovery: discover groups fixed agent instruction files at the workspace root'
		: 'customization discovery: discover groups provider-supported fixed instruction files at the workspace root';
	customizationDiscoveryTest(fixedInstructionTitle, async function () {
		const workspace = createWorkspace('agent-instructions');
		const files = config.provider === 'codex'
			? [join(workspace, 'AGENTS.md')]
			: [
				join(workspace, 'AGENTS.md'),
				join(workspace, 'CLAUDE.md'),
				join(workspace, '.github', 'copilot-instructions.md'),
			];
		mkdirSync(join(workspace, '.github'), { recursive: true });
		for (const file of files) {
			writeFileSync(file, `Instructions from ${file}`);
		}

		const sessionUri = await createDiscoverySession('agent-instructions', workspace, 'discover');
		const customizations = await sessionCustomizations(sessionUri);

		assert.deepStrictEqual(directoryChildren(customizations, workspace), files.map(file => URI.file(file).toString()).sort());
	}, config.supportsFixedInstructionDiscoveryE2E === true);

	customizationDiscoveryTest('customization discovery: configured plugin exposes its agent rule and skill children', async function () {
		const workspace = createWorkspace('plugin');
		const plugin = join(workspace, 'plugin');
		mkdirSync(join(plugin, '.plugin'), { recursive: true });
		mkdirSync(join(plugin, 'agents'), { recursive: true });
		mkdirSync(join(plugin, 'rules'), { recursive: true });
		mkdirSync(join(plugin, 'skills', 'plugin-skill'), { recursive: true });
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'E2E Plugin' }));
		writeFileSync(join(plugin, 'agents', 'plugin.agent.md'), '---\nname: Plugin Agent\ndescription: Plugin agent\n---\nAct.');
		writeFileSync(join(plugin, 'rules', 'plugin.instructions.md'), '---\nname: Plugin Rule\napplyTo:\n  - "**/*"\n---\nRule.');
		writeFileSync(join(plugin, 'skills', 'plugin-skill', 'SKILL.md'), '---\nname: plugin-skill\ndescription: Plugin skill\n---\nSkill.');
		const pluginUri = URI.file(plugin).toString();
		const clientCustomization: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri,
			name: 'E2E Plugin',
			nonce: '1',
		};

		const sessionUri = await createDiscoverySession('plugin', workspace, 'discover', [clientCustomization]);
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/customizationUpdated') || getActionEnvelope(n).channel !== sessionUri) {
				return false;
			}
			return (getActionEnvelope(n).action as { customization?: { uri?: string } }).customization?.uri === pluginUri;
		}, 60_000);
		const customizations = await sessionCustomizations(sessionUri);
		const loaded = customizations.find((customization): customization is PluginCustomization =>
			customization.type === CustomizationType.Plugin && customization.uri === pluginUri);

		assert.deepStrictEqual(
			(loaded?.children ?? []).map(child => ({ type: child.type, name: child.name })).sort((a, b) => a.name.localeCompare(b.name)),
			[
				{ type: CustomizationType.Agent, name: 'Plugin Agent' },
				{ type: CustomizationType.Rule, name: 'plugin' },
				{ type: CustomizationType.Skill, name: 'plugin-skill' },
			].sort((a, b) => a.name.localeCompare(b.name)),
		);
	}, config.supportsPluginCustomizationDiscoveryE2E === true);

	customizationDiscoveryTest('customization discovery: filesystem watcher publishes a newly added agent', async function () {
		const workspace = createWorkspace('watch-agent');
		const agentsDirectory = join(workspace, '.github', 'agents');
		const initial = join(agentsDirectory, 'initial.agent.md');
		const added = join(agentsDirectory, 'added.agent.md');
		mkdirSync(agentsDirectory, { recursive: true });
		writeFileSync(initial, '---\nname: Initial Agent\ndescription: Initial\n---\nInitial.');
		const sessionUri = await createDiscoverySession('watch-agent', workspace, 'discover');
		await sessionCustomizations(sessionUri);
		context.client.clearReceived();

		writeFileSync(added, '---\nname: Added Agent\ndescription: Added\n---\nAdded.');
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/customizationsChanged') || getActionEnvelope(n).channel !== sessionUri) {
				return false;
			}
			const action = getActionEnvelope(n).action as SessionCustomizationsChangedAction;
			return action.customizations.some(customization =>
				customization.type === CustomizationType.Directory
				&& customization.uri === URI.file(agentsDirectory).toString()
				&& customization.children?.some(child => child.uri === URI.file(added).toString()));
		}, 60_000);

		assert.deepStrictEqual(directoryChildren(await sessionCustomizations(sessionUri), agentsDirectory), [
			URI.file(added).toString(),
			URI.file(initial).toString(),
		].sort());
	}, config.supportsWorkspaceAgentWatchE2E === true);

	customizationDiscoveryTest('customization discovery: filesystem watcher removes a deleted agent', async function () {
		const workspace = createWorkspace('watch-agent-delete');
		const agentsDirectory = join(workspace, '.github', 'agents');
		const retained = join(agentsDirectory, 'retained.agent.md');
		const removed = join(agentsDirectory, 'removed.agent.md');
		mkdirSync(agentsDirectory, { recursive: true });
		writeFileSync(retained, '---\nname: Retained Agent\ndescription: Retained\n---\nRetained.');
		writeFileSync(removed, '---\nname: Removed Agent\ndescription: Removed\n---\nRemoved.');
		const sessionUri = await createDiscoverySession('watch-agent-delete', workspace, 'discover');
		await sessionCustomizations(sessionUri);
		context.client.clearReceived();

		unlinkSync(removed);
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/customizationsChanged') || getActionEnvelope(n).channel !== sessionUri) {
				return false;
			}
			const action = getActionEnvelope(n).action as SessionCustomizationsChangedAction;
			const directory = action.customizations.find((customization): customization is DirectoryCustomization =>
				customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
			return directory !== undefined
				&& !!directory.children?.some(child => child.uri === URI.file(retained).toString())
				&& !directory.children?.some(child => child.uri === URI.file(removed).toString());
		}, 60_000);

		assert.deepStrictEqual(directoryChildren(await sessionCustomizations(sessionUri), agentsDirectory), [URI.file(retained).toString()]);
	}, config.supportsWorkspaceAgentWatchE2E === true);

	customizationDiscoveryTest('customization discovery: filesystem watcher updates an edited agent', async function () {
		const workspace = createWorkspace('watch-agent-update');
		const agentsDirectory = join(workspace, '.github', 'agents');
		const agentFile = join(agentsDirectory, 'editable.agent.md');
		mkdirSync(agentsDirectory, { recursive: true });
		writeFileSync(agentFile, '---\nname: Before Agent\ndescription: Before\n---\nBefore.');
		const sessionUri = await createDiscoverySession('watch-agent-update', workspace, 'discover');
		await sessionCustomizations(sessionUri);
		context.client.clearReceived();

		writeFileSync(agentFile, '---\nname: After Agent\ndescription: After\n---\nAfter.');
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/customizationsChanged') || getActionEnvelope(n).channel !== sessionUri) {
				return false;
			}
			const action = getActionEnvelope(n).action as SessionCustomizationsChangedAction;
			const directory = action.customizations.find((customization): customization is DirectoryCustomization =>
				customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
			return directory?.children?.some(child => child.uri === URI.file(agentFile).toString() && child.name === 'After Agent') ?? false;
		}, 60_000);

		const customizations = await sessionCustomizations(sessionUri);
		const directory = customizations.find((customization): customization is DirectoryCustomization =>
			customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
		assert.deepStrictEqual(directory?.children?.map(child => ({ uri: child.uri, name: child.name })), [{
			uri: URI.file(agentFile).toString(),
			name: 'After Agent',
		}]);
	}, config.supportsWorkspaceAgentWatchE2E === true);
}
