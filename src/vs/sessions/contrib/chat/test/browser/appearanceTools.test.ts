/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { enumerateLocalCustomizationsForHarness } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomizationSyncProvider } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { PromptsConfig } from '../../../../../workbench/contrib/chat/common/promptSyntax/config/config.js';
import { PromptFileSource, PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILocalPromptPath, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptFilesLocator } from '../../../../../workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SetChatBackgroundTool } from '../../browser/chatBackgroundTool.js';
import { GetThemeColorsTool } from '../../browser/getThemeColorsTool.js';
import { AgenticPromptsService, BUILTIN_SKILLS_URI } from '../../browser/promptsService.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../common/constants.js';
import '../../browser/chat.contribution.js';

const appearanceToolsProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING];

suite('Sessions - Appearance tools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function setup(enabled: boolean, workspaceSkill = false) {
		const configuration = new TestConfigurationService({
			[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: enabled,
			[PromptsConfig.USE_AGENT_SKILLS]: true,
		});
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const files = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(files.registerProvider(BUILTIN_SKILLS_URI.scheme, provider));
		if (/^\/[a-z]:\//i.test(BUILTIN_SKILLS_URI.path)) {
			await provider.mkdir(BUILTIN_SKILLS_URI.with({ scheme: Schemas.inMemory, path: BUILTIN_SKILLS_URI.path.slice(0, 3) }));
		}
		const context = disposables.add(new ContextKeyService(configuration));
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configuration,
			fileService: () => files,
			contextKeyService: () => context,
		}, disposables);
		instantiationService.stub(IAgentPluginService, { plugins: constObservable([]) });
		const localSkills: ILocalPromptPath[] = workspaceSkill ? [{
			uri: joinPath(BUILTIN_SKILLS_URI, '../../test-workspace/.github/skills/generate-chat-background/SKILL.md'),
			name: 'generate-chat-background',
			storage: PromptsStorage.local,
			type: PromptsType.skill,
			source: PromptFileSource.ConfigWorkspace,
		}] : [];
		instantiationService.stubInstance(PromptFilesLocator, {
			createFilesUpdatedEvent: () => ({ event: Event.None, dispose: () => { } }),
			createAgentInstructionsUpdatedEvent: () => ({ event: Event.None, dispose: () => { } }),
			getSourceFoldersInDiscoveryOrder: async () => [],
			listFilesWithSource: async (type, storage) => type === PromptsType.skill && storage === PromptsStorage.local
				? localSkills.map(({ uri }) => ({ uri, source: PromptFileSource.ConfigWorkspace }))
				: [],
			findAgentSkills: async () => localSkills,
		});
		await Promise.all([
			...['commit', 'generate-chat-background'].map(name => ({ name, uri: joinPath(BUILTIN_SKILLS_URI, name, 'SKILL.md') })),
			...localSkills.map(skill => ({ name: 'generate-chat-background', uri: skill.uri })),
		].map(({ name, uri }) => files.writeFile(uri, VSBuffer.fromString(`---\nname: ${name}\ndescription: A test skill.\n---\nTest instructions.`))));

		const service = disposables.add(instantiationService.createInstance(AgenticPromptsService));
		const setEnabled = async (value: boolean) => {
			const skillsChanged = Event.toPromise(service.onDidChangeSkills);
			const slashCommandsChanged = Event.toPromise(service.onDidChangeSlashCommands);
			await configuration.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING,
				affectedKeys: new Set([AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]),
			}));
			await Promise.all([skillsChanged, slashCommandsChanged]);
		};
		const syncProvider = upcastPartial<ICustomizationSyncProvider>({ isDisabled: () => false });
		const snapshot = async () => ({
			skills: (await service.findAgentSkills(CancellationToken.None))?.map(skill => skill.name).sort(),
			slashCommands: (await service.getPromptSlashCommands(CancellationToken.None)).map(command => command.name).sort(),
			allFiles: (await service.listPromptFiles(PromptsType.skill, CancellationToken.None)).map(file => basename(dirname(file.uri))).sort(),
			builtinFiles: (await service.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, CancellationToken.None)).map(file => file.name).sort(),
			forwarded: (await enumerateLocalCustomizationsForHarness(service, syncProvider, 'agent-host-copilot', CancellationToken.None, undefined)).map(file => basename(dirname(file.uri))).sort(),
		});
		return { service, configuration, context, instantiationService, setEnabled, snapshot };
	}

	test('is advanced, experiment-controlled, and enabled by default', () => {
		assert.deepStrictEqual({
			type: appearanceToolsProperty.type,
			default: appearanceToolsProperty.default,
			scope: appearanceToolsProperty.scope,
			advanced: appearanceToolsProperty.tags?.includes('advanced'),
			experiment: appearanceToolsProperty.experiment,
		}, {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			advanced: true,
			experiment: { mode: 'auto' },
		});
	});

	for (const initiallyEnabled of [true, false]) {
		test(`updates all built-in skill discovery surfaces without a reload (initially enabled: ${initiallyEnabled})`, async () => {
			const t = await setup(initiallyEnabled);
			const snapshots = [await t.snapshot()];
			await t.setEnabled(!initiallyEnabled);
			snapshots.push(await t.snapshot());
			await t.setEnabled(initiallyEnabled);
			snapshots.push(await t.snapshot());

			assert.deepStrictEqual(snapshots, [initiallyEnabled, !initiallyEnabled, initiallyEnabled].map(enabled => {
				const names = enabled ? ['commit', 'generate-chat-background'] : ['commit'];
				return { skills: names, slashCommands: names, allFiles: names, builtinFiles: names, forwarded: names };
			}));
		});
	}

	test('does not suppress a workspace skill with the same name', async () => {
		const t = await setup(false, true);
		const getOrigin = async () => (await t.service.findAgentSkills(CancellationToken.None))?.find(skill => skill.name === 'generate-chat-background')?.storage;
		const disabledOrigin = await getOrigin();
		await t.setEnabled(true);

		assert.deepStrictEqual({ disabledOrigin, enabledOrigin: await getOrigin() }, {
			disabledOrigin: PromptsStorage.local,
			enabledOrigin: PromptsStorage.local,
		});
	});

	test('gates both tool descriptions on the same setting', async () => {
		const t = await setup(true);
		t.instantiationService.stub(ISessionsChatBackgroundService, {});
		t.instantiationService.stub(ISessionsManagementService, {});
		IsSessionsWindowContext.bindTo(t.context).set(true);
		ChatContextKeys.enabled.bindTo(t.context).set(true);
		const tools = [
			t.instantiationService.createInstance(GetThemeColorsTool),
			t.instantiationService.createInstance(SetChatBackgroundTool, () => joinPath(BUILTIN_SKILLS_URI, 'imports')),
		];
		const available = () => tools.map(tool => t.context.contextMatchesRules(tool.getToolData().when));
		const enabled = available();
		await t.setEnabled(false);
		const disabled = available();
		await t.setEnabled(true);

		assert.deepStrictEqual({ enabled, disabled, reenabled: available() }, {
			enabled: [true, true],
			disabled: [false, false],
			reenabled: [true, true],
		});
	});
});
