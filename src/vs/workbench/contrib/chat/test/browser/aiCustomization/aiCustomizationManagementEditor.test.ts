/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, Delayer, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
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
import { CustomizationMigration, CustomizationMigrationCandidate, CustomizationMigrationType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, isMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigrationFailureReason, MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory, ICustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import type { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import type { IMigratedCustomizationsResult } from '../../../browser/aiCustomization/customizationMigration.js';
import type { ICustomizationMigrationCategorySummary } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { defaultCheckboxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import type { ICustomizationMigrationDashboardActivity, ICustomizationMigrationDashboardDestination, ICustomizationMigrationDashboardOverview } from '../../../browser/aiCustomization/customizationMigrationDashboard.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';

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
		customizationMigrationLoadError: string | undefined;
		customizationMigrationRefreshSequence: number;
		customizationMigrationRefreshDelayer: Delayer<void>;
		customizationMigrationRequest: DisposableStore;
		selectedCustomizationMigrationTargets: Map<string, ICustomizationSourceFolder>;
		explicitlySelectedCustomizationMigrationTargets: Set<string>;
		activeMigrationCategoryId: CustomizationMigrationCategoryId | undefined;
		activeMigrationStorage: PromptsStorage | undefined;
		migrationWorkspaceSkipped: boolean;
		migrationShortcutContainer: HTMLElement | undefined;
		migrationShortcutButton: HTMLButtonElement | undefined;
		migrationShortcutCount: HTMLElement | undefined;
		layoutSidebar(width: number, height: number): void;
		updateSidebarMigrationShortcut(): void;
		showCustomizationMigrationDashboard(): void;
		storageService: IStorageService;
		workspaceService: {
			activeProjectRoot: ISettableObservable<URI | undefined>;
			activeProjectLabel: ISettableObservable<string>;
		};
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
		harnessService: { activeSessionResource: ISettableObservable<URI>; activeHarness: ISettableObservable<string>; findHarnessById: ICustomizationHarnessService['findHarnessById'] };
		migrationListContainer: HTMLElement | undefined;
		migrationSectionLists: readonly unknown[];
		migrationMigrateButton: { enabled: boolean; label: string } | undefined;
		migrationClearSettingsCheckbox: Checkbox | undefined;
		migrationClearSettingsContainer: HTMLElement | undefined;
		migrationSelectedCountElement: HTMLElement | undefined;
		migrationFooter: HTMLElement | undefined;
		migrationTitleElement: HTMLElement | undefined;
		migrationFirstFocusableElement: HTMLElement | undefined;
		migrationDescriptionElement: HTMLElement | undefined;
		migrationBannerContainer: HTMLElement | undefined;
		migrationLinkElement: HTMLAnchorElement | undefined;
		migrationDestinationsContainer: HTMLElement | undefined;
		selectedCustomizationMigrationItems: ResourceMap<Set<PromptsStorage>>;
		selectedMcpServerMigrationItems: Set<string>;
		knownMcpServerMigrationItems: Set<string>;
		migrationSelectionContextKey: string;
		migrationPageDisposables: DisposableStore;
		migrationBannerDisposables: DisposableStore;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
		customizationMigrationService: Pick<ICustomizationMigrationService, 'migrateMcpServers'> & {
			computeMigration?(session: URI, type: CustomizationMigrationType, token?: CancellationToken): Promise<CustomizationMigration>;
		};
		dialogService: { confirm(): Promise<{ confirmed: boolean }> };
		quickInputService: {
			pick(items: readonly { label: string; description?: string; folder?: ICustomizationSourceFolder; chooseAnother?: boolean }[]): Promise<{ label?: string; folder?: ICustomizationSourceFolder; chooseAnother?: boolean } | undefined>;
		};
		notificationService: { error(message: string): void; info(message: string): void; warn(message: string): void };
		fileDialogService: { showOpenDialog(): Promise<URI[]> };
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
		refreshCustomizationMigrationInfoFromMcpChange(): void;
		refreshCustomizationMigrationInfo(): Promise<void>;
		cancelCustomizationMigrationRefresh(): void;
		registerCustomizationMigrationSessionRefresh(): void;
		renderCustomizationMigrationPage(): void;
		updateCustomizationMigrationActionState(): void;
		getConfiguredLocationSettingsToClear(category: ICustomizationMigrationCategory, customizations: readonly MigratableConfiguration[]): readonly string[];
		clearConfiguredLocationSettings(settingIds: readonly string[]): Promise<void>;
		migrateSelectedCustomizations(category: ICustomizationMigrationCategory, customizations: readonly CustomizationMigrationCandidate[]): Promise<void>;
		runCustomizationMigration(customizations: readonly MigratableConfiguration[]): Promise<IMigratedCustomizationsResult>;
		setCustomizationsToMigrate(candidates: Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>, targetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>): void;
		isCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate): boolean;
		setCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate, selected: boolean): void;
		resolveCustomizationMigrationTargetFolders(
			customizations: readonly MigratableConfiguration[],
			availableSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>,
			sessionResource: URI,
		): Promise<ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>> | undefined>;
		getCustomizationMigrationDashboardDestinations(customizations: readonly MigratableConfiguration[]): readonly ICustomizationMigrationDashboardDestination[];
		getDashboardFileMigrationCandidates(): readonly MigratableConfiguration[];
		getMigrationCandidates(category: ICustomizationMigrationCategory, storage?: PromptsStorage): readonly CustomizationMigrationCandidate[];
		getCustomizationMigrationDashboardOverview(): ICustomizationMigrationDashboardOverview;
		getMigrationActivityState(storage: PromptsStorage): { activity: readonly ICustomizationMigrationDashboardActivity[]; skipped: boolean; started?: boolean };
		getMigrationActivityContext(storage: PromptsStorage): { storage: PromptsStorage; key: string; label: string };
		recordMigrationActivity(category: ICustomizationMigrationCategory, context: { storage: PromptsStorage; key: string; label: string }, items: ICustomizationMigrationDashboardActivity['items']): void;
		chooseCustomizationMigrationDestination(destination: ICustomizationMigrationDashboardDestination): Promise<void>;
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
		editor.selectedCustomizationMigrationTargets = new Map();
		editor.explicitlySelectedCustomizationMigrationTargets = new Set();
		editor.activeMigrationCategoryId = undefined;
		editor.activeMigrationStorage = undefined;
		editor.migrationWorkspaceSkipped = false;
		editor.editorDisplayMode = 'preview';
		editor.editorPreviewFrontMatterContainer = document.createElement('div');
		editor.editorPreviewDisposables = new DisposableStore();
		editor.editorDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.customizationMigrationRefreshSequence = 0;
		editor.customizationMigrationRefreshDelayer = editor.editorPreviewDisposables.add(new Delayer<void>(0));
		editor.customizationMigrationRequest = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.storageService = editor.editorPreviewDisposables.add(new InMemoryStorageService());
		editor.workspaceService = {
			activeProjectRoot: observableValue<URI | undefined>('project', URI.file('/workspace')),
			activeProjectLabel: observableValue('projectLabel', 'vscode'),
		};
		editor.harnessService = {
			activeSessionResource: observableValue('activeSessionResource', URI.parse('agent-host-test:/session-a')),
			activeHarness: observableValue('activeHarness', 'agent-host-copilotcli'),
			findHarnessById: () => undefined,
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
		editor.migrationSelectedCountElement = undefined;
		editor.migrationFooter = undefined;
		editor.migrationTitleElement = undefined;
		editor.migrationFirstFocusableElement = undefined;
		editor.migrationDestinationsContainer = undefined;
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
		editor.showCustomizationMigrationDashboard = () => { };
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
		editor.migrationWorkspaceSkipped = true;
		editor.refreshCustomizationMigrationUi();

		assert.deepStrictEqual(welcomePageCalls.map(categories => categories.map(category => category.id)), [
			[],
			[CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.UserData],
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

	test('defaults workspace file migrations to GitHub folders and preserves a custom selection', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const agent: MigratableConfiguration = {
			uri: URI.file('/workspace/custom/reviewer.agent.md'),
			storage: PromptsStorage.local,
			type: PromptsType.agent,
			source: PromptFileSource.ConfigWorkspace,
		};
		const instructions: MigratableConfiguration = {
			uri: URI.file('/workspace/custom/typescript.instructions.md'),
			storage: PromptsStorage.local,
			type: PromptsType.instructions,
			source: PromptFileSource.ConfigWorkspace,
		};
		const customFolder: ICustomizationSourceFolder = {
			uri: URI.file('/workspace/custom/skills'),
			label: 'custom/skills',
			source: AICustomizationSources.local,
		};
		const candidates = new Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>([
			[CustomizationMigrationCategoryId.PromptFiles, [prompt]],
			[CustomizationMigrationCategoryId.ConfiguredLocations, [agent, instructions]],
		]);
		const createFolders = (folderName: string): readonly ICustomizationSourceFolder[] => [
			{ uri: URI.file(`/workspace/.agents/${folderName}`), label: `.agents/${folderName}`, source: AICustomizationSources.local },
			{ uri: URI.file(`/workspace/.claude/${folderName}`), label: `.claude/${folderName}`, source: AICustomizationSources.local },
			{ uri: URI.file(`/workspace/.github/${folderName}`), label: `.github/${folderName}`, source: AICustomizationSources.local },
		];
		const targetFolders = new Map([
			[PromptsType.skill, createFolders('skills')],
			[PromptsType.agent, createFolders('agents')],
			[PromptsType.instructions, createFolders('instructions')],
		]);

		editor.setCustomizationsToMigrate(candidates, targetFolders);
		const defaultSelections = [...editor.selectedCustomizationMigrationTargets.values()].map(folder => folder.uri.path).sort();
		const skillTargetKey = `${PromptsType.skill}:${PromptsStorage.local}`;
		editor.selectedCustomizationMigrationTargets.set(skillTargetKey, createFolders('skills')[0]);
		editor.setCustomizationsToMigrate(candidates, targetFolders);
		const upgradedAutomaticSelection = editor.selectedCustomizationMigrationTargets.get(skillTargetKey)?.uri.path;
		editor.selectedCustomizationMigrationTargets.set(skillTargetKey, customFolder);
		editor.explicitlySelectedCustomizationMigrationTargets.add(skillTargetKey);
		editor.setCustomizationsToMigrate(candidates, targetFolders);

		assert.deepStrictEqual({
			defaultSelections,
			upgradedAutomaticSelection,
			preservedSelection: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path,
		}, {
			defaultSelections: [
				'/workspace/.github/agents',
				'/workspace/.github/instructions',
				'/workspace/.github/skills',
			],
			upgradedAutomaticSelection: '/workspace/.github/skills',
			preservedSelection: '/workspace/custom/skills',
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

	test('labels home-scoped migration destinations with complete tilde paths', () => {
		const editor = createTestEditor();
		const workspacePrompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const userPrompt: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/review.prompt.md'),
			storage: PromptsStorage.user,
			type: PromptsType.prompt,
			source: PromptFileSource.UserData,
		};
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.local}`, {
			uri: URI.file('/workspace/.github/skills'),
			label: '.github',
			source: AICustomizationSources.local,
		});
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.user}`, {
			uri: URI.file('/home/test/.copilot/skills'),
			label: '~/.copilot',
			source: AICustomizationSources.user,
		});
		editor.labelService.getUriLabel = () => '~/.copilot/skills';

		assert.deepStrictEqual(editor.getCustomizationMigrationDashboardDestinations([workspacePrompt, userPrompt]), [
			{
				targetType: PromptsType.skill,
				storage: PromptsStorage.local,
				contextLabel: 'Workspace skills',
				label: '.github/skills',
				ariaLabel: 'Change destination for Workspace skills, currently .github/skills',
			},
			{
				targetType: PromptsType.skill,
				storage: PromptsStorage.user,
				contextLabel: 'User skills',
				label: '~/.copilot/skills',
				ariaLabel: 'Change destination for User skills, currently ~/.copilot/skills',
			},
		]);
		editor.editorPreviewDisposables.dispose();
	});

	test('allows choosing an arbitrary migration destination', async () => {
		const editor = createTestEditor();
		editor.customizationMigrationTargetFoldersByType.set(PromptsType.skill, [
			{ uri: URI.file('/workspace/.agents/skills'), label: 'skills', source: PromptsStorage.local },
			{ uri: URI.file('/workspace/.claude/skills'), label: 'skills', source: PromptsStorage.local },
			{ uri: URI.file('/workspace/.github/skills'), label: 'skills', source: PromptsStorage.local },
		]);
		let pickerLabels: readonly string[] = [];
		let pickerDescriptions: readonly (string | undefined)[] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerLabels = items.map(item => item.label);
				pickerDescriptions = items.map(item => item.description);
				return { chooseAnother: true };
			},
		};
		editor.fileDialogService = { showOpenDialog: async () => [URI.file('/workspace/custom/skills')] };
		editor.renderCustomizationMigrationPage = () => { };

		await editor.chooseCustomizationMigrationDestination({
			targetType: PromptsType.skill,
			storage: PromptsStorage.local,
			contextLabel: 'Workspace skills',
			label: '.github/skills',
			ariaLabel: 'Change destination for workspace skills',
		});

		assert.deepStrictEqual({
			selectedPath: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path,
			pickerLabels,
			pickerDescriptions,
		}, {
			selectedPath: '/workspace/custom/skills',
			pickerLabels: ['skills', 'skills', 'Choose another folder...'],
			pickerDescriptions: ['/workspace/.github/skills (Recommended)', '/workspace/.agents/skills', 'Use a custom migration destination'],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('offers a custom folder when no default migration destination exists', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const [destination] = editor.getCustomizationMigrationDashboardDestinations([prompt]);
		let pickerLabels: readonly string[] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerLabels = items.map(item => item.label);
				return { chooseAnother: true };
			},
		};
		editor.fileDialogService = { showOpenDialog: async () => [URI.file('/workspace/custom/skills')] };
		editor.renderCustomizationMigrationPage = () => { };

		await editor.chooseCustomizationMigrationDestination(destination);

		assert.deepStrictEqual({
			destination,
			pickerLabels,
			selectedPath: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path,
		}, {
			destination: {
				targetType: PromptsType.skill,
				storage: PromptsStorage.local,
				contextLabel: 'Workspace skills',
				label: 'Not configured',
				ariaLabel: 'Configure destination for Workspace skills',
			},
			pickerLabels: ['Choose another folder...'],
			selectedPath: '/workspace/custom/skills',
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('existing migration pages retain their header without homepage destination controls', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		editor.customizationsByMigrationCategory = new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]);
		editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
		editor.activeMigrationStorage = PromptsStorage.local;
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.local}`, {
			uri: URI.file('/workspace/.github/skills'),
			label: '.github',
			source: AICustomizationSources.local,
		});
		editor.migrationListContainer = document.createElement('div');
		editor.migrationTitleElement = document.createElement('h2');
		editor.migrationDestinationsContainer = document.createElement('div');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		editor.quickInputService = { pick: async () => ({ chooseAnother: true }) };
		editor.fileDialogService = { showOpenDialog: async () => [URI.file('/workspace/custom/skills')] };
		const host = document.createElement('div');
		host.append(editor.migrationTitleElement, editor.migrationDestinationsContainer, editor.migrationListContainer);
		document.body.appendChild(host);

		try {
			editor.renderCustomizationMigrationPage();
			assert.deepStrictEqual({
				heading: editor.migrationTitleElement.textContent,
				destinationControls: host.querySelectorAll('[data-migration-destination-key]').length,
				groups: [...host.querySelectorAll('.prompt-migration-group-title')].map(heading => heading.textContent),
				collapsibleSections: host.querySelectorAll('.customization-section-toggle').length,
			}, {
				heading: 'Migrate Prompt Files',
				destinationControls: 0,
				groups: ['Workspace'],
				collapsibleSections: 0,
			});
		} finally {
			host.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('dashboard file review includes enabled file migration categories', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const agent: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.PromptFiles, [prompt]],
			[CustomizationMigrationCategoryId.UserData, [agent]],
		]);
		assert.deepStrictEqual(editor.getDashboardFileMigrationCandidates().map(customization => customization.uri.path), [
			'/workspace/.github/prompts/review.prompt.md',
			'/user-data/prompts/reviewer.agent.md',
		]);
		editor.editorPreviewDisposables.dispose();
	});

	test('root migration dashboard hides the category migration footer', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		editor.customizationsByMigrationCategory = new Map([[
			CustomizationMigrationCategoryId.PromptFiles,
			[{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			}],
		]]);
		editor.migrationListContainer = document.createElement('div');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		editor.migrationSelectedCountElement = document.createElement('span');
		editor.migrationFooter = document.createElement('div');
		editor.migrationFooter.style.display = 'none';
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderCustomizationMigrationPage();

			assert.deepStrictEqual({
				footerDisplay: editor.migrationFooter.style.display,
				countLabel: editor.migrationSelectedCountElement.textContent,
				button: { ...editor.migrationMigrateButton },
				headerButtonCount: editor.migrationListContainer.querySelectorAll('.customization-migration-dashboard-summary > .monaco-button').length,
			}, {
				footerDisplay: 'none',
				countLabel: '',
				button: { enabled: false, label: '' },
				headerButtonCount: 0,
			});
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
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

	function createMigrationRefreshEditor(compute: (session: URI, token: CancellationToken) => Promise<readonly IMcpServerCustomizationMigrationCandidate[]>) {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		}));
		store.add(editor.editorPreviewDisposables);
		const renders: boolean[] = [];
		const applied: (readonly CustomizationMigrationCandidate[])[] = [];
		editor.renderCustomizationMigrationPage = () => renders.push(editor.customizationMigrationLoading);
		editor.setCustomizationsToMigrate = candidates => {
			applied.push([...candidates.values()].flat());
			editor.renderCustomizationMigrationPage();
		};
		editor.customizationMigrationService.computeMigration = async (session, type, token = CancellationToken.None) => {
			assert.strictEqual(type, CustomizationMigrationType.McpServers);
			return {
				type: CustomizationMigrationType.McpServers,
				servers: [],
				candidates: await compute(session, token),
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			};
		};
		return { editor, renders, applied };
	}

	test('coalesces migration invalidations into one computation and loading transition', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let computations = 0;
		const { editor, renders, applied } = createMigrationRefreshEditor(async () => {
			computations++;
			return [];
		});
		editor.refreshCustomizationMigrationInfoFromMcpChange();
		editor.refreshCustomizationMigrationInfoFromMcpChange();
		editor.refreshCustomizationMigrationInfoFromPromptChange();
		await editor.refreshCustomizationMigrationInfo();
		const firstBurst = { computations, renders: [...renders], applied: [...applied] };
		editor.refreshCustomizationMigrationInfoFromMcpChange();
		await editor.refreshCustomizationMigrationInfo();
		assert.deepStrictEqual({ firstBurst, computations, renders, applied }, {
			firstBurst: { computations: 1, renders: [true, false], applied: [[]] },
			computations: 2, renders: [true, false, true, false], applied: [[], []],
		});
	}));

	test('cancels superseded migration work before applying the new session result', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const firstStarted = new DeferredPromise<void>();
		const blocked = new DeferredPromise<void>();
		const requests: { session: string; token: CancellationToken }[] = [];
		const { editor, applied } = createMigrationRefreshEditor(async (session, token) => {
			requests.push({ session: session.path, token });
			if (requests.length === 1) {
				firstStarted.complete();
				await raceCancellationError(blocked.p, token);
			}
			return [];
		});
		const first = editor.refreshCustomizationMigrationInfo();
		await firstStarted.p;
		editor.harnessService.activeSessionResource.set(URI.parse('agent-host-test:/session-b'), undefined);
		const second = editor.refreshCustomizationMigrationInfo();
		const firstCancelled = requests[0].token.isCancellationRequested;
		// Release an uncooperative provider as well, so a cancellation regression cannot hang the test.
		blocked.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ firstCancelled, sessions: requests.map(request => request.session), applied }, {
			firstCancelled: true, sessions: ['/session-a', '/session-b'], applied: [[]],
		});
	}));

	test('cancels queued migration work on close and allows a later refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let computations = 0;
		const { editor, applied } = createMigrationRefreshEditor(async () => {
			computations++;
			return [];
		});
		const pending = editor.refreshCustomizationMigrationInfo();
		editor.cancelCustomizationMigrationRefresh();
		await pending;
		const beforeReopen = computations;
		await editor.refreshCustomizationMigrationInfo();
		assert.deepStrictEqual({ beforeReopen, computations, applied }, {
			beforeReopen: 0, computations: 1, applied: [[]],
		});
	}));

	test('disposal cancels in-flight migration work without applying a result', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const started = new DeferredPromise<void>();
		const blocked = new DeferredPromise<void>();
		let requestToken: CancellationToken = CancellationToken.None;
		const { editor, applied } = createMigrationRefreshEditor(async (_session, token) => {
			requestToken = token;
			started.complete();
			await blocked.p;
			return [];
		});
		const pending = editor.refreshCustomizationMigrationInfo();
		await started.p;
		editor.editorPreviewDisposables.dispose();
		blocked.complete();
		await pending;
		await timeout(0);
		assert.deepStrictEqual({ cancelled: requestToken.isCancellationRequested, applied }, { cancelled: true, applied: [] });
	}));

	test('passes cancellation through file migration and destination discovery', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const folderStarted = new DeferredPromise<void>();
		const blocked = new DeferredPromise<void>();
		const migrationTokens: CancellationToken[] = [];
		const folderTokens: CancellationToken[] = [];
		const { editor, applied } = createMigrationRefreshEditor(async () => []);
		const candidate: MigratableConfiguration = {
			uri: URI.file('/user-data/reviewer.agent.md'),
			type: PromptsType.agent,
			storage: PromptsStorage.user,
			source: PromptFileSource.UserData,
		};
		editor.configurationService = createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
		});
		editor.customizationMigrationService.computeMigration = async (_session, _type, token = CancellationToken.None) => {
			migrationTokens.push(token);
			return { type: CustomizationMigrationType.UserData, files: [candidate.uri], candidates: [candidate] };
		};
		editor.harnessService.findHarnessById = () => ({
			id: 'agent-host-copilotcli',
			label: 'Copilot',
			icon: Codicon.copilot,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
				provideSourceFolders: async (_session, _type, token) => {
					folderTokens.push(token);
					if (folderTokens.length === 1) {
						folderStarted.complete();
						await raceCancellationError(blocked.p, token);
					}
					return [];
				},
			},
		});

		const first = editor.refreshCustomizationMigrationInfo();
		await folderStarted.p;
		const second = editor.refreshCustomizationMigrationInfo();
		const firstCancelled = folderTokens[0].isCancellationRequested;
		blocked.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({
			firstCancelled,
			migrationRequests: migrationTokens.length,
			folderRequests: folderTokens.length,
			sameTokens: migrationTokens.every((token, index) => token === folderTokens[index]),
			applied,
		}, {
			firstCancelled: true, migrationRequests: 2, folderRequests: 2, sameTokens: true, applied: [[candidate]],
		});
	}));

	test('reports migration computation errors and allows retry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let computations = 0;
		const expectedError = new Error('Migration discovery failed');
		const { editor, applied } = createMigrationRefreshEditor(async () => {
			if (++computations === 1) {
				throw expectedError;
			}
			return [];
		});
		const errors: Error[] = [];
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error));
		try {
			await editor.refreshCustomizationMigrationInfo();
			const failed = { message: editor.customizationMigrationLoadError, applied: applied.length };
			await editor.refreshCustomizationMigrationInfo();
			assert.deepStrictEqual({ failed, errors, computations, message: editor.customizationMigrationLoadError, applied }, {
				failed: { message: expectedError.message, applied: 0 },
				errors: [expectedError], computations: 2, message: undefined, applied: [[]],
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	}));

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
		const settingsGroupItems = editor.migrationListContainer.querySelector<HTMLElement>('.prompt-migration-settings-group .prompt-migration-group-items');
		const allSelected = {
			enabled: editor.migrationClearSettingsCheckbox.enabled,
			checked: editor.migrationClearSettingsCheckbox.checked,
			settingsToClear: editor.getConfiguredLocationSettingsToClear(category, customizations),
			settingsGroupTitle: editor.migrationListContainer.querySelector('.prompt-migration-settings-group .prompt-migration-group-title')?.textContent,
			hasGroupToggle: editor.migrationListContainer.querySelector('.prompt-migration-settings-group .customization-section-toggle') !== null,
			itemsHidden: settingsGroupItems?.hidden,
			settingsItemLabel: editor.migrationListContainer.querySelector('.prompt-migration-settings-item-label')?.textContent,
			settingsItemDescription: editor.migrationListContainer.querySelector('.prompt-migration-settings-item-description')?.textContent,
		};

		editor.setCustomizationSelectedForMigration(customizations[0], false);
		editor.updateCustomizationMigrationActionState();
		const partiallySelected = {
			enabled: editor.migrationClearSettingsCheckbox.enabled,
			checked: editor.migrationClearSettingsCheckbox.checked,
			settingsToClear: editor.getConfiguredLocationSettingsToClear(category, [customizations[1]]),
		};

		assert.deepStrictEqual({ allSelected, partiallySelected }, {
			allSelected: {
				enabled: true,
				checked: true,
				settingsToClear: [agentSettingId, instructionsSettingId],
				settingsGroupTitle: 'Settings',
				hasGroupToggle: false,
				itemsHidden: false,
				settingsItemLabel: 'Clear unused location settings',
				settingsItemDescription: 'Remove deprecated settings that are no longer needed after the selected customizations migrate successfully.',
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
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		}));
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
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		}));
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
		let dashboardShown = 0;
		editor.showCustomizationMigrationDashboard = () => dashboardShown++;
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
			dashboardShown,
			inProgress: editor.customizationMigrationInProgress,
			writesInProgress: editor.customizationMigrationWritesInProgress,
			activity: editor.getMigrationActivityState(PromptsStorage.local).activity.map(({ id, ...entry }) => entry),
		}, {
			migrated: [[server]],
			notifications: ['info:Migrated 1 MCP server.'],
			dashboardShown: 1,
			inProgress: false,
			writesInProgress: false,
			activity: [{
				categoryLabel: 'MCP Servers',
				scopeLabel: 'vscode',
				storage: PromptsStorage.local,
				items: [{ label: 'server', sourceLabel: '/workspace/.vscode/mcp.json', targetLabel: '/workspace/.mcp.json', operation: 'server' }],
			}],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('returns to the migration homepage after a successful file migration', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.local}`, {
			uri: URI.file('/workspace/.github/skills'),
			label: '.github',
			source: PromptsStorage.local,
		});
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		editor.runCustomizationMigration = async () => ({
			migratedCount: 1,
			failedCustomizationFileNames: [],
			unsupportedHeaderKeys: [],
			migratedCustomizations: [{ uri: URI.file('/workspace/.github/skills/review/SKILL.md'), type: PromptsType.skill }],
			migratedSources: [{ uri: prompt.uri, storage: prompt.storage }],
		});
		editor.refreshCustomizationMigrationInfo = async () => { };
		let dashboardShown = 0;
		editor.showCustomizationMigrationDashboard = () => dashboardShown++;

		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles), [prompt]);

		assert.strictEqual(dashboardShown, 1);
		editor.editorPreviewDisposables.dispose();
	});

	test('groups the homepage by location and filters existing pages without filtering global candidates', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: true,
		}));
		const profile: MigratableConfiguration = {
			uri: URI.file('/profile/review.prompt.md'), type: PromptsType.prompt, storage: PromptsStorage.user, source: PromptFileSource.UserData,
		};
		const workspace: MigratableConfiguration = {
			...profile, uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace,
		};
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.PromptFiles, [profile, workspace]],
			[CustomizationMigrationCategoryId.UserData, [{ ...profile, type: PromptsType.agent }]],
			[CustomizationMigrationCategoryId.McpServers, [server]],
			[CustomizationMigrationCategoryId.ConfiguredLocations, [workspace]],
		]);
		editor.activeMigrationStorage = PromptsStorage.user;
		editor.migrationWorkspaceSkipped = true;
		const prompts = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles);
		assert.deepStrictEqual({
			scopes: editor.getCustomizationMigrationDashboardOverview().scopes.map(scope => ({
				label: scope.label, count: scope.count, skipped: scope.skipped,
				categories: scope.categories.map(category => [category.label, category.countLabel]),
			})),
			profile: editor.getMigrationCandidates(prompts, PromptsStorage.user),
			workspace: editor.getMigrationCandidates(prompts, PromptsStorage.local),
			all: editor.getMigrationCandidates(prompts),
			mcpProfile: editor.getMigrationCandidates(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), PromptsStorage.user),
		}, {
			scopes: [
				{ label: 'Your profile', count: 2, skipped: false, categories: [['Prompts to skills', '1 prompt'], ['User Data', '1 agent']] },
				{ label: 'vscode', count: 2, skipped: true, categories: [['Prompts to skills', '1 prompt'], ['MCP Servers', '1 server']] },
			],
			profile: [profile], workspace: [workspace], all: [profile, workspace], mcpProfile: [],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('keeps the unified sidebar entry reachable when all workspace migrations are skipped', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		}));
		editor.migrationShortcutContainer = document.createElement('div');
		editor.migrationShortcutButton = document.createElement('button');
		editor.migrationShortcutCount = document.createElement('span');
		editor.layoutSidebar = () => { };
		editor.customizationsByMigrationCategory.set(CustomizationMigrationCategoryId.McpServers, [{
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		}]);
		const states: (string | null)[][] = [];
		for (const skipped of [false, true, false]) {
			editor.migrationWorkspaceSkipped = skipped;
			editor.updateSidebarMigrationShortcut();
			states.push([editor.migrationShortcutContainer.style.display, editor.migrationShortcutCount.textContent]);
		}
		editor.harnessService.activeHarness.set('local', undefined);
		editor.updateSidebarMigrationShortcut();
		states.push([editor.migrationShortcutContainer.style.display, editor.migrationShortcutCount.textContent]);
		assert.deepStrictEqual(states, [['', '1'], ['', ''], ['', '1'], ['none', '1']]);
		editor.editorPreviewDisposables.dispose();
	});

	test('persists only successful MCP activity in its initiating workspace', async () => {
		const configuration = createConfigurationServiceStub({ [ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true });
		const editor = createTestEditor(undefined, configuration);
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const failed = { ...server, id: 'failed', name: 'failed' };
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		editor.refreshCustomizationMigrationInfo = async () => { };
		editor.customizationMigrationService = {
			migrateMcpServers: async () => {
				editor.workspaceService.activeProjectRoot.set(URI.file('/other'), undefined);
				return {
					migratedCount: 1,
					failures: [{ ...failed, reason: McpServerCustomizationMigrationFailureReason.TargetConflict }],
				};
			},
		};
		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), [server, failed]);
		const reopened = createTestEditor(undefined, configuration);
		reopened.storageService = editor.storageService;
		assert.deepStrictEqual({
			currentWorkspace: editor.getMigrationActivityState(PromptsStorage.local).activity,
			profile: reopened.getMigrationActivityState(PromptsStorage.user).activity,
			reopenedWorkspace: reopened.getMigrationActivityState(PromptsStorage.local).activity.map(entry => entry.items.map(item => item.label)),
		}, {
			currentWorkspace: [], profile: [], reopenedWorkspace: [['server']],
		});
		reopened.editorPreviewDisposables.dispose();
		editor.editorPreviewDisposables.dispose();
	});

	test('persists file migration activity newest first for the initiating profile', () => {
		const editor = createTestEditor();
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles);
		const context = editor.getMigrationActivityContext(PromptsStorage.user);
		editor.recordMigrationActivity(category, context, [{
			label: 'first',
			sourceLabel: 'VS Code profile/first.prompt.md',
			targetLabel: '~/.agents/skills/first/SKILL.md',
			operation: 'converted',
		}]);
		editor.recordMigrationActivity(category, context, [{
			label: 'second',
			sourceLabel: 'VS Code profile/second.prompt.md',
			targetLabel: '~/.agents/skills/second/SKILL.md',
			operation: 'converted',
		}]);
		const state = editor.getMigrationActivityState(PromptsStorage.user);
		assert.deepStrictEqual({
			started: state.started,
			activity: state.activity.map(entry => ({
				categoryLabel: entry.categoryLabel,
				scopeLabel: entry.scopeLabel,
				storage: entry.storage,
				items: entry.items,
			})),
		}, {
			started: true,
			activity: [
				{
					categoryLabel: 'Prompts to skills',
					scopeLabel: 'Your profile',
					storage: PromptsStorage.user,
					items: [{
						label: 'second',
						sourceLabel: 'VS Code profile/second.prompt.md',
						targetLabel: '~/.agents/skills/second/SKILL.md',
						operation: 'converted',
					}],
				},
				{
					categoryLabel: 'Prompts to skills',
					scopeLabel: 'Your profile',
					storage: PromptsStorage.user,
					items: [{
						label: 'first',
						sourceLabel: 'VS Code profile/first.prompt.md',
						targetLabel: '~/.agents/skills/first/SKILL.md',
						operation: 'converted',
					}],
				},
			],
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
				pickedFolders.push(...items.flatMap(item => item.folder ? [item.folder] : []));
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
