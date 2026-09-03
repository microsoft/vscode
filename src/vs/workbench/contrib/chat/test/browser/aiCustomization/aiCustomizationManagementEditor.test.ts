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
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AICustomizationManagementEditor, isCurrentPluginContributionNavigation } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import type { ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import type { ICustomizationMigrationCategorySummary } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import type { ICustomizationMigrationDashboardDestination } from '../../../browser/aiCustomization/customizationMigrationDashboard.js';

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
		customizationsByMigrationCategory: Map<CustomizationMigrationCategoryId, readonly MigratableConfiguration[]>;
		customizationMigrationTargetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>;
		customizationMigrationInProgress: boolean;
		customizationMigrationWritesInProgress: boolean;
		selectedCustomizationMigrationTargets: Map<string, ICustomizationSourceFolder>;
		migrationDestinationButtons: ReadonlyMap<string, HTMLElement>;
		activeMigrationCategoryId: CustomizationMigrationCategoryId | undefined;
		editorDisplayMode: 'preview' | 'raw';
		editorPreviewFrontMatterContainer: HTMLElement | undefined;
		editorPreviewDisposables: DisposableStore;
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail';
		dimension: undefined;
		hoverService: IHoverService;
		configurationService: IConfigurationService;
		editorDisposables: DisposableStore;
		harnessService: { activeSessionResource: ISettableObservable<URI> };
		migrationListContainer: HTMLElement | undefined;
		migrationMigrateButton: { enabled: boolean; label: string } | undefined;
		migrationSelectedCountElement: HTMLElement | undefined;
		migrationFooter: HTMLElement | undefined;
		migrationTitleElement: HTMLElement | undefined;
		migrationDestinationsContainer: HTMLElement | undefined;
		selectedCustomizationMigrationItems: ResourceMap<Set<PromptsStorage>>;
		migrationPageDisposables: DisposableStore;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
		quickInputService: {
			pick(items: readonly { label: string; folder?: ICustomizationSourceFolder; chooseAnother?: boolean }[]): Promise<{ label?: string; folder?: ICustomizationSourceFolder; chooseAnother?: boolean } | undefined>;
		};
		fileDialogService: { showOpenDialog(): Promise<URI[]> };
		notificationService: { error(message: string): void };
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
		resolveCustomizationMigrationTargetFolders(
			customizations: readonly MigratableConfiguration[],
			availableSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>,
			sessionResource: URI,
		): Promise<ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>> | undefined>;
		getCustomizationMigrationDashboardDestinations(customizations: readonly MigratableConfiguration[]): readonly ICustomizationMigrationDashboardDestination[];
		migrateAllCustomizations(): Promise<void>;
		migrateCustomizationsWithConfirmation(
			customizations: readonly MigratableConfiguration[],
			getConfirmation: (targetFolders: Map<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>) => {
				readonly message: string;
				readonly detail: string;
				readonly primaryButton: string;
				readonly deleteOriginalsLabel: string;
			},
			resultMessages: {
				readonly noFilesMigratedMessage: string;
				getMigratedMessage(migratedCount: number): string;
				getMigratedWithReviewMessage?(migratedCount: number, unsupportedHeaderKeys: string): string;
				getFailedMessage(failedFileNames: readonly string[], hiddenFileCount: number): string;
			},
		): Promise<void>;
		setCustomizationsToMigrate(candidates: Map<CustomizationMigrationCategoryId, readonly MigratableConfiguration[]>, targetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>): void;
		isCustomizationSelectedForMigration(customization: MigratableConfiguration): boolean;
		setCustomizationSelectedForMigration(customization: MigratableConfiguration, selected: boolean): void;
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
		editor.selectedCustomizationMigrationTargets = new Map();
		editor.migrationDestinationButtons = new Map();
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
		editor.configurationService = configurationService ?? createConfigurationServiceStub();
		editor.migrationListContainer = undefined;
		editor.migrationMigrateButton = undefined;
		editor.migrationSelectedCountElement = undefined;
		editor.migrationFooter = undefined;
		editor.migrationTitleElement = undefined;
		editor.migrationDestinationsContainer = undefined;
		editor.selectedCustomizationMigrationItems = new ResourceMap();
		editor.migrationPageDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.labelService = {
			getUriLabel: uri => uri.path,
		};
		editor.quickInputService = {
			pick: async items => items[0],
		};
		editor.notificationService = {
			error: () => { },
		};
		editor.showEmbeddedEditor = async () => { };
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
		]);
		editor.welcomePage = {
			setMigrationCategories: categories => welcomePageCalls.push([...categories as readonly ICustomizationMigrationCategorySummary[]]),
		};

		editor.refreshCustomizationMigrationUi();
		configurationService.setValue(ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled, true);
		editor.refreshCustomizationMigrationUi();
		configurationService.setValue(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled, true);
		editor.refreshCustomizationMigrationUi();

		assert.deepStrictEqual(welcomePageCalls.map(categories => categories.map(category => category.id)), [
			[],
			[CustomizationMigrationCategoryId.UserData],
			[CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData],
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

	test('defaults migration destinations and preserves a custom selection', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		const prompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const defaultFolder: ICustomizationSourceFolder = {
			uri: URI.file('/workspace/.github/skills'),
			label: '.github/skills',
			source: AICustomizationSources.local,
		};
		const customFolder: ICustomizationSourceFolder = {
			uri: URI.file('/workspace/custom/skills'),
			label: 'custom/skills',
			source: AICustomizationSources.local,
		};
		const candidates = new Map([[CustomizationMigrationCategoryId.PromptFiles, [prompt]]]);
		const targetFolders = new Map([[PromptsType.skill, [defaultFolder]]]);

		editor.setCustomizationsToMigrate(candidates, targetFolders);
		const defaultSelection = editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path;
		editor.selectedCustomizationMigrationTargets.set(`${PromptsType.skill}:${PromptsStorage.local}`, customFolder);
		editor.setCustomizationsToMigrate(candidates, targetFolders);

		assert.deepStrictEqual({
			defaultSelection,
			preservedSelection: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path,
		}, {
			defaultSelection: '/workspace/.github/skills',
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

	test('allows choosing an arbitrary migration destination', async () => {
		const editor = createTestEditor();
		let pickerLabels: readonly string[] = [];
		editor.quickInputService = {
			pick: async items => {
				pickerLabels = items.map(item => item.label);
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
		}, {
			selectedPath: '/workspace/custom/skills',
			pickerLabels: ['Choose another folder...'],
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('individual migration pages expose shared destination controls and restore focus', async () => {
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
			const initialButton = editor.migrationDestinationsContainer.querySelector<HTMLElement>('[data-migration-destination-key]');
			await editor.chooseCustomizationMigrationDestination({
				targetType: PromptsType.skill,
				storage: PromptsStorage.local,
				contextLabel: 'Workspace skills',
				label: '.github/skills',
				ariaLabel: 'Change destination for workspace skills',
			});
			const updatedButton = editor.migrationDestinationsContainer.querySelector<HTMLElement>('[data-migration-destination-key]');

			assert.deepStrictEqual({
				heading: editor.migrationDestinationsContainer.querySelector('.customization-migration-dashboard-plan-heading')?.textContent,
				initialLabel: initialButton?.textContent,
				updatedLabel: updatedButton?.textContent,
				updatedFocused: document.activeElement === updatedButton,
				selectedPath: editor.selectedCustomizationMigrationTargets.get(`${PromptsType.skill}:${PromptsStorage.local}`)?.uri.path,
			}, {
				heading: 'Migration destinations',
				initialLabel: '.github/skills',
				updatedLabel: '/workspace/custom/skills',
				updatedFocused: true,
				selectedPath: '/workspace/custom/skills',
			});
		} finally {
			host.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('migrate all includes every dashboard category', async () => {
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
		let migration: {
			readonly paths: readonly string[];
			readonly confirmation: {
				readonly message: string;
				readonly detail: string;
				readonly primaryButton: string;
				readonly deleteOriginalsLabel: string;
			};
			readonly successMessage: string;
		} | undefined;
		editor.migrateCustomizationsWithConfirmation = async (customizations, getConfirmation, resultMessages) => {
			migration = {
				paths: customizations.map(customization => customization.uri.path),
				confirmation: getConfirmation(new Map()),
				successMessage: resultMessages.getMigratedMessage(customizations.length),
			};
		};

		await editor.migrateAllCustomizations();

		assert.deepStrictEqual(migration, {
			paths: [
				'/workspace/.github/prompts/review.prompt.md',
				'/user-data/prompts/reviewer.agent.md',
			],
			confirmation: {
				message: 'Migrate all customizations?',
				detail: 'This migrates 2 customizations using the destinations shown on the dashboard.',
				primaryButton: 'Migrate All',
				deleteOriginalsLabel: 'Delete original files after migration',
			},
			successMessage: 'Migrated 2 customizations.',
		});
		editor.editorPreviewDisposables.dispose();
	});

	test('root migration dashboard reuses the migration footer', () => {
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
				footerDisplay: '',
				countLabel: '1 customization',
				button: { enabled: true, label: 'Migrate All' },
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
			candidatePaths: [...editor.customizationsByMigrationCategory.values()].flat().map(candidate => candidate.uri.path),
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
