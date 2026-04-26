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
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

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
				plugins: observableValue('test', []),
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					setEnabled: () => { },
					remove: () => { },
				},
			});
		});

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
	});
});
