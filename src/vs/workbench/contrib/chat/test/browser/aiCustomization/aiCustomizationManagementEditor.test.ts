/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { DeferredPromise, Delayer, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AICustomizationManagementEditor, isCurrentPluginContributionNavigation } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { IAICustomizationListItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { CustomizationMigration, CustomizationMigrationCandidate, CustomizationMigrationType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationExclusion, isMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigrationFailureReason, MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import type { ICustomizationMigrationTelemetryService } from '../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute, PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources, type AICustomizationSource } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory, ICustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import type { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import type { CustomizationMigrationTargetFolders, IMigratedCustomizationsWithFailureReasonsResult } from '../../../browser/aiCustomization/customizationMigration.js';
import type { ICustomizationMigrationCategorySummary, IInstalledCustomizationTarget } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { aiCustomizationManagementSectionRegistry, IAICustomizationManagementSectionWidget } from '../../../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { IMcpServerDetailInput } from '../../../browser/aiCustomization/embeddedMcpServerDetail.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import type { ICustomizationMigrationDashboardActivity, ICustomizationMigrationDashboardDestination, ICustomizationMigrationDashboardItem, ICustomizationMigrationDashboardOverview } from '../../../browser/aiCustomization/customizationMigrationDashboard.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IMcpWorkbenchService, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import type { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';

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

	test('routes installed discovery items to their focused list rows', async () => {
		const skillUri = URI.file('/skills/security/SKILL.md');
		const pluginUri = URI.file('/plugins/security');
		const calls: string[] = [];
		const sectionLoad = new DeferredPromise<void>();
		const editor = {
			listWidgetSectionLoad: Promise.resolve(),
			selectSection: (section: AICustomizationManagementSection) => {
				calls.push(`section:${section}`);
				editor.listWidgetSectionLoad = section === AICustomizationManagementSection.Skills ? sectionLoad.p : Promise.resolve();
			},
			isPromptsSection: (section: AICustomizationManagementSection) => section === AICustomizationManagementSection.Skills,
			revealCustomizationByUri: async (uri: URI) => { calls.push(`prompt:${uri.path}`); },
			pluginListWidget: {
				revealAndSelectItemByUri: async (uri: URI) => {
					calls.push(`plugin:${uri.path}`);
					return true;
				},
			},
			mcpListWidget: {
				revealAndSelectServer: (serverId: string | undefined, name: string) => {
					calls.push(`mcp:${serverId}:${name}`);
					return true;
				},
			},
		};
		const revealInstalledCustomization = Reflect.get(AICustomizationManagementEditor.prototype, 'revealInstalledCustomization') as (
			this: typeof editor,
			target: IInstalledCustomizationTarget,
		) => Promise<void>;

		const skillNavigation = revealInstalledCustomization.call(editor, { section: AICustomizationManagementSection.Skills, name: 'Security skill', uri: skillUri });
		await timeout(0);
		const beforeSectionLoaded = [...calls];
		sectionLoad.complete();
		await skillNavigation;
		await revealInstalledCustomization.call(editor, { section: AICustomizationManagementSection.Plugins, name: 'Security plugin', uri: pluginUri });
		await revealInstalledCustomization.call(editor, { section: AICustomizationManagementSection.McpServers, name: 'Security server', mcpServerId: 'security-server' });

		assert.deepStrictEqual({
			beforeSectionLoaded,
			calls,
		}, {
			beforeSectionLoaded: [`section:${AICustomizationManagementSection.Skills}`],
			calls: [
				`section:${AICustomizationManagementSection.Skills}`,
				'prompt:/skills/security/SKILL.md',
				`section:${AICustomizationManagementSection.Plugins}`,
				'plugin:/plugins/security',
				`section:${AICustomizationManagementSection.McpServers}`,
				'mcp:security-server:Security server',
			],
		});
	});

	test('marks an MCP detail migratable from the authoritative candidate', () => {
		const editor = createTestEditor();
		const sourceUri = URI.file('/workspace/.vscode/mcp.json');
		const states: boolean[] = [];
		editor.viewMode = 'mcpDetail';
		editor.mcpDetailInput = {
			id: 'server-row',
			name: 'server',
			label: 'Server',
			installState: McpServerInstallState.Installed,
			compatibilityId: 'server-id',
			source: { uri: sourceUri },
		};
		editor.embeddedMcpDetail = { setMigratable: migratable => states.push(migratable) };
		editor.customizationsByMigrationCategory.set(CustomizationMigrationCategoryId.McpServers, [{
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'server-id',
			name: 'server',
			sourceUri,
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'server' },
		}]);
		editor.refreshMcpDetailMigrationState();
		editor.mcpDetailInput = { ...editor.mcpDetailInput, source: { uri: URI.file('/other/.vscode/mcp.json') } };
		editor.refreshMcpDetailMigrationState();
		editor.editorPreviewDisposables.dispose();

		assert.deepStrictEqual(states, [true, false]);
	});

	type TestableEditor = {
		currentEditingPromptType: PromptsType | undefined;
		currentEditingSource: string | undefined;
		currentEditingReadOnly: boolean;
		customizationsByMigrationCategory: Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>;
		mcpServerMigrationExclusions: readonly IMcpServerCustomizationMigrationExclusion[];
		customizationMigrationTargetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>;
		customizationMigrationInProgress: boolean;
		customizationMigrationWritesInProgress: boolean;
		customizationMigrationLoading: boolean;
		customizationMigrationLoadError: string | undefined;
		customizationMigrationResultsSettled: boolean;
		customizationMigrationRefreshSequence: number;
		customizationMigrationRefreshDelayer: Delayer<void>;
		customizationMigrationRequest: DisposableStore;
		selectedCustomizationMigrationTargets: Map<string, ICustomizationSourceFolder>;
		explicitlySelectedCustomizationMigrationTargets: Set<string>;
		selectedCustomizationMigrationItems: ResourceMap<Set<PromptsStorage>>;
		selectedMcpServerMigrationItems: Set<string>;
		knownMcpServerMigrationItems: Set<string>;
		recentlyMigratedCustomizationItems: Set<string>;
		migrationShortcutContainer: HTMLElement | undefined;
		migrationShortcutButton: HTMLButtonElement | undefined;
		migrationShortcutCount: HTMLElement | undefined;
		layoutSidebar(width: number, height: number): void;
		updateSidebarMigrationShortcut(): void;
		startCustomizationMigration(categoryId?: CustomizationMigrationCategoryId, migrationFlowId?: string): Promise<void>;
		showCustomizationMigrationDashboard(): void;
		storageService: IStorageService;
		workspaceService: {
			activeProjectRoot: ISettableObservable<URI | undefined>;
			activeProjectLabel: ISettableObservable<string>;
		};
		editorDisplayMode: 'preview' | 'raw';
		currentCustomizationDetail: boolean;
		currentEditingUri: URI | undefined;
		editorModeButton: HTMLButtonElement | undefined;
		editorPreviewContainer: HTMLElement | undefined;
		embeddedEditorContainer: HTMLElement | undefined;
		editorItemDescriptionElement: HTMLElement;
		editorPreviewIssuesContainer: HTMLElement | undefined;
		editorPreviewFrontMatterSection: HTMLElement | undefined;
		editorPreviewFrontMatterTitle: HTMLElement | undefined;
		editorPreviewFrontMatterContainer: HTMLElement | undefined;
		editorPreviewBodySection: HTMLElement | undefined;
		editorPreviewBodyTitle: HTMLElement | undefined;
		editorPreviewBodyContainer: HTMLElement | undefined;
		markdownRendererService: { render(markdown: { value: string }): { element: HTMLElement; dispose(): void } };
		editorPreviewDisposables: DisposableStore;
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail';
		mcpDetailInput: IMcpServerDetailInput | undefined;
		embeddedMcpDetail: { setMigratable(migratable: boolean): void } | undefined;
		refreshMcpDetailMigrationState(): void;
		dimension: undefined;
		hoverService: IHoverService;
		instantiationService: IInstantiationService;
		configurationService: IConfigurationService;
		editorDisposables: DisposableStore;
		harnessService: { activeSessionResource: ISettableObservable<URI>; activeHarness: ISettableObservable<string>; findHarnessById: ICustomizationHarnessService['findHarnessById'] };
		migrationFlowId: string | undefined;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
		editorService: Pick<IEditorService, 'openEditor'>;
		agentPluginService: IAgentPluginService;
		mcpWorkbenchService: Pick<IMcpWorkbenchService, 'local'>;
		customizationMigrationService: Pick<ICustomizationMigrationService, 'migrateMcpServers'> & {
			computeMigration?(session: URI, type: CustomizationMigrationType, token?: CancellationToken): Promise<CustomizationMigration>;
		};
		customizationMigrationTelemetryService: ICustomizationMigrationTelemetryService;
		dialogService: Pick<IDialogService, 'confirm'>;
		quickInputService: {
			pick(items: readonly { label: string; description?: string; folder?: ICustomizationSourceFolder; destination?: ICustomizationMigrationDashboardDestination; chooseAnother?: boolean }[]): Promise<{ label?: string; folder?: ICustomizationSourceFolder; destination?: ICustomizationMigrationDashboardDestination; chooseAnother?: boolean } | undefined>;
		};
		notificationService: { error(message: string): void; info(message: string): void; warn(message: string): void };
		fileDialogService: { showOpenDialog(): Promise<URI[]> };
		showEmbeddedEditor(uri: URI, displayName: string, promptType: PromptsType, source: AICustomizationSource, isWorkspaceFile?: boolean, isReadOnly?: boolean): Promise<void>;
		getActiveHarnessLabel(): string;
		welcomePage: { setMigrationCategories(categories: readonly unknown[]): void } | undefined;
		selectedSection: AICustomizationManagementSection | undefined;
		contributedSectionContainers: Map<AICustomizationManagementSection, HTMLElement>;
		contributedSectionWidgets: Map<AICustomizationManagementSection, IAICustomizationManagementSectionWidget>;
		getActiveSectionWidget(): IAICustomizationManagementSectionWidget | undefined;
		selectSection(section: AICustomizationManagementSection): void;
		setInput: AICustomizationManagementEditor['setInput'];
		clearInput(): void;
		focus(): void;
		isVisible(): boolean;
		getEditorModeButtonLabel(): string;
		getEditorModeButtonTooltip(): string;
		updateEditorDisplayMode(): void;
		openCurrentCustomizationFile(): Promise<void>;
		renderEditorPreview(parsedPromptFile: ReturnType<PromptFileParser['parse']>, promptType: PromptsType): void;
		handleEditorActionButton(): Promise<void>;
		openCustomizationItem(item: IAICustomizationListItem): Promise<void>;
		showEmbeddedPluginDetail(item: IAgentPluginItem): Promise<void>;
		goBackToList(): void;
		showWelcomePage(options?: { resetFilters?: boolean }): void;
		renderPreviewAttribute(attribute: IHeaderAttribute, promptType: PromptsType, target: Target): void;
		onStructuredPreviewSettingChanged(): void;
		refreshCustomizationMigrationUi(): void;
		refreshCustomizationMigrationInfoFromPromptChange(): void;
		refreshCustomizationMigrationInfoFromMcpChange(): void;
		refreshCustomizationMigrationInfo(): Promise<void>;
		cancelCustomizationMigrationRefresh(): void;
		registerCustomizationMigrationSessionRefresh(): void;
		renderCustomizationMigrationDashboardState(): void;
		showEmbeddedMcpDetail(server: IMcpServerDetailInput): Promise<void>;
		openMigrationCustomization(item: ICustomizationMigrationDashboardItem, storage: PromptsStorage): Promise<void>;
		getConfiguredLocationSettingsToClear(category: ICustomizationMigrationCategory, customizations: readonly MigratableConfiguration[]): readonly string[];
		getFileMigrationConfirmationDetail(detail: string, files: readonly MigratableConfiguration[], targetFolders: CustomizationMigrationTargetFolders): string;
		getMcpMigrationConfirmationDetail(detail: string, servers: readonly IMcpServerCustomizationMigrationCandidate[]): string;
		clearConfiguredLocationSettings(settingIds: readonly string[]): Promise<void>;
		migrateSelectedCustomizations(category: ICustomizationMigrationCategory, customizations: readonly CustomizationMigrationCandidate[]): Promise<void>;
		runCustomizationMigration(customizations: readonly MigratableConfiguration[]): Promise<IMigratedCustomizationsWithFailureReasonsResult>;
		setCustomizationsToMigrate(candidates: Map<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>, targetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>, mcpServerMigrationExclusions?: readonly IMcpServerCustomizationMigrationExclusion[]): void;
		isCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate): boolean;
		setCustomizationSelectedForMigration(customization: CustomizationMigrationCandidate, selected: boolean): void;
		resolveCustomizationMigrationTargetFolders(
			customizations: readonly MigratableConfiguration[],
			availableSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>,
			sessionResource: URI,
		): Promise<ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>> | undefined>;
		getEffectiveCustomizationMigrationTargetFolder(
			customization: MigratableConfiguration,
			targetFolders: ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>,
		): ICustomizationSourceFolder | undefined;
		getCustomizationMigrationDashboardDestinations(customizations: readonly MigratableConfiguration[]): readonly ICustomizationMigrationDashboardDestination[];
		getMigrationCandidates(category: ICustomizationMigrationCategory, storage?: PromptsStorage): readonly CustomizationMigrationCandidate[];
		getCustomizationMigrationDashboardOverview(): ICustomizationMigrationDashboardOverview;
		ignoreMigrationCategory(id: CustomizationMigrationCategoryId, storage: PromptsStorage): Promise<void>;
		isMigrationCategoryIgnored(id: CustomizationMigrationCategoryId, storage: PromptsStorage): boolean;
		getMigrationActivityState(storage: PromptsStorage): { activity: readonly ICustomizationMigrationDashboardActivity[]; skipped: boolean; started?: boolean };
		getMigrationActivityContext(storage: PromptsStorage): { storage: PromptsStorage; key: string; label: string };
		recordMigrationActivity(category: ICustomizationMigrationCategory, context: { storage: PromptsStorage; key: string; label: string }, items: ICustomizationMigrationDashboardActivity['items']): void;
		configureCustomizationMigrationLocations(id: CustomizationMigrationCategoryId, storage: PromptsStorage): Promise<void>;
		chooseCustomizationMigrationDestination(destination: ICustomizationMigrationDashboardDestination): Promise<void>;
		updateContentVisibility(): void;
		selectSectionById(section: AICustomizationManagementSection, options?: { showMarketplace?: boolean }): void;
		rebuildVisibleSections(): void;
		updateContributedSectionEnablement(): void;
		setVisible(visible: boolean): void;
	};

	function createConfigurationServiceStub(values: Record<string, unknown> = {}): IConfigurationService {
		// Default to enabling the structured preview so existing assertions exercise the preview path.
		const merged: Record<string, unknown> = {
			[ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
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
		editor.mcpServerMigrationExclusions = [];
		editor.customizationMigrationTargetFoldersByType = new Map();
		editor.customizationMigrationInProgress = false;
		editor.customizationMigrationWritesInProgress = false;
		editor.customizationMigrationLoading = false;
		editor.customizationMigrationResultsSettled = false;
		editor.selectedCustomizationMigrationTargets = new Map();
		editor.explicitlySelectedCustomizationMigrationTargets = new Set();
		editor.selectedCustomizationMigrationItems = new ResourceMap();
		editor.selectedMcpServerMigrationItems = new Set();
		editor.knownMcpServerMigrationItems = new Set();
		editor.recentlyMigratedCustomizationItems = new Set();
		editor.migrationFlowId = undefined;
		editor.editorDisplayMode = 'preview';
		editor.currentCustomizationDetail = false;
		editor.currentEditingUri = undefined;
		editor.editorModeButton = document.createElement('button');
		editor.editorPreviewContainer = document.createElement('div');
		editor.embeddedEditorContainer = document.createElement('div');
		editor.editorItemDescriptionElement = document.createElement('div');
		editor.editorPreviewIssuesContainer = document.createElement('div');
		editor.editorPreviewFrontMatterSection = document.createElement('section');
		editor.editorPreviewFrontMatterTitle = document.createElement('h2');
		editor.editorPreviewFrontMatterContainer = document.createElement('div');
		editor.editorPreviewFrontMatterSection.append(editor.editorPreviewFrontMatterTitle, editor.editorPreviewFrontMatterContainer);
		editor.editorPreviewBodySection = document.createElement('section');
		editor.editorPreviewBodyTitle = document.createElement('h2');
		editor.editorPreviewBodyContainer = document.createElement('div');
		editor.editorPreviewBodySection.append(editor.editorPreviewBodyTitle, editor.editorPreviewBodyContainer);
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
		editor.markdownRendererService = {
			render: markdown => {
				const element = document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose() { } };
			},
		};
		editor.labelService = {
			getUriLabel: uri => uri.path,
		};
		editor.editorService = {
			openEditor: async () => undefined,
		};
		editor.mcpWorkbenchService = { local: [] };
		editor.customizationMigrationService = {
			migrateMcpServers: async () => ({ migratedCount: 0, failures: [] }),
		};
		editor.customizationMigrationTelemetryService = {
			_serviceBrand: undefined,
			hintComputed: () => { },
			hintShown: () => { },
			hintClicked: () => { },
			pageShown: () => { },
			actionClicked: () => { },
			migrationClicked: () => { },
			migrationCompleted: () => { },
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
		editor.contributedSectionWidgets = new Map();
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

	function createContributedSectionEditor(enablementSettings?: readonly string[]) {
		const editor = createTestEditor();
		store.add(editor.editorPreviewDisposables);
		const visibilityChanges: boolean[] = [];
		const focusedVisibility: boolean[] = [];
		const state = { created: 0, visible: false, promptsFocused: 0, disposed: 0 };
		const section = AICustomizationManagementSection.HarnessSettings;
		const harnessId = 'contributed-section-lifecycle-test';
		editor.harnessService.activeHarness.set(harnessId, undefined);
		editor.contributedSectionContainers.set(section, document.createElement('div'));
		Object.assign(editor, {
			inEditorContextKey: { set() { } },
			sectionContextKey: { set() { } },
			builtinEditingSessions: new Map(),
			telemetryService: NullTelemetryService,
			listWidget: { focusSearch() { state.promptsFocused++; } },
		});
		Object.assign(editor.workspaceService, { clearOverrideProjectRoot() { } });
		editor.refreshCustomizationMigrationInfo = async () => { };
		store.add(aiCustomizationManagementSectionRegistry.register({
			id: section,
			label: 'Test harness settings',
			description: 'Test contributed section lifecycle',
			icon: Codicon.search,
			enablementSettings,
			supportsHarness: id => id === harnessId,
			create: () => {
				state.created++;
				return {
					setVisible(visible: boolean) {
						state.visible = visible;
						visibilityChanges.push(visible);
					},
					focus() { focusedVisibility.push(state.visible); },
					dispose() { state.disposed++; state.visible = false; },
				};
			},
		}));
		return { editor, section, state, visibilityChanges, focusedVisibility };
	}

	function createGatedSectionEditor(enabled?: boolean, enablementSettings: readonly string[] = [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]) {
		const context = createContributedSectionEditor(enablementSettings);
		const { editor, section } = context;
		const configuration = createConfigurationServiceStub({ [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: enabled });
		editor.configurationService = configuration;
		Object.assign(editor, { marketplaceService: { sources: [CustomizationMarketplaceSources.AgentFinderPublicFeed] } });
		const sections: { id: AICustomizationManagementSection }[] = [];
		let overview: readonly AICustomizationManagementSection[] = [];
		Object.assign(editor, {
			allSections: [
				{ id: AICustomizationManagementSection.Agents, label: 'Agents', description: '', icon: Codicon.copilot, count: 0 },
				{ id: section, label: 'Experimental section', description: '', icon: Codicon.search, count: 0 },
			],
			sections,
			welcomePage: {
				container: $('div'),
				rebuildCards(ids: ReadonlySet<AICustomizationManagementSection>) { overview = [...ids]; },
				setVisible() { },
			},
			showWelcomePage() { editor.selectedSection = undefined; },
		});
		return { ...context, configuration, sections, getOverview: () => overview };
	}

	for (const enabled of [undefined, false]) {
		test(`does not expose or instantiate a contributed section when its experiment is ${enabled === undefined ? 'unset' : 'disabled'}`, () => {
			const { editor, section, state, sections, getOverview } = createGatedSectionEditor(enabled);
			editor.selectedSection = section;
			editor.setVisible(true);
			editor.focus();
			editor.rebuildVisibleSections();
			editor.selectSectionById(section);

			assert.deepStrictEqual({
				created: state.created,
				sections: sections.map(section => section.id),
				overview: getOverview(),
				selected: editor.selectedSection,
				widget: editor.getActiveSectionWidget(),
			}, {
				created: 0,
				sections: [AICustomizationManagementSection.Agents],
				overview: [AICustomizationManagementSection.Agents],
				selected: undefined,
				widget: undefined,
			});
		});
	}

	test('disabling a section experiment disposes its widget and restores the overview', async () => {
		const { editor, section, state, sections, getOverview, configuration } = createGatedSectionEditor(true);
		editor.rebuildVisibleSections();
		editor.setVisible(true);
		editor.selectSectionById(section);
		const container = editor.contributedSectionContainers.get(section)!;
		container.textContent = 'Feature content';

		await configuration.updateValue(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		editor.updateContributedSectionEnablement();
		const disabled = {
			created: state.created,
			disposed: state.disposed,
			widget: editor.getActiveSectionWidget(),
			selected: editor.selectedSection,
			content: container.textContent,
			sections: sections.map(section => section.id),
			overview: getOverview(),
		};
		await configuration.updateValue(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		editor.updateContributedSectionEnablement();
		editor.selectSectionById(section);

		assert.deepStrictEqual({ disabled, reenabled: { created: state.created, disposed: state.disposed, visible: state.visible } }, {
			disabled: {
				created: 1, disposed: 1, widget: undefined, selected: undefined, content: '',
				sections: [AICustomizationManagementSection.Agents],
				overview: [AICustomizationManagementSection.Agents],
			},
			reenabled: { created: 2, disposed: 1, visible: true },
		});
	});

	test('keeps a contributed section alive while either source is enabled', async () => {
		const secondSetting = 'test.marketplace.second.enabled';
		const { editor, section, state, sections, getOverview, configuration } = createGatedSectionEditor(
			true, [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, secondSetting]);
		editor.rebuildVisibleSections();
		editor.setVisible(true);
		editor.selectSectionById(section);
		const firstWidget = editor.getActiveSectionWidget();
		await configuration.updateValue(secondSetting, true);
		editor.updateContributedSectionEnablement();
		await configuration.updateValue(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		editor.updateContributedSectionEnablement();
		const remainingSource = {
			sameWidget: editor.getActiveSectionWidget() === firstWidget,
			selected: editor.selectedSection,
			created: state.created,
			disposed: state.disposed,
			visible: state.visible,
			sections: sections.map(section => section.id),
			overview: getOverview(),
		};
		await configuration.updateValue(secondSetting, false);
		editor.updateContributedSectionEnablement();
		const noneEnabled = {
			widget: editor.getActiveSectionWidget(),
			selected: editor.selectedSection,
			disposed: state.disposed,
			sections: sections.map(section => section.id),
		};
		await configuration.updateValue(secondSetting, true);
		editor.updateContributedSectionEnablement();
		editor.selectSectionById(section);
		assert.deepStrictEqual({ remainingSource, noneEnabled, reenabled: { created: state.created, visible: state.visible } }, {
			remainingSource: {
				sameWidget: true, selected: section, created: 1, disposed: 0, visible: true,
				sections: [AICustomizationManagementSection.Agents, section],
				overview: [AICustomizationManagementSection.Agents, section],
			},
			noneEnabled: { widget: undefined, selected: undefined, disposed: 1, sections: [AICustomizationManagementSection.Agents] },
			reenabled: { created: 2, visible: true },
		});
	});

	test('marketplace deep links open type-filtered Discover only when it is enabled', async () => {
		const { editor, configuration } = createGatedSectionEditor(true);
		const queries: string[] = [];
		Object.assign(editor, {
			welcomePage: {
				setSearchQuery(query: string) { queries.push(query); },
			},
		});
		await configuration.updateValue(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		editor.selectSectionById(AICustomizationManagementSection.Plugins, { showMarketplace: true });
		await configuration.updateValue(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		editor.selectSectionById(AICustomizationManagementSection.Skills, { showMarketplace: true });
		editor.selectSectionById(AICustomizationManagementSection.McpServers, { showMarketplace: true });
		editor.selectSectionById(AICustomizationManagementSection.Plugins, { showMarketplace: true });
		await configuration.updateValue(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		editor.selectSectionById(AICustomizationManagementSection.Skills, { showMarketplace: true });
		editor.selectSectionById(AICustomizationManagementSection.McpServers, { showMarketplace: true });
		editor.selectSectionById(AICustomizationManagementSection.Plugins, { showMarketplace: true });
		assert.deepStrictEqual(queries, ['@type:skill', '@type:mcp', '@type:plugin']);
	});

	test('showing Discover from its navigation button resets its filters', () => {
		const { editor } = createContributedSectionEditor();
		const calls: string[] = [];
		const homeButton = $('button');
		Object.assign(editor, {
			homeButton,
			welcomePage: {
				container: $('div'),
				setVisible() { },
				resetFilters() { calls.push('resetFilters'); },
				reset() { },
				focus() { },
			},
		});

		editor.showWelcomePage({ resetFilters: true });

		assert.deepStrictEqual({
			calls,
			selected: homeButton.classList.contains('selected'),
			ariaCurrent: homeButton.getAttribute('aria-current'),
		}, {
			calls: ['resetFilters'],
			selected: true,
			ariaCurrent: 'page',
		});
	});

	test('a contributed section with no source settings remains hidden', () => {
		const { editor, state, section, sections } = createGatedSectionEditor(true, []);
		editor.rebuildVisibleSections();
		editor.selectSectionById(section);
		assert.deepStrictEqual({ created: state.created, sections: sections.map(section => section.id) }, {
			created: 0, sections: [AICustomizationManagementSection.Agents],
		});
	});

	for (const visible of [false, true]) {
		test(`initializes contributed widget visibility before focusing in a ${visible ? 'visible' : 'hidden'} editor`, () => {
			const { editor, section, state, visibilityChanges, focusedVisibility } = createContributedSectionEditor();
			editor.selectedSection = section;
			editor.setVisible(visible);
			const createdBeforeFocus = state.created;
			editor.focus();
			const firstWidget = editor.getActiveSectionWidget();
			editor.focus();

			assert.deepStrictEqual({
				createdBeforeFocus,
				created: state.created,
				visibilityChanges,
				focusedVisibility,
				reused: editor.getActiveSectionWidget() === firstWidget,
				promptsFocused: state.promptsFocused,
			}, {
				createdBeforeFocus: 0,
				created: 1,
				visibilityChanges: [visible],
				focusedVisibility: [visible, visible],
				reused: true,
				promptsFocused: 0,
			});
		});
	}

	test('reopening input reactivates the selected contributed widget without a visibility transition', async () => {
		const { editor, section, state, visibilityChanges } = createContributedSectionEditor();
		const firstInput = store.add(new AICustomizationManagementEditorInput());
		const reopenedInput = store.add(new AICustomizationManagementEditorInput());
		editor.selectedSection = section;
		editor.setVisible(true);
		editor.focus();
		await editor.setInput(firstInput, undefined, {}, CancellationToken.None);
		const widget = editor.getActiveSectionWidget();
		visibilityChanges.length = 0;

		editor.clearInput();
		const afterClose = { editorVisible: editor.isVisible(), widgetVisible: state.visible };
		await editor.setInput(reopenedInput, undefined, {}, CancellationToken.None);

		assert.deepStrictEqual({
			afterClose,
			editorVisible: editor.isVisible(),
			widgetVisible: state.visible,
			visibilityChanges,
			reused: editor.getActiveSectionWidget() === widget,
			created: state.created,
		}, {
			afterClose: { editorVisible: true, widgetVisible: false },
			editorVisible: true,
			widgetVisible: true,
			visibilityChanges: [false, true],
			reused: true,
			created: 1,
		});
	});

	test('reopening input reactivates Discover without a visibility transition', async () => {
		const { editor } = createContributedSectionEditor();
		const firstInput = store.add(new AICustomizationManagementEditorInput());
		const reopenedInput = store.add(new AICustomizationManagementEditorInput());
		const visibilityChanges: boolean[] = [];
		editor.selectedSection = undefined;
		Object.assign(editor, {
			welcomePage: {
				setVisible(visible: boolean) {
					visibilityChanges.push(visible);
				},
			},
		});
		editor.setVisible(true);
		await editor.setInput(firstInput, undefined, {}, CancellationToken.None);
		visibilityChanges.length = 0;

		editor.clearInput();
		await editor.setInput(reopenedInput, undefined, {}, CancellationToken.None);

		assert.deepStrictEqual(visibilityChanges, [false, true]);
	});

	test('selecting a contributed section focuses its widget instead of the hidden prompts search', () => {
		const { editor, section, state, focusedVisibility } = createContributedSectionEditor();
		editor.setVisible(true);
		editor.selectSection(section);

		assert.deepStrictEqual({
			created: state.created,
			visible: state.visible,
			focusedVisibility,
			promptsFocused: state.promptsFocused,
		}, {
			created: 1,
			visible: true,
			focusedVisibility: [true],
			promptsFocused: 0,
		});
	});

	test('contributed sections load only in the selected visible editor and hide in detail modes', () => {
		const editor = createTestEditor();
		store.add(editor.editorPreviewDisposables);
		let marketplaceVisible = false;
		let otherVisible = false;
		const marketplace = editor.editorDisposables.add({
			setVisible(visible: boolean) { marketplaceVisible = visible; },
			dispose() { },
		});
		const other = editor.editorDisposables.add({
			setVisible(visible: boolean) { otherVisible = visible; },
			dispose() { },
		});
		editor.contributedSectionContainers.set(AICustomizationManagementSection.Marketplace, document.createElement('div'));
		editor.contributedSectionContainers.set(AICustomizationManagementSection.HarnessSettings, document.createElement('div'));
		editor.contributedSectionWidgets.set(AICustomizationManagementSection.Marketplace, marketplace);
		editor.contributedSectionWidgets.set(AICustomizationManagementSection.HarnessSettings, other);
		const readVisibility = () => ({
			marketplaceVisible,
			otherVisible,
			active: editor.getActiveSectionWidget() === marketplace ? 'marketplace' : editor.getActiveSectionWidget() === other ? 'other' : undefined,
		});

		editor.selectedSection = AICustomizationManagementSection.Marketplace;
		editor.updateContentVisibility();
		const hidden = readVisibility();
		editor.setVisible(true);
		const visible = readVisibility();
		const detailModes = ['editor', 'migration', 'mcpDetail', 'pluginDetail', 'toolsDetail'] as const;
		const hiddenInDetails = detailModes.map(mode => {
			editor.viewMode = mode;
			editor.updateContentVisibility();
			return readVisibility();
		});
		editor.viewMode = 'list';
		editor.selectedSection = AICustomizationManagementSection.HarnessSettings;
		editor.updateContentVisibility();
		const switched = readVisibility();
		editor.setVisible(false);
		const closed = readVisibility();
		editor.setVisible(true);
		const reopened = readVisibility();
		editor.selectedSection = undefined;
		editor.updateContentVisibility();
		const welcome = readVisibility();

		assert.deepStrictEqual({
			hidden, visible, hiddenInDetails, switched, closed, reopened, welcome,
		}, {
			hidden: { marketplaceVisible: false, otherVisible: false, active: 'marketplace' },
			visible: { marketplaceVisible: true, otherVisible: false, active: 'marketplace' },
			hiddenInDetails: detailModes.map(() => ({ marketplaceVisible: false, otherVisible: false, active: undefined })),
			switched: { marketplaceVisible: false, otherVisible: true, active: 'other' },
			closed: { marketplaceVisible: false, otherVisible: false, active: 'other' },
			reopened: { marketplaceVisible: false, otherVisible: true, active: 'other' },
			welcome: { marketplaceVisible: false, otherVisible: false, active: undefined },
		});
	});

	test('clearing input hides contributed widgets before their editor disposes them', () => {
		const editor = createTestEditor();
		store.add(editor.editorPreviewDisposables);
		Object.assign(editor, {
			inEditorContextKey: { set() { } },
			builtinEditingSessions: new Map(),
		});
		Object.assign(editor.workspaceService, { clearOverrideProjectRoot() { } });
		const events: (boolean | 'disposed')[] = [];
		const widget = editor.editorDisposables.add({
			setVisible(visible: boolean) { events.push(visible); },
			dispose() { events.push('disposed'); },
		});
		editor.contributedSectionWidgets.set(AICustomizationManagementSection.Marketplace, widget);
		editor.selectedSection = AICustomizationManagementSection.Marketplace;

		editor.setVisible(true);
		editor.clearInput();
		const afterClear = events.slice();
		editor.editorDisposables.clear();

		assert.deepStrictEqual({ afterClear, events }, {
			afterClear: [true, false],
			events: [true, false, 'disposed'],
		});
	});

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

	test('uses direct source editing copy for built-in skills that support raw overrides', () => {
		const editor = createTestEditor();
		editor.currentEditingPromptType = PromptsType.skill;
		editor.currentEditingSource = AICustomizationSources.builtin;
		editor.currentEditingReadOnly = true;
		editor.editorDisplayMode = 'preview';

		assert.deepStrictEqual({
			label: editor.getEditorModeButtonLabel(),
			tooltip: editor.getEditorModeButtonTooltip(),
		}, {
			label: 'Edit Source',
			tooltip: 'Edit this skill directly in the source editor',
		});

		editor.editorPreviewDisposables.dispose();
	});

	test('file-backed customization details always show their source editor without a mode toggle', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: false,
		}));
		const uri = URI.file('/workspace/.github/skills/review/SKILL.md');
		const opened: object[] = [];
		editor.currentCustomizationDetail = true;
		editor.currentEditingUri = uri;
		editor.currentEditingSource = AICustomizationSources.local;
		editor.currentEditingReadOnly = false;
		editor.editorService = {
			openEditor: async input => {
				opened.push(input);
				return undefined;
			},
		};

		const detailStates = [PromptsType.skill, PromptsType.agent, PromptsType.prompt, PromptsType.instructions, PromptsType.hook].map(promptType => {
			editor.currentEditingPromptType = promptType;
			editor.editorDisplayMode = 'raw';
			editor.updateEditorDisplayMode();
			return {
				promptType,
				modeButton: editor.editorModeButton?.style.display,
				modeButtonLabel: editor.editorModeButton?.textContent,
				preview: editor.editorPreviewContainer?.style.display,
				embeddedEditor: editor.embeddedEditorContainer?.style.display,
			};
		});
		await editor.openCurrentCustomizationFile();

		assert.deepStrictEqual({
			detailStates,
			opened,
		}, {
			detailStates: [
				{
					promptType: PromptsType.skill,
					modeButton: 'none', modeButtonLabel: '', preview: 'none', embeddedEditor: '',
				},
				{
					promptType: PromptsType.agent,
					modeButton: 'none', modeButtonLabel: '', preview: 'none', embeddedEditor: '',
				},
				{
					promptType: PromptsType.prompt,
					modeButton: 'none', modeButtonLabel: '', preview: 'none', embeddedEditor: '',
				},
				{
					promptType: PromptsType.instructions,
					modeButton: 'none', modeButtonLabel: '', preview: 'none', embeddedEditor: '',
				},
				{
					promptType: PromptsType.hook,
					modeButton: 'none', modeButtonLabel: '', preview: 'none', embeddedEditor: '',
				},
			],
			opened: [{ resource: uri, options: { pinned: true } }],
		});

		editor.editorPreviewDisposables.dispose();
	});

	test('customization details use frontmatter descriptions and hide empty or unlabeled sections', () => {
		const editor = createTestEditor();
		const parser = new PromptFileParser();
		editor.currentCustomizationDetail = true;

		editor.renderEditorPreview(parser.parse(URI.file('/workspace/review.agent.md'), [
			'---',
			'name: review',
			'description: Reviews code',
			'model: fast',
			'---',
			'Review the current changes.',
		].join('\n')), PromptsType.agent);

		const withDescription = {
			description: editor.editorItemDescriptionElement.textContent,
			detailTitle: editor.editorPreviewFrontMatterTitle?.style.display,
			detailKeys: [...editor.editorPreviewFrontMatterContainer?.querySelectorAll<HTMLElement>('.editor-preview-row-key') ?? []].map(element => element.textContent),
			instructionsTitle: editor.editorPreviewBodyTitle?.style.display,
		};

		editor.renderEditorPreview(parser.parse(URI.file('/workspace/minimal.instructions.md'), [
			'---',
			'name: minimal',
			'---',
			'Follow the workspace conventions.',
		].join('\n')), PromptsType.instructions);

		assert.deepStrictEqual({
			withDescription,
			withoutDescription: {
				descriptionDisplay: editor.editorItemDescriptionElement.style.display,
				detailsDisplay: editor.editorPreviewFrontMatterSection?.style.display,
				instructionsDisplay: editor.editorPreviewBodySection?.style.display,
				instructionsTitle: editor.editorPreviewBodyTitle?.style.display,
			},
		}, {
			withDescription: {
				description: 'Reviews code',
				detailTitle: '',
				detailKeys: ['model'],
				instructionsTitle: '',
			},
			withoutDescription: {
				descriptionDisplay: 'none',
				detailsDisplay: 'none',
				instructionsDisplay: '',
				instructionsTitle: 'none',
			},
		});

		editor.editorPreviewDisposables.dispose();
	});

	test('customization detail back action restores its navigation origin', async () => {
		const editor = createTestEditor();
		let backInvocations = 0;
		editor.currentCustomizationDetail = true;
		editor.goBackToList = () => backInvocations++;

		await editor.handleEditorActionButton();

		assert.strictEqual(backInvocations, 1);
		editor.editorPreviewDisposables.dispose();
	});

	test('opens plugin-provided skills in the owning plugin detail', async () => {
		const editor = createTestEditor();
		const pluginUri = URI.file('/plugins/example');
		const skillUri = URI.joinPath(pluginUri, 'skills', 'review', 'SKILL.md');
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = pluginUri;
			override readonly label = 'Example Plugin';
		};
		editor.agentPluginService = new class extends mock<IAgentPluginService>() {
			override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', [plugin]);
		};
		editor.selectedSection = AICustomizationManagementSection.Skills;
		editor.viewMode = 'list';
		let opened: IAgentPluginItem | undefined;
		editor.showEmbeddedPluginDetail = async item => {
			opened = item;
		};

		await editor.openCustomizationItem({
			id: skillUri.toString(),
			uri: skillUri,
			name: 'Review',
			filename: 'SKILL.md',
			source: AICustomizationSources.plugin,
			promptType: PromptsType.skill,
			disabled: false,
			pluginUri,
		});

		assert.deepStrictEqual(opened && {
			kind: opened.kind,
			name: opened.name,
			pluginUri: opened.kind === AgentPluginItemKind.Installed ? opened.plugin.uri.toString() : undefined,
		}, {
			kind: AgentPluginItemKind.Installed,
			name: 'Example Plugin',
			pluginUri: pluginUri.toString(),
		});
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

	test('gates all migration categories on the migration setting', () => {
		const welcomePageCalls: ICustomizationMigrationCategorySummary[][] = [];
		const configurationService = createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: false,
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
		configurationService.setValue(ChatConfiguration.ChatCustomizationsMigrationEnabled, true);
		editor.refreshCustomizationMigrationUi();
		configurationService.setValue('chat.agentFilesLocations', { '/workspace/custom-agents': true });
		editor.refreshCustomizationMigrationUi();
		assert.deepStrictEqual(welcomePageCalls.map(categories => categories.map(category => category.id)), [
			[],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData, CustomizationMigrationCategoryId.ConfiguredLocations],
		]);
		editor.editorPreviewDisposables.dispose();
	});

	test('selects new migration items by default and preserves explicit deselection', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const first: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/first.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const second: MigratableConfiguration = {
			...first,
			uri: URI.file('/workspace/.github/prompts/second.prompt.md'),
		};
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [first]]]), new Map());
		const initiallySelected = editor.isCustomizationSelectedForMigration(first);
		editor.setCustomizationSelectedForMigration(first, false);
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [first, second]]]), new Map());

		assert.deepStrictEqual({
			initiallySelected,
			firstAfterRefresh: editor.isCustomizationSelectedForMigration(first),
			secondAfterRefresh: editor.isCustomizationSelectedForMigration(second),
		}, {
			initiallySelected: true,
			firstAfterRefresh: false,
			secondAfterRefresh: true,
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('persists ignored migration groups and removes them from the dashboard', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]), new Map());

		await editor.ignoreMigrationCategory(CustomizationMigrationCategoryId.PromptFiles, PromptsStorage.local);
		const overview = editor.getCustomizationMigrationDashboardOverview();

		assert.deepStrictEqual({
			ignored: editor.isMigrationCategoryIgnored(CustomizationMigrationCategoryId.PromptFiles, PromptsStorage.local),
			hasIgnoredGroups: overview.hasIgnoredGroups,
			visibleCategories: overview.scopes.flatMap(scope => scope.categories.map(category => category.id)),
		}, {
			ignored: true,
			hasIgnoredGroups: true,
			visibleCategories: [],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('defaults workspace file migrations to GitHub folders and preserves a custom selection', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
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

	test('uses the common parent for migration groups with multiple destinations', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const agent: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		const instructions: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/style.instructions.md'),
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.UserData, [agent, instructions]]]), new Map());
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.agent}:${PromptsStorage.user}`, {
			uri: URI.file('/home/test/.agents/agents'),
			label: '~/.agents/agents',
			source: PromptsStorage.user,
		});
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.instructions}:${PromptsStorage.user}`, {
			uri: URI.file('/home/test/.agents/instructions'),
			label: '~/.agents/instructions',
			source: PromptsStorage.user,
		});
		const category = editor.getCustomizationMigrationDashboardOverview().scopes
			.find(scope => scope.storage === PromptsStorage.user)?.categories
			.find(category => category.id === CustomizationMigrationCategoryId.UserData);

		assert.strictEqual(category?.destinationLabel, '~/.agents');
		editor.editorPreviewDisposables.dispose();
	});

	test('opens the folder picker directly for a single-type migration group', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const targetFolders = new Map([[PromptsType.skill, [{
			uri: URI.file('/workspace/.github/skills'),
			label: 'skills',
			source: PromptsStorage.local,
		}]]]);
		editor.labelService.getUriLabel = (uri, options) => options?.relative ? uri.path.replace('/workspace/', '') : uri.path;
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]), targetFolders);
		const pickerLabels: string[][] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerLabels.push(items.map(item => item.label));
				return { folder: items[0].folder };
			},
		};
		editor.renderCustomizationMigrationDashboardState = () => { };
		const destinationLabel = editor.getCustomizationMigrationDashboardOverview().scopes
			.find(scope => scope.storage === PromptsStorage.local)?.categories
			.find(category => category.id === CustomizationMigrationCategoryId.PromptFiles)?.destinationLabel;

		await editor.configureCustomizationMigrationLocations(CustomizationMigrationCategoryId.PromptFiles, PromptsStorage.local);

		assert.deepStrictEqual({
			destinationLabel,
			pickerLabels,
		}, {
			destinationLabel: '.github/skills',
			pickerLabels: [['skills', 'Choose another folder...']],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('offers another folder only after choosing a multi-type migration location', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const agent: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		const instructions: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/style.instructions.md'),
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const targetFolders = new Map([
			[PromptsType.agent, [{ uri: URI.file('/home/test/.agents/agents'), label: 'agents', source: PromptsStorage.user }]],
			[PromptsType.instructions, [{ uri: URI.file('/home/test/.agents/instructions'), label: 'instructions', source: PromptsStorage.user }]],
		]);
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.UserData, [agent, instructions]]]), targetFolders);
		const pickerLabels: string[][] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerLabels.push(items.map(item => item.label));
				return pickerLabels.length === 1 ? { destination: items[0].destination } : { chooseAnother: true };
			},
		};
		editor.fileDialogService = { showOpenDialog: async () => [URI.file('/home/test/custom/agents')] };
		editor.renderCustomizationMigrationDashboardState = () => { };

		await editor.configureCustomizationMigrationLocations(CustomizationMigrationCategoryId.UserData, PromptsStorage.user);

		assert.deepStrictEqual({
			pickerLabels,
			selectedPath: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.agent}:${PromptsStorage.user}`)?.uri.path,
		}, {
			pickerLabels: [
				['User agents', 'User instructions'],
				['agents', 'Choose another folder...'],
			],
			selectedPath: '/home/test/custom/agents',
		});
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
		editor.renderCustomizationMigrationDashboardState = () => { };

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
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
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
		editor.renderCustomizationMigrationDashboardState = () => { };

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

	function createMigrationRefreshEditor(compute: (session: URI, token: CancellationToken) => Promise<readonly IMcpServerCustomizationMigrationCandidate[]>, mcpServerMigrationEnabled = true) {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: mcpServerMigrationEnabled,
		}));
		store.add(editor.editorPreviewDisposables);
		const renders: boolean[] = [];
		const applied: (readonly CustomizationMigrationCandidate[])[] = [];
		editor.renderCustomizationMigrationDashboardState = () => renders.push(editor.customizationMigrationLoading);
		editor.setCustomizationsToMigrate = (candidates, targetFoldersByType) => {
			applied.push([...candidates.values()].flat());
			editor.customizationsByMigrationCategory = candidates;
			editor.customizationMigrationTargetFoldersByType = targetFoldersByType;
			editor.customizationMigrationResultsSettled = true;
			editor.renderCustomizationMigrationDashboardState();
		};
		editor.customizationMigrationService.computeMigration = async (session, type, token = CancellationToken.None) => {
			if (type !== CustomizationMigrationType.McpServers) {
				return { type, files: [], candidates: [] };
			}
			return {
				type: CustomizationMigrationType.McpServers,
				servers: [],
				candidates: await compute(session, token),
				exclusions: [],
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			};
		};
		return { editor, renders, applied };
	}

	test('coalesces migration invalidations and retains settled content during background refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			computations: 2, renders: [true, false, false], applied: [[], []],
		});
	}));

	test('keeps a new context loading when its first refresh is superseded', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const serverA: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'server-a',
			name: 'server-a',
			sourceUri: URI.file('/workspace-a/.vscode/mcp.json'),
			targetUri: URI.file('/workspace-a/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const firstBStarted = new DeferredPromise<void>();
		const secondBStarted = new DeferredPromise<void>();
		const firstBBlocked = new DeferredPromise<void>();
		const secondBBlocked = new DeferredPromise<void>();
		const requests: { session: string; token: CancellationToken }[] = [];
		const { editor, applied } = createMigrationRefreshEditor(async (session, token) => {
			requests.push({ session: session.path, token });
			if (session.path === '/session-a') {
				return [serverA];
			}
			if (requests.filter(request => request.session === '/session-b').length === 1) {
				firstBStarted.complete();
				await raceCancellationError(firstBBlocked.p, token);
			} else {
				secondBStarted.complete();
				await raceCancellationError(secondBBlocked.p, token);
			}
			return [];
		});
		await editor.refreshCustomizationMigrationInfo();
		editor.customizationMigrationTargetFoldersByType.set(PromptsType.agent, [{
			uri: URI.file('/workspace-a/.github/agents'),
			label: '.github/agents',
			source: AICustomizationSources.local,
		}]);

		editor.harnessService.activeSessionResource.set(URI.parse('agent-host-test:/session-b'), undefined);
		const firstB = editor.refreshCustomizationMigrationInfo();
		await firstBStarted.p;
		const secondB = editor.refreshCustomizationMigrationInfo();
		await secondBStarted.p;
		editor.renderCustomizationMigrationDashboardState();
		const pendingState = {
			loading: editor.customizationMigrationLoading,
			settled: editor.customizationMigrationResultsSettled,
			candidates: [...editor.customizationsByMigrationCategory.values()].flat(),
			targetFolders: [...editor.customizationMigrationTargetFoldersByType.values()].flat(),
		};
		firstBBlocked.complete();
		secondBBlocked.complete();
		await Promise.all([firstB, secondB]);

		assert.deepStrictEqual({
			firstBCancelled: requests[1].token.isCancellationRequested,
			sessions: requests.map(request => request.session),
			pendingState,
			applied,
		}, {
			firstBCancelled: true,
			sessions: ['/session-a', '/session-b', '/session-b'],
			pendingState: { loading: true, settled: false, candidates: [], targetFolders: [] },
			applied: [[serverA], []],
		});
	}));

	test('does not show loading when refreshing a settled empty context', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, renders, applied } = createMigrationRefreshEditor(async () => [], false);

		await editor.refreshCustomizationMigrationInfo();
		await editor.refreshCustomizationMigrationInfo();

		assert.deepStrictEqual({
			settled: editor.customizationMigrationResultsSettled,
			renders,
			applied,
		}, {
			settled: true,
			renders: [true, false, false],
			applied: [[], []],
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
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		});
		editor.customizationMigrationService.computeMigration = async (_session, type, token = CancellationToken.None) => {
			migrationTokens.push(token);
			switch (type) {
				case CustomizationMigrationType.UserData:
					return { type, files: [candidate.uri], candidates: [candidate] };
				case CustomizationMigrationType.McpServers:
					return {
						type,
						servers: [],
						candidates: [],
						exclusions: [],
						discoveryComplete: true,
						coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
					};
				default:
					return { type, files: [], candidates: [] };
			}
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
			sameTokens: migrationTokens.every(token => folderTokens.includes(token)),
			applied,
		}, {
			firstCancelled: true, migrationRequests: 6, folderRequests: 2, sameTokens: true, applied: [[candidate]],
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
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const customization: MigratableConfiguration = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.UserData, [customization]]]), new Map());

		editor.customizationMigrationInProgress = true;
		const category = editor.getCustomizationMigrationDashboardOverview().scopes
			.flatMap(scope => scope.categories)
			.find(category => category.id === CustomizationMigrationCategoryId.UserData);

		assert.strictEqual(category?.migrateDisabled, true);
		editor.editorPreviewDisposables.dispose();
	});

	test('clears only configured location settings unused after the requested migrations', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.ConfiguredLocations);
		const agentSettingId = 'chat.agentFilesLocations';
		const instructionsSettingId = 'chat.instructionsFilesLocations';
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
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
		editor.setCustomizationsToMigrate(new Map([[category.id, customizations]]), new Map());

		assert.deepStrictEqual({
			all: editor.getConfiguredLocationSettingsToClear(category, customizations),
			instructionsOnly: editor.getConfiguredLocationSettingsToClear(category, [customizations[1]]),
		}, {
			all: [agentSettingId, instructionsSettingId],
			instructionsOnly: [instructionsSettingId],
		});
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

	test('confirmation details enumerate planned source and destination changes', () => {
		const editor = createTestEditor();
		const file: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/agents/reviewer.agent.md'),
			storage: PromptsStorage.local,
			type: PromptsType.agent,
			source: PromptFileSource.GitHubWorkspace,
			name: 'reviewer',
		};
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'server',
			name: 'Server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'),
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const targetFolders: CustomizationMigrationTargetFolders = new Map([[
			PromptsType.agent,
			new Map([[PromptsStorage.local, {
				uri: URI.file('/workspace/.agents/agents'),
				label: '.agents/agents',
				source: PromptsStorage.local,
			}]]),
		]]);

		assert.deepStrictEqual({
			file: editor.getFileMigrationConfirmationDetail('Move the file.', [file], targetFolders),
			mcp: editor.getMcpMigrationConfirmationDetail('Move the server.', [server]),
		}, {
			file: 'Move the file.\n\nPlanned changes:\n• reviewer\n  From: /workspace/.github/agents/reviewer.agent.md\n  Destination: /workspace/.agents/agents/reviewer.agent.md',
			mcp: 'Move the server.\n\nPlanned changes:\n• Server\n  From: /workspace/.vscode/mcp.json\n  To: /workspace/.mcp.json',
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('confirms and executes selected MCP migration candidates', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
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
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [server]]]), new Map());
		editor.refreshCustomizationMigrationInfo = async () => {
			editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.McpServers, [server]]]), new Map());
		};

		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), [server]);

		assert.deepStrictEqual({
			migrated,
			notifications,
			dashboardShown,
			inProgress: editor.customizationMigrationInProgress,
			writesInProgress: editor.customizationMigrationWritesInProgress,
			remainingCandidates: editor.getMigrationCandidates(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers)),
			activity: editor.getMigrationActivityState(PromptsStorage.local).activity.map(({ id, ...entry }) => entry),
		}, {
			migrated: [[server]],
			notifications: ['info:Migrated 1 MCP server.'],
			dashboardShown: 1,
			inProgress: false,
			writesInProgress: false,
			remainingCandidates: [],
			activity: [{
				categoryLabel: 'MCP Servers',
				scopeLabel: 'vscode',
				storage: PromptsStorage.local,
				items: [{
					label: 'server',
					sourceLabel: '/workspace/.vscode/mcp.json',
					targetLabel: '/workspace/.mcp.json',
					operation: 'server',
					migrationKey: 'mcp:["mcp.config.ws0.server","server","file:///workspace/.vscode/mcp.json","file:///workspace/.mcp.json"]',
				}],
			}],
		});
		editor.editorPreviewDisposables.dispose();
	});

	for (const confirmed of [false, true]) {
		test(`${confirmed ? 'executes' : 'cancels'} MCP property removals only after a warning confirmation`, async () => {
			const editor = createTestEditor(undefined, createConfigurationServiceStub({
				[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
			}));
			const server: IMcpServerCustomizationMigrationCandidate = {
				type: CustomizationMigrationType.McpServers,
				storage: PromptsStorage.local,
				id: 'mcp.config.ws0.server',
				name: 'server',
				sourceUri: URI.file('/workspace/.vscode/mcp.json'),
				targetUri: URI.file('/workspace/.mcp.json'),
				projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
				removedProperties: { gallery: true, version: '1', dev: {}, sandboxEnabled: true },
			};
			const confirmations: IConfirmation[] = [];
			const calls: string[] = [];
			editor.dialogService = {
				confirm: async confirmation => {
					confirmations.push(confirmation);
					calls.push('confirm');
					return { confirmed };
				},
			};
			editor.customizationMigrationService = {
				migrateMcpServers: async () => {
					calls.push('migrate');
					return { migratedCount: 1, failures: [] };
				},
			};
			editor.notificationService = {
				error: () => calls.push('error'),
				warn: () => calls.push('warn'),
				info: () => calls.push('info'),
			};
			editor.showCustomizationMigrationDashboard = () => { };
			editor.refreshCustomizationMigrationInfo = async () => { };
			const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);
			const confirmation = category.getConfirmation([server], 'Copilot');
			await editor.migrateSelectedCustomizations(category, [server]);

			assert.deepStrictEqual({
				calls,
				confirmations,
				inProgress: editor.customizationMigrationInProgress,
				writesInProgress: editor.customizationMigrationWritesInProgress,
			}, {
				calls: confirmed ? ['confirm', 'migrate', 'info'] : ['confirm'],
				confirmations: [{
					type: 'warning',
					...confirmation,
					detail: editor.getMcpMigrationConfirmationDetail(confirmation.detail, [server]),
				}],
				inProgress: false,
				writesInProgress: false,
			});
			editor.editorPreviewDisposables.dispose();
		});
	}

	test('keeps migration hint attribution within its originating flow', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		let dashboardShown = 0;
		editor.refreshCustomizationMigrationInfo = async () => { };
		editor.showCustomizationMigrationDashboard = () => { dashboardShown++; };

		await editor.startCustomizationMigration(CustomizationMigrationCategoryId.PromptFiles, 'migration-flow-id');
		const attributedMigrationFlowId = editor.migrationFlowId;
		await editor.startCustomizationMigration(CustomizationMigrationCategoryId.McpServers);

		assert.deepStrictEqual({
			dashboardShown,
			attributedMigrationFlowId,
			resetMigrationFlowId: editor.migrationFlowId,
		}, {
			dashboardShown: 2,
			attributedMigrationFlowId: 'migration-flow-id',
			resetMigrationFlowId: undefined,
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('returns to the migration homepage after a successful file migration', async () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]), new Map());
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.local}`, {
			uri: URI.file('/workspace/.github/skills'),
			label: '.github',
			source: PromptsStorage.local,
		});
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		editor.runCustomizationMigration = async () => {
			editor.migrationFlowId = 'new-migration-flow-id';
			return {
				migratedCount: 1,
				failedCustomizationFileNames: [],
				failureReasons: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [{ uri: URI.file('/workspace/.github/skills/review/SKILL.md'), type: PromptsType.skill }],
				migratedSources: [{ uri: prompt.uri, storage: prompt.storage }],
			};
		};
		editor.refreshCustomizationMigrationInfo = async () => {
			editor.setCustomizationsToMigrate(new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]), new Map());
		};
		let dashboardShown = 0;
		editor.showCustomizationMigrationDashboard = () => dashboardShown++;
		editor.migrationFlowId = 'migration-flow-id';
		const migrationCompleted: unknown[][] = [];
		editor.customizationMigrationTelemetryService.migrationCompleted = (...args) => migrationCompleted.push(args);

		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles), [prompt]);

		assert.deepStrictEqual({
			dashboardShown,
			migrationCompleted,
			remainingCandidates: editor.getMigrationCandidates(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles)),
		}, {
			dashboardShown: 1,
			migrationCompleted: [[CustomizationMigrationType.PromptFiles, 1, 1, 0, [], 'migration-flow-id']],
			remainingCandidates: [],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('groups the dashboard by location without filtering global candidates', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
			[PromptsConfig.AGENTS_LOCATION_KEY]: { '/custom/agents': true },
		}));
		const profile: MigratableConfiguration = {
			uri: URI.file('/profile/review.prompt.md'), type: PromptsType.prompt, storage: PromptsStorage.user, source: PromptFileSource.UserData,
		};
		const workspace: MigratableConfiguration = {
			...profile, uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace,
		};
		const configuredProfile: MigratableConfiguration = {
			...profile, uri: URI.file('/profile/custom/reviewer.agent.md'), type: PromptsType.agent, source: PromptFileSource.ConfigPersonal,
		};
		const configuredWorkspace: MigratableConfiguration = {
			...workspace, uri: URI.file('/workspace/custom/reviewer.agent.md'), type: PromptsType.agent, source: PromptFileSource.ConfigWorkspace,
		};
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			storage: PromptsStorage.local,
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const userServer: IMcpServerCustomizationMigrationCandidate = {
			...server,
			id: 'userServer',
			storage: PromptsStorage.user,
			sourceUri: URI.file('/profile/mcp.json'),
			targetUri: URI.file('/home/.copilot/mcp-config.json'),
		};
		editor.mcpServerMigrationExclusions = [{
			...userServer,
			id: 'excluded',
			reason: McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration,
			details: ['Requires user interaction.'],
		}];
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.PromptFiles, [profile, workspace]],
			[CustomizationMigrationCategoryId.UserData, [{ ...profile, type: PromptsType.agent }]],
			[CustomizationMigrationCategoryId.McpServers, [server, userServer]],
			[CustomizationMigrationCategoryId.ConfiguredLocations, [configuredProfile, configuredWorkspace]],
		]);
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
			manualReview: editor.getCustomizationMigrationDashboardOverview().manualReviewItems?.map(item => ({
				label: item.label,
				reason: item.manualReviewReason,
				mcpServerId: item.mcpServerId,
				resource: item.resource?.path,
			})),
		}, {
			scopes: [
				{ label: 'Your profile', count: 4, skipped: false, categories: [['Convert Prompt to Skills', '1 prompt'], ['User Data', '1 agent'], ['Custom location settings', '1 customization'], ['MCP Servers', '1 server']] },
				{ label: 'vscode', count: 3, skipped: false, categories: [['Convert Prompt to Skills', '1 prompt'], ['Custom location settings', '1 customization'], ['MCP Servers', '1 server']] },
			],
			profile: [profile], workspace: [workspace], all: [profile, workspace], mcpProfile: [userServer],
			manualReview: [{
				label: 'server',
				reason: 'Requires user interaction.',
				mcpServerId: 'excluded',
				resource: '/profile/mcp.json',
			}],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('opens dashboard customizations in their embedded editor or detail page', async () => {
		const editor = createTestEditor();
		const opened: [URI, string, PromptsType, AICustomizationSource, boolean | undefined][] = [];
		const mcpDetails: IMcpServerDetailInput[] = [];
		editor.showEmbeddedEditor = async (uri, displayName, promptType, source, isWorkspaceFile) => {
			opened.push([uri, displayName, promptType, source, isWorkspaceFile]);
		};
		editor.showEmbeddedMcpDetail = async server => { mcpDetails.push(server); };
		const file = URI.file('/profile/review.prompt.md');
		const mcp = URI.file('/workspace/.vscode/mcp.json');

		await editor.openMigrationCustomization({
			id: 'file',
			label: 'review',
			scopeLabel: 'User',
			sourceLabel: '/profile/review.prompt.md',
			resource: file,
			promptType: PromptsType.prompt,
		}, PromptsStorage.user);
		await editor.openMigrationCustomization({
			id: 'mcp',
			label: 'server',
			scopeLabel: 'Workspace',
			sourceLabel: '/workspace/.vscode/mcp.json',
			resource: mcp,
			mcpServerId: 'server',
		}, PromptsStorage.local);

		assert.deepStrictEqual({
			file: opened.map(args => [
				(args[0] as URI).path,
				args[1],
				args[2],
				args[3],
				args[4],
			]),
			mcp: mcpDetails.map(detail => ({
				id: detail.id,
				name: detail.name,
				compatibilityId: detail.compatibilityId,
				source: detail.source?.uri.path,
			})),
		}, {
			file: [['/profile/review.prompt.md', 'review', PromptsType.prompt, PromptsStorage.user, false]],
			mcp: [{ id: 'server', name: 'server', compatibilityId: 'server', source: '/workspace/.vscode/mcp.json' }],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('keeps the unified sidebar entry reachable for workspace migrations', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		editor.migrationShortcutContainer = document.createElement('div');
		editor.migrationShortcutButton = document.createElement('button');
		editor.migrationShortcutCount = document.createElement('span');
		editor.layoutSidebar = () => { };
		editor.customizationsByMigrationCategory.set(CustomizationMigrationCategoryId.McpServers, [{
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			storage: PromptsStorage.local,
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		}]);
		const states: (string | null)[][] = [];
		editor.updateSidebarMigrationShortcut();
		states.push([editor.migrationShortcutContainer.style.display, editor.migrationShortcutCount.textContent]);
		editor.harnessService.activeHarness.set('local', undefined);
		editor.updateSidebarMigrationShortcut();
		states.push([editor.migrationShortcutContainer.style.display, editor.migrationShortcutCount.textContent]);
		assert.deepStrictEqual(states, [['', '1'], ['none', '1']]);
		editor.editorPreviewDisposables.dispose();
	});

	test('persists only successful MCP activity in its initiating workspace', async () => {
		const configuration = createConfigurationServiceStub({ [ChatConfiguration.ChatCustomizationsMigrationEnabled]: true });
		const editor = createTestEditor(undefined, configuration);
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers, id: 'server', name: 'server',
			storage: PromptsStorage.local,
			sourceUri: URI.file('/workspace/.vscode/mcp.json'), targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		};
		const failed = { ...server, id: 'failed', name: 'failed' };
		editor.dialogService = { confirm: async () => ({ confirmed: true }) };
		editor.refreshCustomizationMigrationInfo = async () => { };
		editor.migrationFlowId = 'migration-flow-id';
		editor.customizationMigrationService = {
			migrateMcpServers: async () => {
				editor.migrationFlowId = 'new-migration-flow-id';
				editor.workspaceService.activeProjectRoot.set(URI.file('/other'), undefined);
				return {
					migratedCount: 1,
					failures: [{ ...failed, reason: McpServerCustomizationMigrationFailureReason.TargetConflict }],
				};
			},
		};
		const migrationCompleted: unknown[][] = [];
		editor.customizationMigrationTelemetryService.migrationCompleted = (...args) => migrationCompleted.push(args);
		await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), [server, failed]);
		const reopened = createTestEditor(undefined, configuration);
		reopened.storageService = editor.storageService;
		assert.deepStrictEqual({
			currentWorkspace: editor.getMigrationActivityState(PromptsStorage.local).activity,
			profile: reopened.getMigrationActivityState(PromptsStorage.user).activity,
			reopenedWorkspace: reopened.getMigrationActivityState(PromptsStorage.local).activity.map(entry => entry.items.map(item => item.label)),
			migrationCompleted,
		}, {
			currentWorkspace: [],
			profile: [],
			reopenedWorkspace: [['server']],
			migrationCompleted: [[CustomizationMigrationType.McpServers, 2, 1, 1, [McpServerCustomizationMigrationFailureReason.TargetConflict], 'migration-flow-id']],
		});

		test('records user MCP migration activity in the profile', async () => {
			const editor = createTestEditor(undefined, createConfigurationServiceStub({
				[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
			}));
			const server: IMcpServerCustomizationMigrationCandidate = {
				type: CustomizationMigrationType.McpServers,
				storage: PromptsStorage.user,
				id: 'user',
				name: 'server',
				sourceUri: URI.file('/profile/mcp.json'),
				targetUri: URI.file('/home/.copilot/mcp-config.json'),
				projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
			};
			editor.dialogService = { confirm: async () => ({ confirmed: true }) };
			editor.refreshCustomizationMigrationInfo = async () => { };
			editor.customizationMigrationService = { migrateMcpServers: async () => ({ migratedCount: 1, failures: [] }) };
			await editor.migrateSelectedCustomizations(getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers), [server]);
			assert.deepStrictEqual({
				user: editor.getMigrationActivityState(PromptsStorage.user).activity.map(entry => ({
					storage: entry.storage,
					scopeLabel: entry.scopeLabel,
					items: entry.items.map(item => [item.sourceLabel, item.targetLabel]),
				})),
				workspace: editor.getMigrationActivityState(PromptsStorage.local).activity,
			}, {
				user: [{ storage: PromptsStorage.user, scopeLabel: 'Your profile', items: [['/profile/mcp.json', '/home/.copilot/mcp-config.json']] }],
				workspace: [],
			});
			editor.editorPreviewDisposables.dispose();
		});
		reopened.editorPreviewDisposables.dispose();
		editor.editorPreviewDisposables.dispose();
	});

	test('removes reverted migration activity while preserving copied activity', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
		}));
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles);
		const context = editor.getMigrationActivityContext(PromptsStorage.local);
		const revertedPrompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'review.prompt.md',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const legacyPrompt: MigratableConfiguration = {
			...revertedPrompt,
			uri: URI.file('/workspace/.github/prompts/legacy.prompt.md'),
			name: 'legacy.prompt.md',
		};
		editor.recordMigrationActivity(category, context, [{
			label: 'review.prompt.md',
			sourceLabel: '/workspace/.github/prompts/review.prompt.md',
			targetLabel: '/workspace/.github/skills/review/SKILL.md',
			operation: 'converted',
			migrationKey: `file:${PromptsStorage.local}:${revertedPrompt.uri.toString()}`,
		}, {
			label: 'legacy.prompt.md',
			sourceLabel: '/workspace/.github/prompts/legacy.prompt.md',
			targetLabel: '/workspace/.github/skills/legacy/SKILL.md',
			operation: 'converted',
		}, {
			label: 'review.prompt.md',
			sourceLabel: '/workspace/.github/prompts/review.prompt.md',
			targetLabel: '/workspace/.agents/prompts/review.prompt.md',
			operation: 'copied',
			migrationKey: `file:${PromptsStorage.local}:${revertedPrompt.uri.toString()}`,
		}]);

		editor.setCustomizationsToMigrate(new Map([[category.id, [revertedPrompt, legacyPrompt]]]), new Map());

		const state = editor.getMigrationActivityState(PromptsStorage.local);
		assert.deepStrictEqual({
			activity: state.activity.map(entry => entry.items),
			skipped: state.skipped,
			started: state.started,
		}, {
			activity: [[{
				label: 'review.prompt.md',
				sourceLabel: '/workspace/.github/prompts/review.prompt.md',
				targetLabel: '/workspace/.agents/prompts/review.prompt.md',
				operation: 'copied',
				migrationKey: `file:${PromptsStorage.local}:${revertedPrompt.uri.toString()}`,
			}]],
			skipped: false,
			started: true,
		});
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
					categoryLabel: 'Convert Prompt to Skills',
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
					categoryLabel: 'Convert Prompt to Skills',
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

	test('migrates workspace customizations into their own workspace folder', async () => {
		const editor = createTestEditor();
		const workspaceFolders: ICustomizationSourceFolder[] = [
			{ uri: URI.file('/workspace-a/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-a' },
			{ uri: URI.file('/workspace-b/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-b' },
		];
		editor.customizationMigrationTargetFoldersByType = new Map([[PromptsType.skill, workspaceFolders]]);
		const targetFolders = new Map<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceFolders[0]]])],
		]);
		const promptIn = (root: string): MigratableConfiguration => ({
			uri: URI.file(`${root}/.github/prompts/review.prompt.md`),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
			workspaceGroupId: root.slice(1),
		});
		const customFolder: ICustomizationSourceFolder = { uri: URI.file('/custom/skills'), label: '/custom/skills', source: PromptsStorage.local };

		try {
			assert.deepStrictEqual({
				firstWorkspaceFolder: editor.getEffectiveCustomizationMigrationTargetFolder(promptIn('/workspace-a'), targetFolders)?.uri.path,
				otherWorkspaceFolder: editor.getEffectiveCustomizationMigrationTargetFolder(promptIn('/workspace-b'), targetFolders)?.uri.path,
				customFolder: editor.getEffectiveCustomizationMigrationTargetFolder(
					promptIn('/workspace-b'),
					new Map([[PromptsType.skill, new Map([[PromptsStorage.local, customFolder]])]]),
				)?.uri.path,
			}, {
				firstWorkspaceFolder: '/workspace-a/.github/skills',
				otherWorkspaceFolder: '/workspace-b/.github/skills',
				customFolder: '/custom/skills',
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
