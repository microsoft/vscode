/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ProviderCustomizationItemSource, AICustomizationItemNormalizer } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { computeItemEnablementKeys } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationEnablementHandler, ICustomizationItem, ICustomizationItemProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';

suite('aiCustomizationDisablement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const agentUri = URI.file('/workspace/.github/agents/my-agent.md');
	const skillUri = URI.file('/workspace/.github/skills/my-skill/SKILL.md');
	const instructionUri = URI.file('/workspace/.github/instructions/my-rule.instructions.md');

	function createMockPromptsService(): IPromptsService {
		const disabledSets = new Map<string, ResourceSet>();
		return {
			onDidChangeCustomAgents: Event.None,
			onDidChangeSlashCommands: Event.None,
			onDidChangeSkills: Event.None,
			onDidChangeHooks: Event.None,
			onDidChangeInstructions: Event.None,
			listPromptFiles: async () => [],
			listPromptFilesForStorage: async () => [] as { uri: URI; name?: string; description?: string }[],
			getCustomAgents: async () => [],
			findAgentSkills: async () => [],
			getHooks: async () => undefined,
			getInstructionFiles: async () => [],
			getDisabledPromptFiles: (type: PromptsType): ResourceSet => {
				return new ResourceSet([...(disabledSets.get(type) ?? [])]);
			},
			getDisabledPromptFilesForScope: (type: PromptsType, _scope: StorageScope): ResourceSet => {
				return new ResourceSet([...(disabledSets.get(type) ?? [])]);
			},
			setDisabledPromptFiles: (type: PromptsType, uris: ResourceSet, _scope?: StorageScope): void => {
				disabledSets.set(type, new ResourceSet([...uris]));
			},
		} as unknown as IPromptsService;
	}

	function createMockEnablementHandler(): ICustomizationEnablementHandler {
		const disabledSets = new Map<string, ResourceSet>();
		return {
			handleCustomizationEnablement(uri: URI, type: PromptsType, enabled: boolean, _scope: string): void {
				let set = disabledSets.get(type);
				if (!set) {
					set = new ResourceSet();
					disabledSets.set(type, set);
				}
				if (enabled) {
					set.delete(uri);
				} else {
					set.add(uri);
				}
			},
		};
	}

	function createMockItemProvider(items: ICustomizationItem[]): ICustomizationItemProvider {
		return {
			onDidChange: Event.None,
			provideChatSessionCustomizations: async () => items,
		};
	}

	function createItemNormalizer(): AICustomizationItemNormalizer {
		return new AICustomizationItemNormalizer(
			{ getWorkspace: () => ({ folders: [{ uri: URI.file('/workspace') }] }) } as unknown as IWorkspaceContextService,
			{ getActiveProjectRoot: () => URI.file('/workspace'), getSkillUIIntegrations: () => new Map(), isSessionsWindow: false } as unknown as IAICustomizationWorkspaceService,
			{ getUriLabel: (uri: URI, opts?: { relative?: boolean }) => opts?.relative ? uri.path.replace('/workspace/', '') : uri.path } as unknown as ILabelService,
			{ plugins: observableValue('test', []) } as unknown as IAgentPluginService,
			{ quality: 'insider' } as unknown as IProductService,
		);
	}

	function createItemSource(opts: {
		harnessId: string;
		itemProvider?: ICustomizationItemProvider;
		enablementHandler?: ICustomizationEnablementHandler;
		promptsService?: IPromptsService;
		/** Whether the harness has a natively-provided item provider (external harness). Defaults to true when enablementHandler is set. */
		hasNativeItemProvider?: boolean;
	}): ProviderCustomizationItemSource {
		const ps = opts.promptsService ?? createMockPromptsService();
		const hasNative = opts.hasNativeItemProvider ?? !!opts.enablementHandler;
		return new ProviderCustomizationItemSource(
			opts.itemProvider,
			undefined,
			ps,
			{ getActiveProjectRoot: () => URI.file('/workspace'), getSkillUIIntegrations: () => new Map(), isSessionsWindow: false } as unknown as IAICustomizationWorkspaceService,
			{ stat: async () => { throw new Error('not found'); } } as unknown as IFileService,
			{ userHome: async () => URI.file('/home/user') } as unknown as IPathService,
			createItemNormalizer(),
			hasNative,
		);
	}

	suite('item enablementScope assignment', () => {

		test('API items with explicit enablementScope preserve it', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'API Agent', enablementScope: 'global',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].enablementScope, 'global');
		});

		test('API items without enablementScope remain non-disableable', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'API Agent',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].enablementScope, undefined);
		});

		test('VS Code items with enablementScope: workspace preserve it', async () => {
			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Local Agent',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].enablementScope, 'workspace');
		});
	});

	suite('disabled state overlay - API items', () => {

		test('provider item with enabled:false shows as disabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Agent', enablementScope: 'workspace',
					enabled: false,
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].disabled, true);
		});

		test('not in enablementHandler disabled set shows as enabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Agent', enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].disabled, false);
		});

		test('NOT affected by promptsService disabled state for external harness', async () => {
			const ps = createMockPromptsService();
			const disabled = new ResourceSet();
			disabled.add(agentUri);
			ps.setDisabledPromptFiles(PromptsType.agent, disabled, StorageScope.PROFILE);

			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Agent', enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
				promptsService: ps,
			});

			// External harness ignores promptsService disabled state — uses provider's enabled field
			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].disabled, false);
		});
	});

	suite('disabled state overlay - external harness provider items', () => {

		test('provider item with enabled:false shows as disabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: skillUri, type: PromptsType.skill, name: 'Skill',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					enabled: false,
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.skill);
			assert.strictEqual(result[0].disabled, true);
		});

		test('provider item with enabled:true shows as enabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: skillUri, type: PromptsType.skill, name: 'Skill',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					enabled: true,
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.skill);
			assert.strictEqual(result[0].disabled, false);
		});

		test('provider item without enabled field shows as enabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: skillUri, type: PromptsType.skill, name: 'Skill',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.skill);
			assert.strictEqual(result[0].disabled, false);
		});
	});

	suite('VS Code harness', () => {

		test('reads disabled state from promptsService', async () => {
			const ps = createMockPromptsService();
			const disabled = new ResourceSet();
			disabled.add(agentUri);
			ps.setDisabledPromptFiles(PromptsType.agent, disabled, StorageScope.PROFILE);

			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Agent',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				promptsService: ps,
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].disabled, true);
		});
	});

	suite('harness isolation', () => {

		test('external harness disablement via provider enabled:false does not affect VS Code harness', async () => {
			const items: ICustomizationItem[] = [{
				uri: instructionUri, type: PromptsType.instructions, name: 'Rule',
				storage: PromptsStorage.local, enablementScope: 'workspace',
				extensionId: undefined,
				pluginUri: undefined
			}];

			// External harness reports item as disabled via enabled:false
			const cliSource = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{ ...items[0], enabled: false }]),
				enablementHandler: createMockEnablementHandler(),
			});
			assert.strictEqual((await cliSource.fetchItems(PromptsType.instructions))[0].disabled, true);

			// VS Code harness is not affected — it reads from promptsService
			const vscodeSource = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider(items),
			});
			assert.strictEqual((await vscodeSource.fetchItems(PromptsType.instructions))[0].disabled, false);
		});
	});

	suite('mixed API and VS Code items', () => {

		test('API disabled, VS Code enabled', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([
					{
						uri: agentUri, type: PromptsType.agent, name: 'API Agent', enablementScope: 'global', enabled: false,
						extensionId: undefined,
						pluginUri: undefined
					},
					{
						uri: skillUri, type: PromptsType.agent, name: 'VS Code Agent', storage: PromptsStorage.local, enablementScope: 'workspace',
						extensionId: undefined,
						pluginUri: undefined
					},
				]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.deepStrictEqual(
				result.map(i => ({ name: i.name, disabled: i.disabled })),
				[
					{ name: 'API Agent', disabled: true },
					{ name: 'VS Code Agent', disabled: false },
				],
			);
		});

		test('API enabled, VS Code disabled via provider', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([
					{
						uri: agentUri, type: PromptsType.agent, name: 'API Agent', enablementScope: 'global',
						extensionId: undefined,
						pluginUri: undefined
					},
					{
						uri: skillUri, type: PromptsType.agent, name: 'VS Code Agent', storage: PromptsStorage.local, enablementScope: 'workspace', enabled: false,
						extensionId: undefined,
						pluginUri: undefined
					},
				]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.deepStrictEqual(
				result.map(i => ({ name: i.name, disabled: i.disabled })),
				[
					{ name: 'API Agent', disabled: false },
					{ name: 'VS Code Agent', disabled: true },
				],
			);
		});
	});

	suite('builtin skill merging', () => {

		test('builtin skills get enablementScope: workspace', async () => {
			const builtinUri = URI.file('/app/builtins/fetch/SKILL.md');
			const ps = createMockPromptsService();
			(ps as { listPromptFilesForStorage: Function }).listPromptFilesForStorage = async () => [
				{ uri: builtinUri, name: 'fetch', description: 'Fetch web pages' },
			];

			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([]),
				promptsService: ps,
			});

			const result = await source.fetchItems(PromptsType.skill);
			const builtin = result.find(i => i.name === 'fetch');
			assert.ok(builtin);
			assert.strictEqual(builtin.enablementScope, 'workspace');
		});

		test('disabled builtin skill shows as disabled', async () => {
			const builtinUri = URI.file('/app/builtins/fetch/SKILL.md');
			const ps = createMockPromptsService();
			(ps as { listPromptFilesForStorage: Function }).listPromptFilesForStorage = async () => [
				{ uri: builtinUri, name: 'fetch', description: 'Fetch web pages' },
			];
			const disabled = new ResourceSet();
			disabled.add(builtinUri);
			ps.setDisabledPromptFiles(PromptsType.skill, disabled, StorageScope.PROFILE);

			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([]),
				promptsService: ps,
			});

			const result = await source.fetchItems(PromptsType.skill);
			const builtin = result.find(i => i.name === 'fetch');
			assert.ok(builtin);
			assert.strictEqual(builtin.disabled, true);
		});
	});

	suite('ghost entries for disabled items not in provider results', () => {

		test('VS Code harness: disabled agent ghost entry has enablementScope and shows Enable button', async () => {
			// Simulate: local agent was disabled via enablementHandler → promptsService
			// but the promptsServiceItemProvider no longer returns it (getCustomAgents filters it out).
			const ps = createMockPromptsService();
			const disabled = new ResourceSet();
			disabled.add(agentUri);
			ps.setDisabledPromptFiles(PromptsType.agent, disabled, StorageScope.PROFILE);

			// Provider returns NO items (disabled agent is filtered out)
			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([]),
				promptsService: ps,
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result.length, 1, 'ghost entry should be created');
			assert.strictEqual(result[0].disabled, true);
			assert.strictEqual(result[0].enablementScope, 'workspace');

			const keys = computeContextKeys(result[0]);
			assert.strictEqual(keys.enableButtonVisible, true, 'Enable button should be visible for ghost entry');
			assert.strictEqual(keys.disableButtonVisible, false);
		});

	});

	suite('provider item with pre-set enabled:false', () => {

		test('shown as disabled regardless of disabled sets', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'Pre-Disabled',
					enabled: false, enablementScope: 'global',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			assert.strictEqual(result[0].disabled, true);
		});
	});

	/**
	 * Computes the full set of context keys that drive Enable/Disable button
	 * visibility in the list widget. Uses the shared production helper for
	 * enablementScope/isDisableable, then derives button visibility.
	 */
	function computeContextKeys(item: { disabled: boolean; enablementScope?: string; plugin?: unknown }) {
		const { enablementScope, isDisableable } = computeItemEnablementKeys(item);
		return {
			disabled: item.disabled,
			enablementScope,
			isDisableable,
			isPlugin: !!item.plugin,
			enableButtonVisible: item.disabled && !item.plugin && isDisableable,
			disableButtonVisible: !item.disabled && !item.plugin && isDisableable,
		};
	}

	suite('Enable/Disable button visibility context keys', () => {

		test('VS Code harness: disabled local item shows Enable button', async () => {
			const ps = createMockPromptsService();
			const disabled = new ResourceSet();
			disabled.add(agentUri);
			ps.setDisabledPromptFiles(PromptsType.agent, disabled, StorageScope.PROFILE);

			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'My Agent',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				promptsService: ps,
			});

			const result = await source.fetchItems(PromptsType.agent);
			const keys = computeContextKeys(result[0]);
			assert.deepStrictEqual(keys, {
				disabled: true,
				enablementScope: 'workspace',
				isDisableable: true,
				isPlugin: false,
				enableButtonVisible: true,
				disableButtonVisible: false,
			});
		});

		test('VS Code harness: enabled local item shows Disable button', async () => {
			const source = createItemSource({
				harnessId: 'vscode',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'My Agent',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					extensionId: undefined,
					pluginUri: undefined
				}]),
			});

			const result = await source.fetchItems(PromptsType.agent);
			const keys = computeContextKeys(result[0]);
			assert.deepStrictEqual(keys, {
				disabled: false,
				enablementScope: 'workspace',
				isDisableable: true,
				isPlugin: false,
				enableButtonVisible: false,
				disableButtonVisible: true,
			});
		});

		test('external harness: disabled API item shows Enable button', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'CLI Agent',
					enablementScope: 'global',
					enabled: false,
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			const keys = computeContextKeys(result[0]);
			assert.deepStrictEqual(keys, {
				disabled: true,
				enablementScope: 'global',
				isDisableable: true,
				isPlugin: false,
				enableButtonVisible: true,
				disableButtonVisible: false,
			});
		});

		test('external harness: disabled item via provider enabled:false shows Enable button', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: skillUri, type: PromptsType.skill, name: 'My Skill',
					storage: PromptsStorage.local, enablementScope: 'workspace',
					enabled: false,
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.skill);
			const keys = computeContextKeys(result[0]);
			assert.deepStrictEqual(keys, {
				disabled: true,
				enablementScope: 'workspace',
				isDisableable: true,
				isPlugin: false,
				enableButtonVisible: true,
				disableButtonVisible: false,
			});
		});

		test('item without enablementScope: no Enable or Disable button', async () => {
			const source = createItemSource({
				harnessId: 'cli',
				itemProvider: createMockItemProvider([{
					uri: agentUri, type: PromptsType.agent, name: 'No Scope Agent',
					extensionId: undefined,
					pluginUri: undefined
				}]),
				enablementHandler: createMockEnablementHandler(),
			});

			const result = await source.fetchItems(PromptsType.agent);
			const keys = computeContextKeys(result[0]);
			assert.deepStrictEqual(keys, {
				disabled: false,
				enablementScope: 'none',
				isDisableable: false,
				isPlugin: false,
				enableButtonVisible: false,
				disableButtonVisible: false,
			});
		});
	});
});
