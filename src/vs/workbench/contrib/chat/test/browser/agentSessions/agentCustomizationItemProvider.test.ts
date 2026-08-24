/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { CustomizationType, type AgentCustomization, type ClientPluginCustomization, type Customization, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';

suite('AgentCustomizationItemProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('surfaces draft agents in management customizations before session state exists', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
		));
		const agent: AgentCustomization = {
			type: CustomizationType.Agent,
			id: 'file:///workspace/.github/agents/reviewer.agent.md',
			uri: 'file:///workspace/.github/agents/reviewer.agent.md',
			name: 'Reviewer',
			description: 'Reviews changes',
			disableUserInvocation: true,
		};
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [agent]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items, [{
			itemKey: agent.id,
			uri: URI.parse(agent.uri),
			type: PromptsType.agent,
			name: agent.name,
			description: agent.description,
			source: AICustomizationSources.local,
			extensionId: undefined,
			pluginUri: undefined,
			enabled: true,
			userInvocable: false,
		}]);
	});

	test('surfaces draft bundle agents skills and instructions before session state exists', async () => {
		const bundleUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/bundle' });
		const workspaceAgentUri = URI.file('/workspace/.github/agents/reviewer.agent.md');
		const workspaceSkillUri = URI.file('/workspace/.github/skills/review/SKILL.md');
		const workspaceInstructionsUri = URI.file('/workspace/.github/instructions/review.instructions.md');
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(URI.joinPath(bundleUri, 'agents', 'reviewer.agent.md'), VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews changes\n---\nReview carefully.'));
		await fileService.writeFile(URI.joinPath(bundleUri, 'skills', 'review', 'SKILL.md'), VSBuffer.fromString('---\nname: Review Skill\ndescription: Reviews code\n---\nReview code.'));
		await fileService.writeFile(URI.joinPath(bundleUri, 'rules', 'review.instructions.md'), VSBuffer.fromString('---\nname: Review Instructions\ndescription: Review rules\n---\nFollow review rules.'));

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
			override getCustomizations(): readonly Customization[] {
				return [];
			}
		}

		const origins = new Map([
			[URI.joinPath(bundleUri, 'agents', 'reviewer.agent.md').toString(), workspaceAgentUri],
			[URI.joinPath(bundleUri, 'skills', 'review', 'SKILL.md').toString(), workspaceSkillUri],
			[URI.joinPath(bundleUri, 'rules', 'review.instructions.md').toString(), workspaceInstructionsUri],
		]);
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			syncedUri => {
				const uri = origins.get(syncedUri.toString());
				return uri ? { uri, source: AICustomizationSources.local } : undefined;
			},
			fileService,
			new NullLogService(),
			new TestCustomizationService(),
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [{
			type: CustomizationType.Agent,
			id: workspaceAgentUri.toString(),
			uri: workspaceAgentUri.toString(),
			name: 'Reviewer',
			description: 'Reviews changes',
		}]));
		provider.setDraftCustomizations(observableValue<readonly ClientPluginCustomization[]>('draftCustomizations', [{
			type: CustomizationType.Plugin,
			id: bundleUri.toString(),
			uri: bundleUri.toString(),
			name: 'VS Code Synced Data',
			nonce: '1',
		}]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({ type: item.type, name: item.name, uri: item.uri.toString() })), [
			{ type: PromptsType.agent, name: 'Reviewer', uri: workspaceAgentUri.toString() },
			{ type: PromptsType.instructions, name: 'Review Instructions', uri: workspaceInstructionsUri.toString() },
			{ type: PromptsType.skill, name: 'Review Skill', uri: workspaceSkillUri.toString() },
		]);
	});

	test('surfaces only the host-published winning disabled reason', async () => {
		const customizations: PluginCustomization[] = [
			{
				type: CustomizationType.Plugin,
				id: 'plugin-1',
				uri: 'file:///plugins/one',
				name: 'Plugin One',
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Global, enabled: true },
				],
			},
			{
				type: CustomizationType.Plugin,
				id: 'plugin-2',
				uri: 'file:///plugins/two',
				name: 'Plugin Two',
			},
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
		));
		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			name: item.name,
			enabled: item.enabled,
			disabledReason: item.disabledReason,
		})), [
			{
				name: 'Plugin One',
				enabled: false,
				disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session },
			},
			{
				name: 'Plugin Two',
				enabled: true,
				disabledReason: undefined,
			},
		]);
	});
});
