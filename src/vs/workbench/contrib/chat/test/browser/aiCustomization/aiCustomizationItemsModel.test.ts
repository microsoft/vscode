/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { AICustomizationManagementSection, BUILTIN_STORAGE, IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentPluginService, type IAgentPlugin } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AICustomizationItemsModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('basics', () => {

		let disposables: DisposableStore;
		let instaService: TestInstantiationService;

		let activeHarness: ISettableObservable<string>;
		let availableHarnesses: ISettableObservable<readonly IHarnessDescriptor[]>;
		let descriptorA: IHarnessDescriptor;
		let descriptorB: IHarnessDescriptor;
		let providerA_didChange: Emitter<void>;
		let providerA_callCount: number;
		let providerA_items: ICustomizationItem[];
		let plugins: ISettableObservable<readonly IAgentPlugin[]>;

		function createDescriptor(id: string, provider: ICustomizationItemProvider): IHarnessDescriptor {
			return {
				id,
				label: id,
				icon: Codicon.settingsGear,
				getStorageSourceFilter: (): IStorageSourceFilter => ({ sources: [PromptsStorage.local, PromptsStorage.user] }),
				itemProvider: provider,
			};
		}

		setup(() => {
			disposables = new DisposableStore();
			providerA_didChange = disposables.add(new Emitter<void>());
			providerA_callCount = 0;
			providerA_items = [];

			const providerA: ICustomizationItemProvider = {
				onDidChange: providerA_didChange.event,
				provideChatSessionCustomizations: (_token: CancellationToken) => {
					providerA_callCount++;
					return Promise.resolve(providerA_items.slice());
				},
			};
			const providerB: ICustomizationItemProvider = {
				onDidChange: Event.None,
				provideChatSessionCustomizations: (_token: CancellationToken) => Promise.resolve([]),
			};
			descriptorA = createDescriptor('A', providerA);
			descriptorB = createDescriptor('B', providerB);

			activeHarness = observableValue('activeHarness', 'A');
			availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [descriptorA, descriptorB]);
			plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);

			instaService = workbenchInstantiationService({}, disposables);

			instaService.stub(IPromptsService, {
				onDidChangeCustomAgents: Event.None,
				onDidChangeSlashCommands: Event.None,
				onDidChangeSkills: Event.None,
				onDidChangeHooks: Event.None,
				onDidChangeInstructions: Event.None,
				listPromptFiles: async () => [],
				getCustomAgents: async () => [],
				findAgentSkills: async () => [],
				getHooks: async () => undefined,
				getInstructionFiles: async () => [],
				getDisabledPromptFiles: () => new ResourceSet(),
			});

			instaService.stub(IAICustomizationWorkspaceService, {
				activeProjectRoot: observableValue('test', undefined),
				getActiveProjectRoot: () => undefined,
				managementSections: [AICustomizationManagementSection.Agents],
				isSessionsWindow: false,
				welcomePageFeatures: { showGettingStartedBanner: false },
				getStorageSourceFilter: () => ({ sources: [] }),
				getSkillUIIntegrations: () => new Map(),
				hasOverrideProjectRoot: observableValue('test', false),
				commitFiles: async () => { },
				deleteFiles: async () => { },
				generateCustomization: async () => { },
				setOverrideProjectRoot: () => { },
				clearOverrideProjectRoot: () => { },
			});

			instaService.stub(ICustomizationHarnessService, {
				activeHarness,
				availableHarnesses,
				setActiveHarness: (id: string) => activeHarness.set(id, undefined),
				getStorageSourceFilter: () => ({ sources: [] }),
				getActiveDescriptor: () => availableHarnesses.get().find(d => d.id === activeHarness.get())!,
				findHarnessById: (id: string) => availableHarnesses.get().find(d => d.id === id),
				registerExternalHarness: () => ({ dispose() { } }),
			});

			instaService.stub(IAgentPluginService, {
				plugins,
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					setEnabled: () => { },
					remove: () => { },
				},
			});
		});

		function createLocalPlugin(name: string): IAgentPlugin {
			return {
				uri: URI.parse(`plugin-test://${name}`),
				label: name,
				enablement: observableValue('pluginEnablement', ContributionEnablementState.EnabledProfile),
				remove: () => { },
				hooks: observableValue('pluginHooks', []),
				commands: observableValue('pluginCommands', []),
				skills: observableValue('pluginSkills', []),
				agents: observableValue('pluginAgents', []),
				instructions: observableValue('pluginInstructions', []),
				mcpServerDefinitions: observableValue('pluginMcpServerDefinitions', []),
			};
		}

		teardown(() => disposables.dispose());

		test('exposes per-section observables for all prompts-based sections', () => {
			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			assert.ok(model.getItems(AICustomizationManagementSection.Agents));
			assert.ok(model.getItems(AICustomizationManagementSection.Skills));
			assert.ok(model.getItems(AICustomizationManagementSection.Instructions));
			assert.ok(model.getItems(AICustomizationManagementSection.Prompts));
			assert.ok(model.getItems(AICustomizationManagementSection.Hooks));
		});

		test('does not fetch on construction (lazy)', async () => {
			disposables.add(instaService.createInstance(AICustomizationItemsModel));
			await timeout(0);
			assert.strictEqual(providerA_callCount, 0);
		});

		test('first read of a section triggers a fetch', async () => {
			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			model.getItems(AICustomizationManagementSection.Agents);
			await timeout(0);
			assert.strictEqual(providerA_callCount, 1);
			// Reading a different section triggers a separate fetch for that section only.
			model.getItems(AICustomizationManagementSection.Skills);
			await timeout(0);
			assert.strictEqual(providerA_callCount, 2);
		});

		test('source.onDidChange refetches only previously-observed sections', async () => {
			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			model.getItems(AICustomizationManagementSection.Agents);
			await timeout(0);
			const before = providerA_callCount;
			providerA_didChange.fire();
			await timeout(0);
			// One refetch for the one observed section — not 5.
			assert.strictEqual(providerA_callCount, before + 1);
		});

		test('switching harness re-binds and refetches observed sections', async () => {
			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			model.getItems(AICustomizationManagementSection.Agents);
			await timeout(0);
			const sourceA = model.getActiveItemSource();
			activeHarness.set('B', undefined);
			await timeout(0);
			const sourceB = model.getActiveItemSource();
			assert.notStrictEqual(sourceA, sourceB);
		});

		test('source cache is keyed by descriptor identity (not id) — re-registration produces a fresh source', async () => {
			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			model.getItems(AICustomizationManagementSection.Agents);
			await timeout(0);
			const sourceA1 = model.getActiveItemSource();

			// Replace descriptor A with a fresh descriptor that re-uses the same id.
			const replacementProvider: ICustomizationItemProvider = {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
			};
			const replacementA = createDescriptor('A', replacementProvider);
			availableHarnesses.set([replacementA, descriptorB], undefined);
			await timeout(0);

			const sourceA2 = model.getActiveItemSource();
			assert.notStrictEqual(sourceA1, sourceA2);
		});

		test('preserves provider-supplied plugin storage when pluginUri is omitted', async () => {
			providerA_items = [{
				uri: URI.parse('agent-host://test-authority/plugins/my-plugin/skills/my-skill/SKILL.md'),
				type: PromptsType.skill,
				name: 'My Skill',
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: true,
			}];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const items = model.getItems(AICustomizationManagementSection.Skills);
			await model.whenSectionLoaded(AICustomizationManagementSection.Skills);

			assert.deepStrictEqual(items.get().map(item => ({
				name: item.name,
				storage: item.storage,
			})), [{
				name: 'My Skill',
				storage: PromptsStorage.plugin,
			}]);
		});

		test('preserves provider-supplied builtin storage when groupKey is omitted', async () => {
			providerA_items = [{
				uri: URI.parse('agent-host://test-authority/builtin/skills/github/SKILL.md'),
				type: PromptsType.skill,
				name: 'Built-in Skill',
				storage: BUILTIN_STORAGE as unknown as PromptsStorage,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: true,
			}];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const items = model.getItems(AICustomizationManagementSection.Skills);
			await model.whenSectionLoaded(AICustomizationManagementSection.Skills);

			assert.deepStrictEqual(items.get().map(item => ({
				name: item.name,
				storage: item.storage,
				groupKey: item.groupKey,
				isBuiltin: item.isBuiltin,
			})), [{
				name: 'Built-in Skill',
				storage: BUILTIN_STORAGE,
				groupKey: BUILTIN_STORAGE,
				isBuiltin: true,
			}]);
		});

		test('preserves builtin grouping when only groupKey is set (no storage/extensionId/pluginUri)', async () => {
			// Repro of "Agents app built-in shown as User": the Agents app
			// customization provider declares its built-in agents only via
			// `groupKey: BUILTIN_STORAGE` — without `storage`, `extensionId`,
			// `pluginUri`, or a workspace-anchored URI. The URI-sniffing
			// fallback in the normalizer must preserve groupKey/isBuiltin so
			// the list widget renders them under "Built-in" instead of "User".
			providerA_items = [{
				uri: URI.parse('agent-app://builtin/coder.agent.md'),
				type: PromptsType.agent,
				name: 'Coder',
				groupKey: BUILTIN_STORAGE,
				enabled: true,
				extensionId: undefined,
				pluginUri: undefined,
			}];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const items = model.getItems(AICustomizationManagementSection.Agents);
			await model.whenSectionLoaded(AICustomizationManagementSection.Agents);

			assert.deepStrictEqual(items.get().map(item => ({
				name: item.name,
				groupKey: item.groupKey,
				isBuiltin: item.isBuiltin,
			})), [{
				name: 'Coder',
				groupKey: BUILTIN_STORAGE,
				isBuiltin: true,
			}]);
		});

		test('plugin count includes provider-supplied plugin items', async () => {
			providerA_items = [
				{
					uri: URI.parse('agent-host://test-authority/plugins/remote-one'),
					type: 'plugin',
					name: 'Remote One',
					storage: PromptsStorage.plugin,
					extensionId: undefined,
					pluginUri: undefined,
					userInvocable: undefined,
				},
				{
					uri: URI.parse('agent-host://test-authority/plugins/remote-two'),
					type: AICustomizationManagementSection.Plugins,
					name: 'Remote Two',
					storage: PromptsStorage.plugin,
					extensionId: undefined,
					pluginUri: undefined,
					userInvocable: undefined,
				},
				{
					uri: URI.parse('agent-host://test-authority/plugins/remote-two/skills/my-skill/SKILL.md'),
					type: PromptsType.skill,
					name: 'My Skill',
					storage: PromptsStorage.plugin,
					extensionId: undefined,
					pluginUri: undefined,
					userInvocable: true,
				},
				{
					uri: URI.parse('agent-host://test-authority/plugins/local-synced'),
					type: 'plugin',
					name: 'Local Synced',
					storage: PromptsStorage.plugin,
					groupKey: 'remote-client',
					extensionId: undefined,
					pluginUri: undefined,
					userInvocable: undefined,
				},
			];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);

			assert.strictEqual(count.get(), 2);
		});

		test('local plugin changes update plugin count without refetching provider customizations', async () => {
			providerA_items = [{
				uri: URI.parse('agent-host://test-authority/plugins/remote-one'),
				type: 'plugin',
				name: 'Remote One',
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: undefined,
			}];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);
			const callsAfterInitialCount = providerA_callCount;

			plugins.set([createLocalPlugin('local-one')], undefined);
			await timeout(0);

			assert.deepStrictEqual({
				count: count.get(),
				providerA_callCount,
			}, {
				count: 2,
				providerA_callCount: callsAfterInitialCount,
			});
		});

		test('plugin count dedupes provider plugins that are also installed locally', async () => {
			providerA_items = [{
				uri: URI.parse('agent-host://test-authority/plugins/model-council'),
				type: 'plugin',
				name: 'model-council',
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: undefined,
			}];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);
			assert.strictEqual(count.get(), 1, 'before local install: only the harness-reported plugin counts');

			plugins.set([createLocalPlugin('model-council')], undefined);
			await timeout(0);

			assert.strictEqual(count.get(), 1, 'after local install: harness duplicate is folded into the local count');
		});
	});

	suite('data sources', () => {

		let disposables: DisposableStore;
		let instaService: TestInstantiationService;

		let providerDidChange: Emitter<void>;
		let providerItems: ICustomizationItem[];
		let plugins: ISettableObservable<readonly IAgentPlugin[]>;

		setup(() => {
			disposables = new DisposableStore();
			providerDidChange = disposables.add(new Emitter<void>());
			providerItems = [];
			plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);

			const provider: ICustomizationItemProvider = {
				onDidChange: providerDidChange.event,
				provideChatSessionCustomizations: (_token: CancellationToken) => Promise.resolve(providerItems.slice()),
			};
			const descriptor: IHarnessDescriptor = {
				id: 'A',
				label: 'A',
				icon: Codicon.settingsGear,
				getStorageSourceFilter: (): IStorageSourceFilter => ({ sources: [PromptsStorage.local, PromptsStorage.user] }),
				itemProvider: provider,
			};
			const activeHarness = observableValue('activeHarness', 'A');
			const availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [descriptor]);

			instaService = workbenchInstantiationService({}, disposables);
			instaService.stub(IPromptsService, {
				onDidChangeCustomAgents: Event.None,
				onDidChangeSlashCommands: Event.None,
				onDidChangeSkills: Event.None,
				onDidChangeHooks: Event.None,
				onDidChangeInstructions: Event.None,
				listPromptFiles: async () => [],
				getCustomAgents: async () => [],
				findAgentSkills: async () => [],
				getHooks: async () => undefined,
				getInstructionFiles: async () => [],
				getDisabledPromptFiles: () => new ResourceSet(),
			});
			instaService.stub(IAICustomizationWorkspaceService, {
				activeProjectRoot: observableValue('test', undefined),
				getActiveProjectRoot: () => undefined,
				managementSections: [AICustomizationManagementSection.Agents],
				isSessionsWindow: false,
				welcomePageFeatures: { showGettingStartedBanner: false },
				getStorageSourceFilter: () => ({ sources: [] }),
				getSkillUIIntegrations: () => new Map(),
				hasOverrideProjectRoot: observableValue('test', false),
				commitFiles: async () => { },
				deleteFiles: async () => { },
				generateCustomization: async () => { },
				setOverrideProjectRoot: () => { },
				clearOverrideProjectRoot: () => { },
			});
			instaService.stub(ICustomizationHarnessService, {
				activeHarness,
				availableHarnesses,
				setActiveHarness: (id: string) => activeHarness.set(id, undefined),
				getStorageSourceFilter: () => ({ sources: [] }),
				getActiveDescriptor: () => availableHarnesses.get().find(d => d.id === activeHarness.get())!,
				findHarnessById: (id: string) => availableHarnesses.get().find(d => d.id === id),
				registerExternalHarness: () => ({ dispose() { } }),
			});
			instaService.stub(IAgentPluginService, {
				plugins,
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					setEnabled: () => { },
					remove: () => { },
				},
			});
		});

		teardown(() => disposables.dispose());

		function localPlugin(name: string): IAgentPlugin {
			return {
				uri: URI.parse(`plugin-test://${name}`),
				label: name,
				enablement: observableValue('pluginEnablement', ContributionEnablementState.EnabledProfile),
				remove: () => { },
				hooks: observableValue('pluginHooks', []),
				commands: observableValue('pluginCommands', []),
				skills: observableValue('pluginSkills', []),
				agents: observableValue('pluginAgents', []),
				instructions: observableValue('pluginInstructions', []),
				mcpServerDefinitions: observableValue('pluginMcpServerDefinitions', []),
			};
		}

		function harnessPluginRow(name: string, overrides: Partial<ICustomizationItem> = {}): ICustomizationItem {
			return {
				uri: URI.parse(`agent-host://t/plugins/${name}`),
				type: 'plugin',
				name,
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: undefined,
				...overrides,
			};
		}

		function providerSkill(name: string, uri: string = `agent-host://t/skills/${name}/SKILL.md`): ICustomizationItem {
			return {
				uri: URI.parse(uri),
				type: PromptsType.skill,
				name,
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: true,
			};
		}

		function providerOfType(type: PromptsType, name: string): ICustomizationItem {
			return {
				uri: URI.parse(`agent-host://t/${type}/${name}`),
				type,
				name,
				// Hooks pre-expanded items are kept under `plugin` storage; using
				// plugin storage uniformly avoids the file-system expansion path
				// in tests for non-hook types as well.
				storage: PromptsStorage.plugin,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: true,
			};
		}

		const sectionsByType = [
			[AICustomizationManagementSection.Agents, PromptsType.agent],
			[AICustomizationManagementSection.Skills, PromptsType.skill],
			[AICustomizationManagementSection.Instructions, PromptsType.instructions],
			[AICustomizationManagementSection.Prompts, PromptsType.prompt],
			[AICustomizationManagementSection.Hooks, PromptsType.hook],
		] as const;

		for (const [section, type] of sectionsByType) {
			test(`getCount(${section}) mirrors provider items filtered by type=${type}`, async () => {
				providerItems = [
					providerOfType(type, 'a'),
					providerOfType(type, 'b'),
					providerOfType(PromptsType.agent, 'unrelated-1'),
					providerOfType(PromptsType.skill, 'unrelated-2'),
				];

				const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
				const count = model.getCount(section);
				await model.whenSectionLoaded(section);

				const expected = providerItems.filter(i => i.type === type).length;
				assert.strictEqual(count.get(), expected, `${section} count should equal provider items where type === ${type}`);
			});
		}

		test('getCount reacts to provider onDidChange for observed sections', async () => {
			providerItems = [providerSkill('one')];

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getCount(AICustomizationManagementSection.Skills);
			await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
			assert.strictEqual(count.get(), 1, 'initial fetch reflects provider state');

			providerItems = [providerSkill('one'), providerSkill('two')];
			providerDidChange.fire();
			await timeout(0);

			assert.strictEqual(count.get(), 2, 'count refetches after provider change');
		});

		test('getPluginCount returns local plugin count when harness has no plugin rows', async () => {
			providerItems = [providerSkill('not-a-plugin-row')];
			plugins.set([localPlugin('local-a'), localPlugin('local-b')], undefined);

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);

			assert.strictEqual(count.get(), 2, 'plugin count uses local plugins when the harness exposes none');
		});

		test('getPluginCount returns harness plugin row count when no local plugins are installed', async () => {
			providerItems = [
				harnessPluginRow('x'),
				harnessPluginRow('y', { type: AICustomizationManagementSection.Plugins }),
				harnessPluginRow('synced', { groupKey: 'remote-client' }),
			];
			plugins.set([], undefined);

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);

			assert.strictEqual(count.get(), 2, 'remote-client harness rows are excluded; both internal "plugin" and API "plugins" types are recognised');
		});

		test('getPluginCount sums local plugins and unique harness plugin rows', async () => {
			providerItems = [
				harnessPluginRow('dup'),
				harnessPluginRow('uniq'),
			];
			plugins.set([localPlugin('dup'), localPlugin('local-only')], undefined);

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);

			assert.strictEqual(count.get(), 3, 'dup is counted once via the local source; uniq adds, local-only adds');
		});

		test('getPluginCount dedups against URI basename when local plugin label is empty', async () => {
			// Mirrors PluginListWidget: when an installed plugin has no label
			// (`label === ''`), the editor renders it under `basename(plugin.uri)`
			// and dedups remote rows against that. The model must use the same
			// fallback or the sidebar count drifts above the editor count.
			providerItems = [harnessPluginRow('basename-match')];
			const labelless: IAgentPlugin = {
				...localPlugin('basename-match'),
				uri: URI.parse('plugin-test:///basename-match'),
				label: '',
			};
			plugins.set([labelless], undefined);

			const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
			const count = model.getPluginCount();
			await timeout(0);

			assert.strictEqual(count.get(), 1, 'remote row is folded into the labelless local plugin via basename');
		});
	});
});
