/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { enumerateLocalCustomizationsForHarness } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatNativeComponentsRenderer, registerChatNativeComponentsRenderer } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatNativeComponents.js';
import { ICustomizationSyncProvider } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { PromptsConfig } from '../../../../../workbench/contrib/chat/common/promptSyntax/config/config.js';
import { PromptFileSource, PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptPath, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptFilesLocator } from '../../../../../workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsChatBackgroundService } from '../../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SetChatBackgroundTool } from '../../browser/chatBackgroundTool.js';
import { GetThemeColorsTool } from '../../browser/getThemeColorsTool.js';
import { ScreenshotWindowTool } from '../../browser/screenshotWindowTool.js';
import { AgenticPromptsService, BUILTIN_SKILLS_URI } from '../../browser/promptsService.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, NEW_SESSION_ACTION_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import '../../browser/chatBackground.contribution.js';

const appearanceToolsProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING];

suite('Sessions - Appearance tools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function setup(enabled: boolean, overrideSkill?: { name: string; storage: PromptsStorage.local | PromptsStorage.user }, htmlPreviewEnabled = false) {
		const configuration = new TestConfigurationService({
			[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: enabled,
			[ChatConfiguration.HtmlPreviewEnabled]: htmlPreviewEnabled,
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
		const localSkills: (IPromptPath & { source: PromptFileSource })[] = [];
		if (overrideSkill) {
			const metadata = {
				uri: joinPath(BUILTIN_SKILLS_URI, '../../test-workspace/.github/skills', overrideSkill.name, 'SKILL.md'),
				name: overrideSkill.name,
				type: PromptsType.skill,
			};
			localSkills.push(overrideSkill.storage === PromptsStorage.local
				? { ...metadata, storage: PromptsStorage.local, source: PromptFileSource.ConfigWorkspace }
				: { ...metadata, storage: PromptsStorage.user, source: PromptFileSource.ConfigPersonal });
		}
		instantiationService.stubInstance(PromptFilesLocator, {
			createFilesUpdatedEvent: () => ({ event: Event.None, dispose: () => { } }),
			createAgentInstructionsUpdatedEvent: () => ({ event: Event.None, dispose: () => { } }),
			getSourceFoldersInDiscoveryOrder: async () => [],
			listFilesWithSource: async (type, storage) => type === PromptsType.skill
				? localSkills.filter(skill => skill.storage === storage).map(({ uri, source }) => ({ uri, source }))
				: [],
			findAgentSkills: async () => localSkills,
		});
		await Promise.all([
			...['automate', 'commit', 'generate-chat-background', 'html-preview', 'vscode-ui'].map(name => ({ name, uri: joinPath(BUILTIN_SKILLS_URI, name, 'SKILL.md') })),
			...localSkills.map(skill => ({ name: skill.name, uri: skill.uri })),
		].map(({ name, uri }) => files.writeFile(uri, VSBuffer.fromString(`---\nname: ${name}\ndescription: A test skill.\n---\nTest instructions.`))));

		const service = disposables.add(instantiationService.createInstance(AgenticPromptsService));
		const setSetting = async (key: string, value: boolean) => {
			const skillsChanged = Event.toPromise(service.onDidChangeSkills);
			const slashCommandsChanged = Event.toPromise(service.onDidChangeSlashCommands);
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: setting => setting === key,
				affectedKeys: new Set([key]),
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
		return { service, configuration, context, instantiationService, syncProvider, setEnabled: (value: boolean) => setSetting(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, value), setSetting, snapshot };
	}

	for (const initiallyEnabled of [false, true]) {
		test(`the html-preview skill follows HTML and AI settings across all discovery surfaces (initially enabled: ${initiallyEnabled})`, async () => {
			const fixture = await setup(false, undefined, initiallyEnabled);
			const visible = async () => Object.fromEntries(Object.entries(await fixture.snapshot()).map(([key, names]) => [key, names?.includes('html-preview') === true]));
			const snapshots = [await visible()];
			await fixture.setSetting(ChatConfiguration.HtmlPreviewEnabled, !initiallyEnabled);
			snapshots.push(await visible());
			await fixture.setSetting(ChatConfiguration.HtmlPreviewEnabled, true);
			snapshots.push(await visible());
			await fixture.setSetting(ChatAIDisabledSettingId, true);
			snapshots.push(await visible());
			await fixture.setSetting(ChatAIDisabledSettingId, false);
			snapshots.push(await visible());
			assert.deepStrictEqual(snapshots, [initiallyEnabled, !initiallyEnabled, true, false, true].map(enabled => ({
				skills: enabled, slashCommands: enabled, allFiles: enabled, builtinFiles: enabled, forwarded: enabled,
			})));
		});
	}

	test('the vscode-ui skill is offered only where native components render, following their setting and AI enablement', async () => {
		const fixture = await setup(false, undefined, true);
		const visible = async () => Object.fromEntries(Object.entries(await fixture.snapshot()).map(([key, names]) => [key, names?.includes('vscode-ui') === true]));
		await fixture.setSetting(ChatConfiguration.NativeComponentsEnabled, true);
		// An entry without the renderer, such as the phone bundle, would show the skill's blocks as source.
		const snapshots = [await visible()];
		disposables.add(registerChatNativeComponentsRenderer(upcastPartial<IChatNativeComponentsRenderer>({})));
		for (const [setting, value] of [
			[ChatConfiguration.NativeComponentsEnabled, false],
			[ChatConfiguration.NativeComponentsEnabled, true],
			[ChatConfiguration.HtmlPreviewEnabled, false],
			[ChatAIDisabledSettingId, true],
			[ChatAIDisabledSettingId, false],
		] as const) {
			await fixture.setSetting(setting, value);
			snapshots.push(await visible());
		}
		assert.deepStrictEqual(snapshots, [false, false, true, true, false, true].map(offered => ({
			skills: offered, slashCommands: offered, allFiles: offered, builtinFiles: offered, forwarded: offered,
		})));
	});

	for (const storage of [PromptsStorage.local, PromptsStorage.user] as const) {
		test(`an html-preview ${storage} override takes precedence without being removed by the rendering setting`, async () => {
			const fixture = await setup(false, { name: 'html-preview', storage }, true);
			const origins = async () => (await fixture.service.findAgentSkills(CancellationToken.None))?.filter(skill => skill.name === 'html-preview').map(skill => skill.storage);
			const enabled = await origins();
			await fixture.setSetting(ChatConfiguration.HtmlPreviewEnabled, false);
			assert.deepStrictEqual({ enabled, disabled: await origins() }, { enabled: [storage], disabled: [storage] });
		});
	}

	test('the html-preview skill preserves user disablement when preview rendering is toggled', async () => {
		const fixture = await setup(false, undefined, true);
		const uri = joinPath(BUILTIN_SKILLS_URI, 'html-preview', 'SKILL.md');
		const forwarded = async () => (await enumerateLocalCustomizationsForHarness(fixture.service, fixture.syncProvider, 'agent-host-copilot', CancellationToken.None, undefined))
			.filter(file => basename(dirname(file.uri)) === 'html-preview')
			.map(file => ({ uri: file.uri.toString(), disabled: file.disabled }));
		const enabled = await forwarded();
		fixture.service.setDisabledPromptFiles(PromptsType.skill, new ResourceSet([uri]));
		const disabled = await forwarded();
		await fixture.setSetting(ChatConfiguration.HtmlPreviewEnabled, false);
		const hidden = await forwarded();
		await fixture.setSetting(ChatConfiguration.HtmlPreviewEnabled, true);
		assert.deepStrictEqual({ enabled, disabled, hidden, reenabled: await forwarded() }, {
			enabled: [{ uri: uri.toString(), disabled: false }],
			disabled: [{ uri: uri.toString(), disabled: true }],
			hidden: [],
			reenabled: [{ uri: uri.toString(), disabled: true }],
		});
	});

	test('the automate skill follows automation and AI enablement across discovery, slash commands, and harness sync', async () => {
		const fixture = await setup(false);
		const visible = async () => {
			const snapshot = await fixture.snapshot();
			return Object.fromEntries(Object.entries(snapshot).map(([key, names]) => [key, names?.includes('automate') === true]));
		};
		const disabled = await visible();
		await fixture.setSetting(CHAT_AUTOMATIONS_ENABLED_SETTING, true);
		const enabled = await visible();
		await fixture.setSetting(ChatAIDisabledSettingId, true);
		const aiDisabled = await visible();
		assert.deepStrictEqual({ disabled, enabled, aiDisabled }, {
			disabled: { skills: false, slashCommands: false, allFiles: false, builtinFiles: false, forwarded: false },
			enabled: { skills: true, slashCommands: true, allFiles: true, builtinFiles: true, forwarded: true },
			aiDisabled: { skills: false, slashCommands: false, allFiles: false, builtinFiles: false, forwarded: false },
		});
	});

	test('is advanced, experiment-controlled, and disabled by default', () => {
		assert.deepStrictEqual({
			type: appearanceToolsProperty.type,
			default: appearanceToolsProperty.default,
			scope: appearanceToolsProperty.scope,
			advanced: appearanceToolsProperty.tags?.includes('advanced'),
			experiment: appearanceToolsProperty.experiment,
		}, {
			type: 'boolean',
			default: false,
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
		const t = await setup(false, { name: 'generate-chat-background', storage: PromptsStorage.local });
		const getOrigin = async () => (await t.service.findAgentSkills(CancellationToken.None))?.find(skill => skill.name === 'generate-chat-background')?.storage;
		const disabledOrigin = await getOrigin();
		await t.setEnabled(true);

		assert.deepStrictEqual({ disabledOrigin, enabledOrigin: await getOrigin() }, {
			disabledOrigin: PromptsStorage.local,
			enabledOrigin: PromptsStorage.local,
		});
	});

	test('gates all tool descriptions on the same setting', async () => {
		const t = await setup(true);
		t.instantiationService.stub(ISessionsChatBackgroundService, {});
		t.instantiationService.stub(ISessionsManagementService, {});
		IsSessionsWindowContext.bindTo(t.context).set(true);
		ChatContextKeys.enabled.bindTo(t.context).set(true);
		const tools = [
			t.instantiationService.createInstance(GetThemeColorsTool),
			t.instantiationService.createInstance(SetChatBackgroundTool, () => joinPath(BUILTIN_SKILLS_URI, 'imports')),
			t.instantiationService.createInstance(ScreenshotWindowTool),
		];
		const available = () => tools.map(tool => t.context.contextMatchesRules(tool.getToolData().when));
		const enabled = available();
		await t.setEnabled(false);
		const disabled = available();
		await t.setEnabled(true);

		assert.deepStrictEqual({ enabled, disabled, reenabled: available() }, {
			enabled: [true, true, true],
			disabled: [false, false, false],
			reenabled: [true, true, true],
		});
	});

	test('offers Generate Background before recent images and prefills a workspace-less session', async () => {
		const results = [];
		for (const scenario of [
			{ name: 'available', enabled: true, quickChatAvailable: true },
			{ name: 'appearance tools disabled', enabled: false, quickChatAvailable: true },
			{ name: 'no workspace-less target', enabled: true, quickChatAvailable: false },
		]) {
			const t = await setup(scenario.enabled);
			IsSessionsWindowContext.bindTo(t.context).set(true);
			ChatContextKeys.enabled.bindTo(t.context).set(true);
			let items: string[] = [];
			const executed: unknown[][] = [];
			t.instantiationService.stub(ISessionsChatBackgroundService, upcastPartial<ISessionsChatBackgroundService>({
				getConfiguredBackground: () => undefined,
				getRecentBackgroundImages: () => [URI.file('/backgrounds/recent.png')],
				getConfiguredBackgroundImage: () => undefined,
			}));
			t.instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				isQuickChatTargetAvailable: () => scenario.quickChatAvailable,
			}));
			t.instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
				executeCommand: async (id: string, ...args: unknown[]) => { executed.push([id, ...args]); return undefined; },
			}));
			t.instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
				pick: (async (picks: Promise<QuickPickInput<IQuickPickItem>[]> | QuickPickInput<IQuickPickItem>[]) => {
					const resolved = await picks;
					items = resolved.map(item => item.type === 'separator' ? `--- ${item.label ?? ''}` : item.label);
					return resolved.find((item): item is IQuickPickItem => item.type !== 'separator' && item.label === 'Generate Background...');
				}) as IQuickInputService['pick'],
			}));

			await t.instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.chat.changeAgentSessionsBackground')!.handler(accessor));
			results.push({ name: scenario.name, items, executed });
		}

		const backgroundTypes = ['No Background', 'Codicons', 'Koi Light', 'Koi Dark', 'Image...'];
		const recentImages = ['--- recently used', 'recent.png'];
		assert.deepStrictEqual(results, [{
			name: 'available',
			items: [...backgroundTypes, '--- ', 'Generate Background...', ...recentImages],
			executed: [[NEW_SESSION_ACTION_ID, {
				prompt: 'Generate a chat background of ',
				prefillPrompt: true,
				noWorkspace: true,
			}]],
		}, {
			name: 'appearance tools disabled',
			items: [...backgroundTypes, ...recentImages],
			executed: [],
		}, {
			name: 'no workspace-less target',
			items: [...backgroundTypes, ...recentImages],
			executed: [],
		}]);
	});
});
