/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { CustomizationType, type ClientPluginCustomization, type Customization, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';

function makePromptsService(): IPromptsService {
	return upcastPartial<IPromptsService>({
		onDidChangeSkills: Event.None,
		getDisabledPromptFiles: () => new ResourceSet(),
		listPromptFilesForStorage: async () => [],
	});
}

suite('AgentCustomizationItemProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
			makePromptsService(),
		));
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

	test('surfaces session agents through directory customizations', async () => {
		const agentUri = 'file:///workspace/.github/agents/reviewer.agent.md';
		const customizations: Customization[] = [{
			type: CustomizationType.Directory,
			id: 'workspace-agents',
			uri: 'file:///workspace/.github/agents',
			name: 'Workspace Agents',
			enabled: true,
			contents: CustomizationType.Agent,
			writable: true,
			children: [{
				type: CustomizationType.Agent,
				id: agentUri,
				uri: agentUri,
				name: 'Reviewer',
				description: 'Reviews changes',
			}],
		}];

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
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
			makePromptsService(),
		));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			type: item.type,
			name: item.name,
			uri: item.uri.toString(),
			source: item.source,
			enabled: item.enabled,
		})), [{
			type: PromptsType.agent,
			name: 'Reviewer',
			uri: agentUri,
			source: AICustomizationSources.local,
			enabled: true,
		}]);
	});

	test('overrides a stale enabled provider row when its built-in skill is user-disabled', async () => {
		const bundleUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/bundle' });
		const bundledSkillUri = URI.joinPath(bundleUri, 'skills', 'create-pr', 'SKILL.md');
		const builtinSkillUri = URI.file('/builtin/create-pr/SKILL.md');
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(bundledSkillUri, VSBuffer.fromString('---\nname: create-pr\ndescription: Create a pull request.\n---\nCreate it.'));
		const promptsService = upcastPartial<IPromptsService>({
			onDidChangeSkills: Event.None,
			getDisabledPromptFiles: () => new ResourceSet([builtinSkillUri]),
			listPromptFilesForStorage: async () => [{
				uri: builtinSkillUri,
				type: PromptsType.skill,
				storage: PromptsStorage.builtIn,
				name: 'create-pr',
				description: 'Create a pull request.',
			} as IPromptPath],
		});
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			syncedUri => syncedUri.toString() === bundledSkillUri.toString()
				? { uri: builtinSkillUri, source: AICustomizationSources.builtin }
				: undefined,
			fileService,
			new NullLogService(),
			new NullAgentHostCustomizationService(),
			promptsService,
		));
		provider.setDraftCustomizations(observableValue<readonly ClientPluginCustomization[]>('draftCustomizations', [{
			type: CustomizationType.Plugin,
			id: bundleUri.toString(),
			uri: bundleUri.toString(),
			name: 'VS Code Synced Data',
			nonce: '1',
		}]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			uri: item.uri.toString(),
			type: item.type,
			source: item.source,
			enabled: item.enabled,
		})), [{
			uri: builtinSkillUri.toString(),
			type: PromptsType.skill,
			source: AICustomizationSources.builtin,
			enabled: false,
		}]);
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
			makePromptsService(),
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

	test('supplements provider output with user-disabled built-in skills', async () => {
		const disabledSkill = URI.file('/builtin/create-pr/SKILL.md');
		let disabledPromptFiles = new ResourceSet([disabledSkill]);
		const onDidChangeSkills = disposables.add(new Emitter<void>());
		const promptsService = upcastPartial<IPromptsService>({
			onDidChangeSkills: onDidChangeSkills.event,
			getDisabledPromptFiles: () => disabledPromptFiles,
			listPromptFilesForStorage: async (type: PromptsType, storage: PromptsStorage) => type === PromptsType.skill && storage === PromptsStorage.builtIn
				? [{ uri: disabledSkill, type, storage, name: 'create-pr', description: 'Create a pull request.' } satisfies IPromptPath]
				: [],
		});
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new NullAgentHostCustomizationService(),
			promptsService,
		));
		let changeCount = 0;
		disposables.add(provider.onDidChange(() => changeCount++));

		const disabledItems = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);
		disabledPromptFiles = new ResourceSet();
		onDidChangeSkills.fire();
		const enabledItems = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual({
			disabledItems: disabledItems.map(item => ({
				uri: item.uri.toString(),
				type: item.type,
				name: item.name,
				source: item.source,
				enabled: item.enabled,
			})),
			changeCount,
			enabledItems,
		}, {
			disabledItems: [{
				uri: disabledSkill.toString(),
				type: PromptsType.skill,
				name: 'create-pr',
				source: AICustomizationSources.builtin,
				enabled: false,
			}],
			changeCount: 1,
			enabledItems: [],
		});
	});
});
