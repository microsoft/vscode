/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { customizationId, CustomizationType, type ClientPluginCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';
import { defaultChatChannel } from '../../hostDefaultChats.js';
import { createTestDirectory } from '../harness/testDirectories.js';
import { fullOnlyTest, type AgentHostTestProfile } from '../../agentHostTestProfile.js';

export function defineCopilotRuntimeCustomizationCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	function customizationTest(title: string, run: () => Promise<void>, profile: AgentHostTestProfile = 'full'): void {
		(profile === 'pr' ? test : fullOnlyTest)(title, async function () {
			this.timeout(180_000);
			await run();
			await assertRecordedAhpSnapshot(this.test!, context.client, { profile: 'behavior' });
		});
	}

	function fixtureRoot(): { root: string; workspace: string; plugin: string } {
		const root = realpathSync.native(createTestDirectory(join(tmpdir(), 'ahp-coverage-runtime-customization-')));
		context.tempDirs.push(root);
		const workspace = join(root, 'workspace');
		const plugin = join(root, 'plugin');
		mkdirSync(workspace);
		mkdirSync(join(plugin, '.plugin'), { recursive: true });
		execFileSync('git', ['init', '--quiet', workspace]);
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-customization' }));
		writeSkill(plugin, 'runtime-note', 'Returns the runtime skill sentinel', 'Reply exactly RUNTIME_SKILL_READY. Do not call tools.');
		return { root, workspace, plugin };
	}

	function writeSkill(plugin: string, name: string, description: string, body: string, frontmatter: readonly string[] = []): void {
		const directory = join(plugin, 'skills', name);
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'SKILL.md'), ['---', `name: ${name}`, `description: ${description}`, ...frontmatter, '---', body].join('\n'));
	}

	async function attachPlugin(workspace: string, plugin: string): Promise<string> {
		const clientId = 'runtime-customization-client';
		const sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
		const pluginUri = URI.file(plugin).toString();
		const customization: ClientPluginCustomization = {
			type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri,
			name: 'runtime-customization', nonce: '1',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		};
		context.client.dispatch({
			channel: sessionUri, clientSeq: 1,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
		});
		await retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const pluginState = (result.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
				item.type === CustomizationType.Plugin && item.uri === pluginUri);
			assert.ok(pluginState?.children?.some(child => child.type === CustomizationType.Skill));
		}, 100, 100);
		// Snapshot the turn contract, not concurrent plugin resource materialization.
		context.client.clearAhpSnapshot();
		return sessionUri;
	}

	customizationTest('runtime coverage customization: skill allowed tools read a supporting plugin resource', async () => {
		const { workspace, plugin } = fixtureRoot();
		const skill = join(plugin, 'skills', 'runtime-resource');
		mkdirSync(skill, { recursive: true });
		writeFileSync(join(skill, 'reference.txt'), 'RUNTIME_SKILL_RESOURCE_OK');
		writeSkill(plugin, 'runtime-resource', 'Reads the runtime supporting reference',
			'Use view to read reference.txt in this skill base directory. Reply with exactly its contents.',
			['allowed-tools: view']);
		const sessionUri = await attachPlugin(workspace, plugin);
		const turnId = 'runtime-skill-resource';
		await driveTurnToCompletion(context.client, sessionUri, turnId,
			`The workspace is ${workspace}. Invoke the runtime-resource skill exactly once and read the reference from its absolute skill base directory, not the workspace. Follow its instructions. Do not use shell tools.`, 2);
		assertToolCallCompleteText(context.client, {
			channel: defaultChatChannel(sessionUri), turnId, toolNames: ['view'], expected: [/^ ?RUNTIME_SKILL_RESOURCE_OK$/m], success: true,
		});
		const skillCalls = new Set(context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
			.map(n => getActionEnvelope(n))
			.filter(envelope => envelope.channel === defaultChatChannel(sessionUri)
				&& envelope.action.type === ActionType.ChatToolCallStart && envelope.action.turnId === turnId && envelope.action.toolName === 'skill')
			.map(envelope => envelope.action.type === ActionType.ChatToolCallStart ? envelope.action.toolCallId : ''));
		const skillCompletions = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.map(n => getActionEnvelope(n))
			.flatMap(envelope => {
				if (envelope.channel !== defaultChatChannel(sessionUri) || envelope.action.type !== ActionType.ChatToolCallComplete
					|| envelope.action.turnId !== turnId || !skillCalls.has(envelope.action.toolCallId)) {
					return [];
				}
				const result = envelope.action.result;
				const message = typeof result.pastTenseMessage === 'string' ? result.pastTenseMessage : result.pastTenseMessage.markdown;
				return [{ success: result.success, namesSkill: message.includes('runtime-resource'), linksSkillFile: message.includes('/skills/runtime-resource/SKILL.md') }];
			});
		assert.deepStrictEqual(skillCompletions, [{ success: true, namesSkill: true, linksSkillFile: true }]);
	}, 'pr');

	customizationTest('runtime coverage customization: sibling skill resources stay isolated by skill base directory', async () => {
		const { workspace, plugin } = fixtureRoot();
		for (const name of ['runtime-left', 'runtime-right']) {
			writeSkill(plugin, name, `Reads the ${name} reference`,
				'Use view to read reference.txt in this skill base directory. Reply with exactly its contents.');
			writeFileSync(join(plugin, 'skills', name, 'reference.txt'), name === 'runtime-left' ? 'RUNTIME_LEFT_OK' : 'RUNTIME_RIGHT_OK');
		}
		const sessionUri = await attachPlugin(workspace, plugin);
		for (const [index, name, expected] of [[0, 'runtime-left', /^ ?RUNTIME_LEFT_OK$/m], [1, 'runtime-right', /^ ?RUNTIME_RIGHT_OK$/m]] as const) {
			const turnId = `runtime-skill-${index}`;
			await driveTurnToCompletion(context.client, sessionUri, turnId,
				`The workspace is ${workspace}. Invoke the ${name} skill exactly once and read the reference from its absolute skill base directory, not the workspace. Follow its instructions. Do not use shell tools.`, index * 100 + 2);
			assertToolCallCompleteText(context.client, {
				channel: defaultChatChannel(sessionUri), turnId, toolNames: ['view'], expected: [expected], success: true,
			});
		}
	});
}
