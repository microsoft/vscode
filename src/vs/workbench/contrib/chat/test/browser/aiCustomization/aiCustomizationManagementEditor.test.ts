/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AICustomizationManagementEditor, isCurrentPluginContributionNavigation } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { CustomizationMigrationCandidate, CustomizationMigrationType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, isMcpServerCustomizationMigrationCandidate, MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory, ICustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import type { ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import type { ICustomizationMigrationCategorySummary } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { defaultCheckboxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';

suite('aiCustomizationManagementEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('includes the customization target in the modal title', () => {
		const input = store.add(new AICustomizationManagementEditorInput());
		const labels = [[input.getName(), input.getDescription()]];
		input.setTargetLabels('Copilot');
		labels.push([input.getName(), input.getDescription()]);
		input.setTargetLabels('Copilot', 'vscode');
		labels.push([input.getName(), input.getDescription()]);
		input.setTargetLabels(undefined);
		labels.push([input.getName(), input.getDescription()]);
		assert.deepStrictEqual(labels, [
			['Agent Customizations', undefined],
			['Agent Customizations', '(Copilot)'],
			['Agent Customizations', '(Copilot · vscode)'],
			['Agent Customizations', undefined],
		]);
	});

	test('rejects stale plugin contribution navigation', () => {
		assert.deepStrictEqual([
			isCurrentPluginContributionNavigation(2, 2, AICustomizationManagementSection.Skills, AICustomizationManagementSection.Skills, true),
			isCurrentPluginContributionNavigation(1, 2, AICustomizationManagementSection.Skills, AICustomizationManagementSection.Skills, true),
			isCurrentPluginContributionNavigation(2, 2, AICustomizationManagementSection.Skills, AICustomizationManagementSection.Agents, true),
			isCurrentPluginContributionNavigation(2, 2, AICustomizationManagementSection.Skills, AICustomizationManagementSection.Skills, false),
		], [true, false, false, false]);
	});

	type TestableEditor = {
		currentEditingPromptType: PromptsType | undefined;
		currentEditingSource: string | undefined;
		currentEditingReadOnly: boolean;
		customizationsByMigrationCategory: Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>;
		customizationMigrationTargetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>;
		customizationMigrationInProgress: boolean;
		customizationMigrationWritesInProgress: boolean;
		customizationMigrationLoading: boolean;
		activeMigrationCategoryId: CustomizationMigrationCategoryId | undefined;
		editorDisplayMode: 'preview' | 'raw';
		editorPreviewFrontMatterContainer: HTMLElement | undefined;
		editorPreviewDisposables: DisposableStore;
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail';
		dimension: undefined;
		hoverService: IHoverService;
		instantiationService: IInstantiationService;
		configurationService: IConfigurationService;
		editorDisposables: DisposableStore;
		harnessService: { activeSessionResource: ISettableObservable<URI> };
		migrationListContainer: HTMLElement | undefined;
		migrationSectionLists: readonly unknown[];
		migrationMigrateButton: { enabled: boolean; label: string } | undefined;
		migrationClearSettingsCheckbox: Checkbox | undefined;
		migrationClearSettingsContainer: HTMLElement | undefined;
		migrationTitleElement: HTMLElement | undefined;
		migrationDescriptionElement: HTMLElement | undefined;
		migrationBannerContainer: HTMLElement | undefined;
		migrationLinkElement: HTMLAnchorElement | undefined;
		selectedCustomizationMigrationItems: ResourceMap<Set<PromptsStorage>>;
		selectedMcpServerMigrationItems: Set<string>;
		knownMcpServerMigrationItems: Set<string>;
		migrationSelectionContextKey: string;
		migrationPageDisposables: DisposableStore;
		migrationBannerDisposables: DisposableStore;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
		customizationMigrationService: Pick<ICustomizationMigrationService, 'migrateMcpServers'>;
		dialogService: { confirm(): Promise<{ confirmed: boolean }> };
		quickInputService: {
			pick(items: readonly { folder: ICustomizationSourceFolder }[]): Promise<{ folder: ICustomizationSourceFolder } | undefined>;
		};
		notificationService: { error(message: string): void; info(message: string): void; warn(message: string): void };
		showEmbeddedEditor(...args: unknown[]): Promise<void>;
		getActiveHarnessLabel(): string;
		welcomePage: { setMigrationCategories(categories: readonly unknown[]): void } | undefined;
		selectedSection: AICustomizationManagementSection | undefined;
		contributedSectionContainers: Map<AICustomizationManagementSection, HTMLElement>;
		getEditorModeButtonLabel(): string;
		getEditorModeButtonTooltip(): string;
		renderPreviewAttribute(attribute: IHeaderAttribute, promptType: PromptsType, target: Target): void;
		onStructuredPreviewSettingChanged(): void;
		refreshCustomizationMigrationUi(): void;
		refreshCustomizationMigrationInfoFromPromptChange(): void;
		refreshCustomizationMigrationInfo(): Promise<void>;
		registerCustomizationMigrationSessionRefresh(): void;
		renderCustomizationMigrationPage(): void;
		updateCustomizationMigrationActionState(): void;
		getConfiguredLocationSettingsToClear(category: ICustomizationMigrationCategory, customizations: readonly MigratableConfiguration[]): readonly string[];
		clearConfiguredLocationSettings(settingIds: readonly string[]): Promise<void>;
		migrateSelectedCustomizations(category: ICustomizationMigrationCategory, customizations: readonly CustomizationMigrationCandidate[]): Promise<void>;
		setCustomizationsToMigrate(candidates: Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>, targetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>): void;
		isCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate): boolean;
		setCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate, selected: boolean): void;
		resolveCustomizationMigrationTargetFolders(
			customizations: readonly MigratableConfiguration[],
			availableSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>,
			sessionResource: URI,
		): Promise<ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>> | undefined>;
		updateContentVisibility(): void;
		setVisible(visible: boolean): void;
	};

	function createConfigurationServiceStub(values: Record<string, unknown> = {}): IConfigurationService {
		// Default to enabling the structured preview so existing assertions exercise the preview path.
		const merged: Record<string, unknown> = {
			[ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
			...values,
		};
		return {
			getValue: (key: string) => merged[key],
			setValue: (key: string, value: unknown) => { merged[key] = value; },
			inspect: (key: string) => ({
				key,
				value: merged[key],
				defaultValue: undefined,
				policyValue: undefined,
			}),
			updateValue: async (key: string, value: unknown) => { merged[key] = value; },
		} as unknown as IConfigurationService & { setValue(key: string, value: unknown): void };
	}

	function createTestEditor(hoverService?: IHoverService, configurationService?: IConfigurationService): TestableEditor {
		const editor = Object.create(AICustomizationManagementEditor.prototype) as unknown as TestableEditor;
		editor.currentEditingPromptType = undefined;
		editor.currentEditingSource = undefined;
		editor.currentEditingReadOnly = false;
		editor.customizationsByMigrationCategory = new Map();
		editor.customizationMigrationTargetFoldersByType = new Map();
		editor.customizationMigrationInProgress = false;
		editor.customizationMigrationWritesInProgress = false;
		editor.customizationMigrationLoading = false;
		editor.activeMigrationCategoryId = undefined;
		editor.editorDisplayMode = 'preview';
		editor.editorPreviewFrontMatterContainer = document.createElement('div');
		editor.editorPreviewDisposables = new DisposableStore();
		editor.editorDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.harnessService = {
			activeSessionResource: observableValue('activeSessionResource', URI.parse('agent-host-test:/session-a')),
		};
		editor.hoverService = hoverService ?? {
			setupManagedHover: () => ({
				dispose() { },
				show() { },
				hide() { },
				update() { },
			}),
		} as unknown as IHoverService;
		editor.instantiationService = workbenchInstantiationService({}, editor.editorPreviewDisposables);
		editor.configurationService = configurationService ?? createConfigurationServiceStub();
		editor.migrationListContainer = undefined;
		editor.migrationSectionLists = [];
		editor.migrationMigrateButton = undefined;
		editor.migrationClearSettingsCheckbox = undefined;
		editor.migrationClearSettingsContainer = undefined;
		editor.migrationTitleElement = undefined;
		editor.migrationDescriptionElement = undefined;
		editor.migrationBannerContainer = undefined;
		editor.migrationLinkElement = undefined;
		editor.selectedCustomizationMigrationItems = new ResourceMap();
		editor.selectedMcpServerMigrationItems = new Set();
		editor.knownMcpServerMigrationItems = new Set();
		editor.migrationSelectionContextKey = '';
		editor.migrationPageDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.migrationBannerDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.labelService = {
			getUriLabel: uri => uri.path,
		};
		editor.customizationMigrationService = {
			migrateMcpServers: async () => ({ migratedCount: 0, failures: [] }),
		};
		editor.dialogService = {
			confirm: async () => ({ confirmed: false }),
		};
		editor.quickInputService = {
			pick: async items => items[0],
		};
		editor.notificationService = {
			error: () => { },
			info: () => { },
			warn: () => { },
		};
		editor.getActiveHarnessLabel = () => 'Copilot';
		editor.welcomePage = undefined;
		editor.contributedSectionContainers = new Map();
		editor.editorPreviewRenderScheduler = {
			cancel(): void { },
			schedule(): void { },
		};
		editor.viewMode = 'list';
		editor.dimension = undefined;
		editor.selectedSection = undefined;
		editor.setVisible(false);
		return editor;
	}

	function createScalarAttribute(key: string, value: string): IHeaderAttribute {
		return {
			key,
			range: new Range(1, 1, 1, key.length + value.length + 1),
			value: {
				type: 'scalar',
				value,
				range: new Range(1, 1, 1, value.length + 1),
				format: 'double',
			},
		};
	}

	test('uses edit copy for built-in skills that support raw overrides', () => {
		const editor = createTestEditor();
		editor.currentEditingPromptType = PromptsType.skill;
		editor.currentEditingSource = AICustomizationSources.builtin;
		editor.currentEditingReadOnly = true;
		editor.editorDisplayMode = 'preview';

		assert.strictEqual(editor.getEditorModeButtonLabel(), 'Edit');
		assert.strictEqual(editor.getEditorModeButtonTooltip(), 'Edit the raw markdown file');

		editor.editorPreviewDisposables.dispose();
	});

	test('ignores programmatic open requests for synthetic built-ins without source content', async () => {
		const editor = createTestEditor();
		const builtInUri = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/init' });

		await editor.showEmbeddedEditor(
			toAgentHostUri(builtInUri, 'remote'),
			'init',
			PromptsType.skill,
			AICustomizationSources.builtin,
			false,
			true
		);

		assert.deepStrictEqual({
			viewMode: editor.viewMode,
		}, {
			viewMode: 'list',
		});

		editor.editorPreviewDisposables.dispose();
	});

	test('uses view-raw copy for true read-only extension content', () => {
		const editor = createTestEditor();
		editor.currentEditingPromptType = PromptsType.agent;
		editor.currentEditingSource = AICustomizationSources.extension;
		editor.currentEditingReadOnly = true;
		editor.editorDisplayMode = 'preview';

		assert.strictEqual(editor.getEditorModeButtonLabel(), 'View Raw');
		assert.strictEqual(editor.getEditorModeButtonTooltip(), 'Show the raw markdown file');

		editor.editorPreviewDisposables.dispose();
	});

	test('clicking a preview field help button opens the managed hover with focus', () => {
		let focused: boolean | undefined;
		const hoverService = {
			setupManagedHover: (): IManagedHover => ({
				dispose() { },
				show(focus?: boolean): void {
					focused = focus;
				},
				hide(): void { },
				update(): void { },
			}),
		} as unknown as IHoverService;
		const editor = createTestEditor(hoverService);
		const container = editor.editorPreviewFrontMatterContainer!;
		document.body.appendChild(container);

		try {
			editor.renderPreviewAttribute(createScalarAttribute('description', 'Helpful text'), PromptsType.agent, Target.VSCode);

			const helpButton = container.querySelector('button.editor-preview-row-help') as HTMLButtonElement | null;
			assert.ok(helpButton);

			helpButton.click();

			assert.strictEqual(focused, true);
		} finally {
			container.remove();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('hides preview button when structured preview setting is disabled', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: false,
		}));
		editor.currentEditingPromptType = PromptsType.agent;
		editor.currentEditingSource = AICustomizationSources.builtin;
		editor.currentEditingReadOnly = false;
		editor.editorDisplayMode = 'preview';

		assert.strictEqual(editor.getEditorModeButtonLabel(), '');
		assert.strictEqual(editor.getEditorModeButtonTooltip(), '');

		editor.editorPreviewDisposables.dispose();
	});

	test('disabling the setting at runtime forces the editor back to raw mode', () => {
		const configurationService = createConfigurationServiceStub() as IConfigurationService & { setValue(key: string, value: unknown): void };
		const editor = createTestEditor(undefined, configurationService);
		editor.viewMode = 'editor';
		editor.currentEditingPromptType = PromptsType.agent;
		editor.editorDisplayMode = 'preview';

		// Sanity: setting is on and file is editable, so label is "Edit" (preview mode).
		assert.strictEqual(editor.getEditorModeButtonLabel(), 'Edit');

		// Flip the setting off and run the change handler.
		configurationService.setValue(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled, false);
		editor.onStructuredPreviewSettingChanged();

		assert.strictEqual(editor.editorDisplayMode, 'raw');
		assert.strictEqual(editor.getEditorModeButtonLabel(), '');

		editor.editorPreviewDisposables.dispose();
	});

	test('gates each migration category on its own experimental setting', () => {
		const welcomePageCalls: ICustomizationMigrationCategorySummary[][] = [];
		const configurationService = createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: false,
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: false,
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: false,
		}) as IConfigurationService & { setValue(key: string, value: unknown): void };
		const editor = createTestEditor(undefined, configurationService);
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.PromptFiles, [{
				uri: URI.file('/workspace/.github/prompts/prompt.prompt.md'),
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration]],
			[CustomizationMigrationCategoryId.UserData, [{
				uri: URI.file('/user-data/prompts/legacy.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			} as MigratableConfiguration]],
			[CustomizationMigrationCategoryId.ConfiguredLocations, [{
				uri: URI.file('/workspace/custom-skills/release/SKILL.md'),
				storage: PromptsStorage.local,
				type: PromptsType.skill,
				source: PromptFileSource.ConfigWorkspace,
			} as MigratableConfiguration]],
		]);
		editor.welcomePage = {
			setMigrationCategories: categories => welcomePageCalls.push([...categories as readonly ICustomizationMigrationCategorySummary[]]),
		};

		editor.refreshCustomizationMigrationUi();
		configurationService.setValue(ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled, true);
		editor.refreshCustomizationMigrationUi();
		configurationService.setValue(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled, true);
		editor.refreshCustomizationMigrationUi();
		configurationService.setValue(ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled, true);
		configurationService.setValue('chat.agentFilesLocations', { '/workspace/custom-agents': true });
		editor.refreshCustomizationMigrationUi();

		assert.deepStrictEqual(welcomePageCalls.map(categories => categories.map(category => category.id)), [
			[],
			[CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData, CustomizationMigrationCategoryId.ConfiguredLocations],
		]);
		editor.editorPreviewDisposables.dispose();
	});

	test('tracks migration selection by URI and storage', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const sharedUri = URI.file('/home/user/shared.prompt.md');
		const workspacePrompt: MigratableConfiguration = {
			uri: sharedUri,
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.ConfigWorkspace,
		};
		const userPrompt: MigratableConfiguration = {
			uri: sharedUri,
			storage: PromptsStorage.user,
			type: PromptsType.prompt,
			source: PromptFileSource.ConfigPersonal,
		};
		const candidates = new Map<CustomizationMigrationCategoryId, readonly MigratableConfiguration[]>([
			[CustomizationMigrationCategoryId.PromptFiles, [workspacePrompt, userPrompt]],
		]);

		editor.setCustomizationsToMigrate(candidates, new Map());
		editor.setCustomizationSelectedForMigration(workspacePrompt, false);
		editor.setCustomizationsToMigrate(candidates, new Map());

		assert.deepStrictEqual({
			workspaceSelected: editor.isCustomizationSelectedForMigration(workspacePrompt),
			userSelected: editor.isCustomizationSelectedForMigration(userPrompt),
			selectedStorages: [...(editor.selectedCustomizationMigrationItems.get(sharedUri) ?? [])],
		}, {
			workspaceSelected: false,
			userSelected: true,
			selectedStorages: [PromptsStorage.user],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('does not preserve MCP selection when a positional ID moves to another source', () => {
		const editor = createTestEditor();
		const serverA: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			id: 'mcp.config.ws0.server',
			name: 'server',
			sourceUri: URI.file('/workspace-a/.vscode/mcp.json'),
			targetUri: URI.file('/workspace-a/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const serverB: IMcpServerCustomizationMigrationCandidate = {
			...serverA,
			sourceUri: URI.file('/workspace-b/.vscode/mcp.json'),
			targetUri: URI.file('/workspace-b/.mcp.json'),
		};

		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [serverA]]]), new Map());
		editor.setCustomizationSelectedForMigration(serverA, false);
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [serverB]]]), new Map());

		assert.deepStrictEqual({
			oldSourceSelected: editor.isCustomizationSelectedForMigration(serverA),
			newSourceSelected: editor.isCustomizationSelectedForMigration(serverB),
		}, {
			oldSourceSelected: false,
			newSourceSelected: true,
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('preserves MCP deselection across a transient discovery gap', () => {
		const editor = createTestEditor();
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			id: 'mcp.config.ws0.server',
			name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'),
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};

		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [server]]]), new Map());
		editor.setCustomizationSelectedForMigration(server, false);
		editor.setCustomizationsToMigrate(new Map(), new Map());
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [server]]]), new Map());

		assert.strictEqual(editor.isCustomizationSelectedForMigration(server), false);
		editor.editorPreviewDisposables.dispose();
	});

	test('refreshes migration state when the active session changes within one harness', () => {
		const editor = createTestEditor();
		const sessionA = URI.parse('agent-host-test:/session-a');
		const sessionB = URI.parse('agent-host-test:/session-b');
		const refreshedSessions: string[] = [];
		editor.harnessService.activeSessionResource.set(sessionA, undefined);
		editor.refreshCustomizationMigrationInfo = async () => {
			const sessionResource = editor.harnessService.activeSessionResource.get();
			refreshedSessions.push(sessionResource.path);
			editor.customizationsByMigrationCategory = new Map([[
				CustomizationMigrationCategoryId.UserData,
				[{
					uri: URI.file(`/user-data${sessionResource.path}.instructions.md`),
					storage: PromptsStorage.user,
					type: PromptsType.instructions,
					source: PromptFileSource.UserData,
				} as MigratableConfiguration],
			]]);
			editor.customizationMigrationTargetFoldersByType = new Map([[
				PromptsType.instructions,
				[{
					uri: URI.file('/home/test/.test-harness' + sessionResource.path + '/instructions'),
					label: sessionResource.path,
					source: AICustomizationSources.user,
				}],
			]]);
		};

		editor.registerCustomizationMigrationSessionRefresh();
		editor.harnessService.activeSessionResource.set(sessionB, undefined);

		assert.deepStrictEqual({
			refreshedSessions,
			candidatePaths: [...editor.customizationsByMigrationCategory.values()].flat()
				.filter(candidate => !isMcpServerCustomizationMigrationCandidate(candidate))
				.map(candidate => candidate.uri.path),
			destinationPaths: [...editor.customizationMigrationTargetFoldersByType.values()].flat().map(folder => folder.uri.path),
		}, {
			refreshedSessions: ['/session-a', '/session-b'],
			candidatePaths: ['/user-data/session-b.instructions.md'],
			destinationPaths: ['/home/test/.test-harness/session-b/instructions'],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('suppresses prompt change refreshes only while migration writes are in progress', () => {
		const editor = createTestEditor();
		let refreshCount = 0;
		editor.refreshCustomizationMigrationInfo = async () => {
			refreshCount++;
		};

		editor.customizationMigrationInProgress = true;
		editor.refreshCustomizationMigrationInfoFromPromptChange();
		editor.customizationMigrationWritesInProgress = true;
		editor.refreshCustomizationMigrationInfoFromPromptChange();
		editor.customizationMigrationWritesInProgress = false;
		editor.refreshCustomizationMigrationInfoFromPromptChange();

		assert.strictEqual(refreshCount, 2);
		editor.editorPreviewDisposables.dispose();
	});

	test('disables migration while another migration is in progress', () => {
		const editor = createTestEditor();
		const customization: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		editor.migrationMigrateButton = { enabled: true, label: '' };
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.UserData, [customization]]]), new Map());
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.UserData;

		editor.customizationMigrationInProgress = true;
		editor.updateCustomizationMigrationActionState();

		assert.strictEqual(editor.migrationMigrateButton.enabled, false);
		editor.editorPreviewDisposables.dispose();
	});

	test('keeps clearing enabled and clears only settings unused after the selected migrations', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.ConfiguredLocations);
		const agentSettingId = 'chat.agentFilesLocations';
		const instructionsSettingId = 'chat.instructionsFilesLocations';
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: true,
			[agentSettingId]: { '/custom/agents': true },
			[instructionsSettingId]: { '/custom/instructions': true },
		}));
		const customizations: MigratableConfiguration[] = [
			{
				uri: URI.file('/custom/reviewer.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/custom/style.instructions.md'),
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
		];
		editor.migrationMigrateButton = { enabled: false, label: '' };
		editor.migrationClearSettingsCheckbox = new Checkbox('Clear unused location settings after migration', true, defaultCheckboxStyles);
		editor.setCustomizationsToMigrate(new Map([[category.id, customizations]]), new Map());
		editor.activeMigrationCategoryId = category.id;
		editor.migrationListContainer = document.createElement('div');
		document.body.appendChild(editor.migrationListContainer);

		editor.renderCustomizationMigrationPage();
		const settingsGroupToggle = editor.migrationListContainer.querySelector<HTMLButtonElement>('.prompt-migration-settings-group .customization-section-toggle');
		const settingsGroupItems = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-settings-group .prompt-migration-group-items');
		const allSelected = {
			enabled: editor.migrationClearSettingsCheckbox.enabled,
			checked: editor.migrationClearSettingsCheckbox.checked,
			settingsToClear: editor.getConfiguredLocationSettingsToClear(category, customizations),
			settingsGroupTitle: editor.migrationListContainer.querySelector('.prompt-migration-settings-group .prompt-migration-group-title')?.textContent,
			settingsGroupToggle: {
				ariaExpanded: settingsGroupToggle?.getAttribute('aria-expanded'),
				ariaLabel: settingsGroupToggle?.getAttribute('aria-label'),
			},
			settingsItemLabel: editor.migrationListContainer.querySelector('.prompt-migration-settings-item-label')?.textContent,
			settingsItemDescription: editor.migrationListContainer.querySelector('.prompt-migration-settings-item-description')?.textContent,
		};
		settingsGroupToggle?.click();
		const collapsedSettingsGroup = {
			ariaExpanded: settingsGroupToggle?.getAttribute('aria-expanded'),
			itemsHidden: settingsGroupItems?.hidden,
		};

		editor.setCustomizationSelectedForMigration(customizations[0], false);
		editor.updateCustomizationMigrationActionState();
		const partiallySelected = {
			enabled: editor.migrationClearSettingsCheckbox.enabled,
			checked: editor.migrationClearSettingsCheckbox.checked,
			settingsToClear: editor.getConfiguredLocationSettingsToClear(category, [customizations[1]]),
		};

		assert.deepStrictEqual({ allSelected, collapsedSettingsGroup, partiallySelected }, {
			allSelected: {
				enabled: true,
				checked: true,
				settingsToClear: [agentSettingId, instructionsSettingId],
				settingsGroupTitle: 'Settings',
				settingsGroupToggle: {
					ariaExpanded: 'true',
					ariaLabel: 'Collapse Settings',
				},
				settingsItemLabel: 'Clear unused location settings',
				settingsItemDescription: 'Remove deprecated settings that are no longer needed after the selected customizations migrate successfully.',
			},
			collapsedSettingsGroup: {
				ariaExpanded: 'false',
				itemsHidden: true,
			},
			partiallySelected: {
				enabled: true,
				checked: true,
				settingsToClear: [instructionsSettingId],
			},
		});
		editor.migrationListContainer.remove();
		editor.migrationClearSettingsCheckbox.dispose();
		editor.editorPreviewDisposables.dispose();
	});

	test('clears each configured location setting without changing its target', async () => {
		const updates: [string, unknown][] = [];
		const editor = createTestEditor(undefined, {
			updateValue: async (key: string, value: unknown) => { updates.push([key, value]); },
		} as unknown as IConfigurationService);

		await editor.clearConfiguredLocationSettings([
			'chat.agentFilesLocations',
			'chat.modeFilesLocations',
		]);

		assert.deepStrictEqual(updates, [
			['chat.agentFilesLocations', undefined],
			['chat.modeFilesLocations', undefined],
		]);
		editor.editorPreviewDisposables.dispose();
	});

	test('migration banners include destination consequences when applicable', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const userDataCustomizations = [
			{
				uri: URI.file('/user-data/prompts/legacy.agent.md'),
				name: 'legacy.agent.md',
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			} as MigratableConfiguration,
			{
				uri: URI.file('/user-data/prompts/style.instructions.md'),
				name: 'style.instructions.md',
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			} as MigratableConfiguration,
		];
		const promptFiles = [
			{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'review.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
		];
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.UserData, userDataCustomizations],
			[CustomizationMigrationCategoryId.PromptFiles, promptFiles],
		]);
		editor.customizationMigrationTargetFoldersByType = new Map([
			[PromptsType.agent, [{ uri: URI.file('/home/test/.copilot/agents'), label: '~/.copilot', source: AICustomizationSources.user }]],
			[PromptsType.instructions, [{ uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot', source: AICustomizationSources.user }]],
		]);
		editor.selectedCustomizationMigrationItems = new ResourceMap();
		editor.migrationListContainer = document.createElement('div');
		editor.migrationTitleElement = document.createElement('h2');
		editor.migrationDescriptionElement = document.createElement('p');
		editor.migrationBannerContainer = document.createElement('div');
		editor.migrationLinkElement = document.createElement('a');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		const readBanner = () => ({
			message: editor.migrationBannerContainer!.querySelector('.customization-migration-banner-message')?.textContent ?? '',
			consequence: editor.migrationBannerContainer!.querySelector('.customization-migration-banner-consequence')?.textContent ?? '',
			bannerHidden: editor.migrationBannerContainer!.style.display === 'none',
			descriptionHidden: editor.migrationDescriptionElement!.style.display === 'none',
			linkInBanner: editor.migrationLinkElement!.closest('.customization-migration-banner-content') !== null,
		});

		try {
			editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.UserData;
			editor.renderCustomizationMigrationPage();
			const userData = readBanner();

			editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
			editor.renderCustomizationMigrationPage();
			const prompts = readBanner();

			assert.deepStrictEqual({ userData, prompts }, {
				userData: {
					message: 'They are stored in user data, which only VS Code reads. Move them to \'~/.copilot\' so both VS Code and this harness can use them, keeping their name, type, and content.',
					consequence: 'Migrated files aren\'t currently included in Settings Sync.',
					bannerHidden: false,
					descriptionHidden: true,
					linkInBanner: true,
				},
				prompts: {
					message: 'Prompts are no longer supported by Copilot. Convert them to skills to keep them available in both VS Code and this harness.',
					consequence: '',
					bannerHidden: false,
					descriptionHidden: true,
					linkInBanner: true,
				},
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('opens a migration candidate through the shared Button widget', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const promptFile: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const openedItems: unknown[][] = [];
		editor.showEmbeddedEditor = async (...args: unknown[]) => { openedItems.push(args); };
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, [promptFile]]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		editor.migrationListContainer = document.createElement('div');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();
			const openButton = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-open-button');
			const activateWithKey = (key: string, keyCode: number): void => {
				const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
				Object.defineProperty(event, 'keyCode', { get: () => keyCode });
				openButton?.dispatchEvent(event);
			};
			activateWithKey('Enter', 13);
			activateWithKey(' ', 32);

			assert.deepStrictEqual({
				tagName: openButton?.tagName,
				role: openButton?.getAttribute('role'),
				ariaLabel: openButton?.getAttribute('aria-label'),
				openedItems,
			}, {
				tagName: 'A',
				role: 'button',
				ariaLabel: 'Open Review, /workspace/.github/prompts/review.prompt.md',
				openedItems: [
					[promptFile.uri, 'Review', PromptsType.prompt, PromptsStorage.local, true],
					[promptFile.uri, 'Review', PromptsType.prompt, PromptsStorage.local, true],
				],
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('virtualized migration rows keep checkbox selection and keyboard traversal aligned', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const promptFiles = Array.from({ length: 6 }, (_, index): MigratableConfiguration => ({
			uri: URI.file(`/workspace/.github/prompts/workspace-${index}.prompt.md`),
			name: `workspace-${index}.prompt.md`,
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		}));
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, promptFiles]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		editor.migrationListContainer = document.createElement('div');
		Object.defineProperty(editor.migrationListContainer, 'clientHeight', { configurable: true, value: 500 });
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();
			const firstRow = editor.migrationListContainer.querySelector<HTMLElement>('.monaco-list-row[data-index="0"]');
			firstRow?.click();
			const lastVisibleMoreButton = editor.migrationListContainer.querySelector<HTMLElement>('.monaco-list-row[data-index="4"] .prompt-migration-more-action');
			const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
			Object.defineProperty(tabEvent, 'keyCode', { get: () => 9 });
			lastVisibleMoreButton?.dispatchEvent(tabEvent);

			assert.deepStrictEqual({
				firstRowSelected: firstRow?.classList.contains('selected'),
				firstRowAriaSelected: firstRow?.getAttribute('aria-selected') === 'true',
				focusedRowIndex: document.activeElement?.closest('.monaco-list-row')?.getAttribute('data-index'),
				focusedControlIsCheckbox: document.activeElement?.classList.contains('monaco-checkbox'),
			}, {
				firstRowSelected: false,
				firstRowAriaSelected: false,
				focusedRowIndex: '5',
				focusedControlIsCheckbox: true,
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('renders MCP migration candidates without file actions', () => {
		const editor = createTestEditor();
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			id: 'mcp.config.ws0.server',
			name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'),
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.McpServers, [server]]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.McpServers;
		editor.setCustomizationSelectedForMigration(server, true);
		editor.migrationListContainer = document.createElement('div');
		Object.defineProperty(editor.migrationListContainer, 'clientHeight', { configurable: true, value: 500 });
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();
			editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')?.focus();
			editor.customizationMigrationLoading = true;
			editor.renderCustomizationMigrationPage();
			editor.customizationMigrationLoading = false;
			editor.renderCustomizationMigrationPage();
			const checkbox = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]');
			const focusRestored = document.activeElement === checkbox;
			checkbox?.click();
			const externalButton = document.body.appendChild(document.createElement('button'));
			externalButton.focus();
			editor.renderCustomizationMigrationPage();
			const externalFocusRetained = document.activeElement === externalButton;
			externalButton.remove();

			assert.deepStrictEqual({
				checkboxLabel: checkbox?.getAttribute('aria-label'),
				focusRestored,
				externalFocusRetained,
				staticText: editor.migrationListContainer.querySelector('.prompt-migration-static-text')?.textContent,
				openButtonDisplay: editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-open-button')?.style.display,
				moreButtonDisplay: editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-more-action')?.style.display,
				selected: editor.isCustomizationSelectedForMigration(server),
				migrateButton: { ...editor.migrationMigrateButton },
			}, {
				checkboxLabel: 'Select server from /workspace/.vscode/mcp.json',
				focusRestored: true,
				externalFocusRetained: true,
				staticText: 'server/workspace/.vscode/mcp.json to /workspace/.mcp.json',
				openButtonDisplay: 'none',
				moreButtonDisplay: 'none',
				selected: false,
				migrateButton: { enabled: false, label: 'Migrate' },
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('confirms and executes selected MCP migration candidates', async () => {
		const editor = createTestEditor();
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			id: 'mcp.config.ws0.server',
			name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'),
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const migrated: IMcpServerCustomizationMigrationCandidate[][] = [];
		const notifications: string[] = [];
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		editor.customizationMigrationService = {
			migrateMcpServers: async (_sessionResource, candidates) => {
				migrated.push([...candidates]);
				return { migratedCount: candidates.length, failures: [] };
			},
		};
		editor.notificationService = {
			error: message => notifications.push(`error:${message}`),
			info: message => notifications.push(`info:${message}`),
			warn: message => notifications.push(`warn:${message}`),
		};
		editor.refreshCustomizationMigrationInfo = async () => { };

		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), [server]);

		assert.deepStrictEqual({
			migrated,
			notifications,
			inProgress: editor.customizationMigrationInProgress,
			writesInProgress: editor.customizationMigrationWritesInProgress,
		}, {
			migrated: [[server]],
			notifications: ['info:Migrated 1 MCP server.'],
			inProgress: false,
			writesInProgress: false,
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('group migration selection retains keyboard focus', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const promptFiles = [
			{
				uri: URI.file('/workspace/.github/prompts/workspace-a.prompt.md'),
				name: 'workspace-a.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
			{
				uri: URI.file('/workspace/.github/prompts/workspace-b.prompt.md'),
				name: 'workspace-b.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
		];
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, promptFiles]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		for (const promptFile of promptFiles) {
			editor.setCustomizationSelectedForMigration(promptFile, true);
		}
		editor.migrationListContainer = document.createElement('div');
		Object.defineProperty(editor.migrationListContainer, 'clientHeight', { configurable: true, value: 500 });
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();
			const groupCheckbox = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-group-checkbox .monaco-checkbox')!;
			const itemCheckboxes = [...editor.migrationListContainer.querySelectorAll<HTMLElement>('.prompt-migration-checkbox .monaco-checkbox')];
			const activateWithSpace = (): void => {
				const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
				Object.defineProperty(event, 'keyCode', { get: () => 32 });
				groupCheckbox.dispatchEvent(event);
			};
			groupCheckbox.focus();
			activateWithSpace();
			const afterDeselecting = {
				groupRetainedFocus: document.activeElement === groupCheckbox,
				groupConnected: groupCheckbox.isConnected,
				groupChecked: groupCheckbox.getAttribute('aria-checked'),
				itemCheckboxes: itemCheckboxes.map(checkbox => checkbox.getAttribute('aria-checked')),
				selectedItems: promptFiles.map(promptFile => editor.isCustomizationSelectedForMigration(promptFile)),
				migrateButton: { ...editor.migrationMigrateButton },
			};
			activateWithSpace();

			assert.deepStrictEqual({
				afterDeselecting,
				afterReselecting: {
					groupRetainedFocus: document.activeElement === groupCheckbox,
					groupConnected: groupCheckbox.isConnected,
					groupChecked: groupCheckbox.getAttribute('aria-checked'),
					itemCheckboxes: itemCheckboxes.map(checkbox => checkbox.getAttribute('aria-checked')),
					selectedItems: promptFiles.map(promptFile => editor.isCustomizationSelectedForMigration(promptFile)),
					migrateButton: { ...editor.migrationMigrateButton },
				},
			}, {
				afterDeselecting: {
					groupRetainedFocus: true,
					groupConnected: true,
					groupChecked: 'false',
					itemCheckboxes: ['false', 'false'],
					selectedItems: [false, false],
					migrateButton: { enabled: false, label: 'Convert to Skills' },
				},
				afterReselecting: {
					groupRetainedFocus: true,
					groupConnected: true,
					groupChecked: 'true',
					itemCheckboxes: ['true', 'true'],
					selectedItems: [true, true],
					migrateButton: { enabled: true, label: 'Convert 2 to Skills' },
				},
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('customization migration groups render as flat source sections', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const promptFiles = [
			{
				uri: URI.file('/workspace/.github/prompts/workspace-a.prompt.md'),
				name: 'workspace-a.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
			{
				uri: URI.file('/workspace/.github/prompts/workspace-b.prompt.md'),
				name: 'workspace-b.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
			{
				uri: URI.file('/user-data/prompts/user-a.prompt.md'),
				name: 'user-a.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			} as MigratableConfiguration,
			{
				uri: URI.file('/user-data/prompts/user-b.prompt.md'),
				name: 'user-b.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			} as MigratableConfiguration,
		];
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, promptFiles]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		for (const promptFile of promptFiles) {
			editor.setCustomizationSelectedForMigration(promptFile, true);
		}
		editor.migrationListContainer = document.createElement('div');
		editor.migrationTitleElement = document.createElement('h2');
		editor.migrationDescriptionElement = document.createElement('p');
		editor.migrationLinkElement = document.createElement('a');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();

			const groupContainers = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-items')] as HTMLElement[];
			assert.deepStrictEqual({
				groupTitles: [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-title')].map(element => element.textContent),
				groupContainers: groupContainers.map(container => container.style.display),
				collapseButtons: editor.migrationListContainer.querySelectorAll('.prompt-migration-group-toggle').length,
			}, {
				groupTitles: ['Workspace', 'User'],
				groupContainers: ['', ''],
				collapseButtons: 0,
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('unchecking every item in a migration group unchecks the group checkbox', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const promptFiles = [
			{
				uri: URI.file('/workspace/.github/prompts/workspace-a.prompt.md'),
				name: 'workspace-a.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
			{
				uri: URI.file('/workspace/.github/prompts/workspace-b.prompt.md'),
				name: 'workspace-b.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as MigratableConfiguration,
		];
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, promptFiles]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		for (const promptFile of promptFiles) {
			editor.setCustomizationSelectedForMigration(promptFile, true);
		}
		editor.migrationListContainer = document.createElement('div');
		Object.defineProperty(editor.migrationListContainer, 'clientHeight', { configurable: true, value: 500 });
		editor.migrationTitleElement = document.createElement('h2');
		editor.migrationDescriptionElement = document.createElement('p');
		editor.migrationLinkElement = document.createElement('a');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();

			const groupCheckbox = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-group-checkbox [role="checkbox"]');
			const itemCheckboxes = [...editor.migrationListContainer.querySelectorAll<HTMLElement>('.prompt-migration-group-items .prompt-migration-checkbox [role="checkbox"]')];
			const readGroupChecked = () => groupCheckbox?.getAttribute('aria-checked');

			const initiallyChecked = readGroupChecked();
			// Unchecking only one item leaves a partial group selection.
			itemCheckboxes[0].click();
			const afterFirstUncheck = readGroupChecked();
			// Unchecking the last remaining item must keep the group checkbox cleared (issue #331330).
			itemCheckboxes[1].click();
			const afterLastUncheck = readGroupChecked();
			// Re-checking every item should re-select the group checkbox.
			itemCheckboxes[0].click();
			itemCheckboxes[1].click();
			const afterRecheckingAll = readGroupChecked();

			assert.deepStrictEqual({
				itemCount: itemCheckboxes.length,
				initiallyChecked,
				afterFirstUncheck,
				afterLastUncheck,
				afterRecheckingAll,
			}, {
				itemCount: 2,
				initiallyChecked: 'true',
				afterFirstUncheck: 'mixed',
				afterLastUncheck: 'false',
				afterRecheckingAll: 'true',
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('mixed user data migration chooses one destination root', async () => {
		const editor = createTestEditor();
		const sessionResource = editor.harnessService.activeSessionResource.get();
		let pickerInvocationCount = 0;
		const pickedFolders: ICustomizationSourceFolder[] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerInvocationCount++;
				pickedFolders.push(...items.map(item => item.folder));
				return items[0];
			},
		};
		const customizations = [
			{
				uri: URI.file('/user-data/prompts/reviewer.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/user-data/prompts/review.instructions.md'),
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/agents'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
		]);

		try {
			const targetFolders = await editor.resolveCustomizationMigrationTargetFolders(customizations, availableSourceFolders, sessionResource);

			assert.deepStrictEqual({
				pickerInvocationCount,
				pickerFolders: pickedFolders.map(folder => folder.uri.path),
				agentTarget: targetFolders?.get(PromptsType.agent)?.get(PromptsStorage.user)?.uri.path,
				instructionsTarget: targetFolders?.get(PromptsType.instructions)?.get(PromptsStorage.user)?.uri.path,
			}, {
				pickerInvocationCount: 1,
				pickerFolders: ['/home/test/.copilot/agents', '/home/test/.claude/agents'],
				agentTarget: '/home/test/.copilot/agents',
				instructionsTarget: '/home/test/.copilot/instructions',
			});
		} finally {
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('automatic migration target does not constrain a later folder choice', async () => {
		const editor = createTestEditor();
		const sessionResource = editor.harnessService.activeSessionResource.get();
		let pickerInvocationCount = 0;
		editor.quickInputService = {
			pick: async items => {
				pickerInvocationCount++;
				return items[1];
			},
		};
		const customizations = [
			{
				uri: URI.file('/user-data/prompts/reviewer.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/user-data/prompts/review.instructions.md'),
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
		]);

		try {
			const targetFolders = await editor.resolveCustomizationMigrationTargetFolders(customizations, availableSourceFolders, sessionResource);

			assert.deepStrictEqual({
				pickerInvocationCount,
				agentTarget: targetFolders?.get(PromptsType.agent)?.get(PromptsStorage.user)?.uri.path,
				instructionsTarget: targetFolders?.get(PromptsType.instructions)?.get(PromptsStorage.user)?.uri.path,
			}, {
				pickerInvocationCount: 1,
				agentTarget: '/home/test/.copilot/agents',
				instructionsTarget: '/home/test/.claude/rules',
			});
		} finally {
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('does not infer migration destination groups from folder parents', async () => {
		const editor = createTestEditor();
		const sessionResource = editor.harnessService.activeSessionResource.get();
		let pickerInvocationCount = 0;
		editor.quickInputService = {
			pick: async items => {
				pickerInvocationCount++;
				return items[0];
			},
		};
		const customizations = [
			{
				uri: URI.file('/user-data/prompts/reviewer.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/user-data/prompts/review.instructions.md'),
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user },
				{ uri: URI.file('/home/test/.claude/agents'), label: 'Claude', source: PromptsStorage.user },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user },
			]],
		]);

		try {
			await editor.resolveCustomizationMigrationTargetFolders(customizations, availableSourceFolders, sessionResource);

			assert.strictEqual(pickerInvocationCount, 2);
		} finally {
			editor.editorPreviewDisposables.dispose();
		}
	});
});
