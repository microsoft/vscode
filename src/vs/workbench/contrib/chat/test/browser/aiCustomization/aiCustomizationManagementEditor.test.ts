/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AICustomizationManagementEditor } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IPromptPath, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import type { ICustomizationMigrationCategorySummary } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';

suite('aiCustomizationManagementEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	type TestableEditor = {
		currentEditingPromptType: PromptsType | undefined;
		currentEditingSource: string | undefined;
		currentEditingReadOnly: boolean;
		customizationsByMigrationCategory: Map<CustomizationMigrationCategoryId, readonly IPromptPath[]>;
		activeMigrationCategoryId: CustomizationMigrationCategoryId | undefined;
		editorDisplayMode: 'preview' | 'raw';
		editorPreviewFrontMatterContainer: HTMLElement | undefined;
		editorPreviewDisposables: DisposableStore;
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail';
		dimension: undefined;
		hoverService: IHoverService;
		configurationService: IConfigurationService;
		migrationListContainer: HTMLElement | undefined;
		migrationMigrateButton: { enabled: boolean; label: string } | undefined;
		migrationTitleElement: HTMLElement | undefined;
		migrationDescriptionElement: HTMLElement | undefined;
		migrationBannerContainer: HTMLElement | undefined;
		migrationLinkElement: HTMLAnchorElement | undefined;
		migrationSearchQuery: string;
		selectedCustomizationMigrationItems: ResourceMap<Set<PromptsStorage>>;
		collapsedCustomizationMigrationGroups: Set<string>;
		migrationPageDisposables: DisposableStore;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
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
		renderCustomizationMigrationPage(): void;
		setCustomizationsToMigrate(candidates: Map<CustomizationMigrationCategoryId, readonly IPromptPath[]>): void;
		isCustomizationSelectedForMigration(customization: IPromptPath): boolean;
		setCustomizationSelectedForMigration(customization: IPromptPath, selected: boolean): void;
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
		editor.activeMigrationCategoryId = undefined;
		editor.editorDisplayMode = 'preview';
		editor.editorPreviewFrontMatterContainer = document.createElement('div');
		editor.editorPreviewDisposables = new DisposableStore();
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
		editor.migrationTitleElement = undefined;
		editor.migrationDescriptionElement = undefined;
		editor.migrationBannerContainer = undefined;
		editor.migrationLinkElement = undefined;
		editor.migrationSearchQuery = '';
		editor.selectedCustomizationMigrationItems = new ResourceMap();
		editor.collapsedCustomizationMigrationGroups = new Set();
		editor.migrationPageDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.labelService = {
			getUriLabel: uri => uri.path,
		};
		editor.showEmbeddedEditor = async () => { };
		editor.getActiveHarnessLabel = () => 'Copilot [Agent Host]';
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
			} as IPromptPath]],
			[CustomizationMigrationCategoryId.UserData, [{
				uri: URI.file('/user-data/prompts/legacy.agent.md'),
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			} as IPromptPath]],
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
		const workspacePrompt: IPromptPath = {
			uri: sharedUri,
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.ConfigWorkspace,
		};
		const userPrompt: IPromptPath = {
			uri: sharedUri,
			storage: PromptsStorage.user,
			type: PromptsType.prompt,
			source: PromptFileSource.ConfigPersonal,
		};
		const candidates = new Map<CustomizationMigrationCategoryId, readonly IPromptPath[]>([
			[CustomizationMigrationCategoryId.PromptFiles, [workspacePrompt, userPrompt]],
		]);

		editor.setCustomizationsToMigrate(candidates);
		editor.setCustomizationSelectedForMigration(workspacePrompt, false);
		editor.setCustomizationsToMigrate(candidates);

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

	test('user data migration banner states the Settings Sync trade-off and replaces the description', () => {
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
			} as IPromptPath,
			{
				uri: URI.file('/user-data/prompts/style.instructions.md'),
				name: 'style.instructions.md',
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			} as IPromptPath,
		];
		const promptFiles = [
			{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'review.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as IPromptPath,
		];
		editor.customizationsByMigrationCategory = new Map([
			[CustomizationMigrationCategoryId.UserData, userDataCustomizations],
			[CustomizationMigrationCategoryId.PromptFiles, promptFiles],
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
			title: editor.migrationBannerContainer!.querySelector('.customization-migration-banner-title')?.textContent ?? '',
			consequenceMentionsSync: (editor.migrationBannerContainer!.querySelector('.customization-migration-banner-consequence')?.textContent ?? '').includes('Settings Sync'),
			bannerHidden: editor.migrationBannerContainer!.style.display === 'none',
			descriptionHidden: editor.migrationDescriptionElement!.style.display === 'none',
		});

		try {
			editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.UserData;
			editor.renderCustomizationMigrationPage();
			const userData = readBanner();

			// The prompt-file migration keeps its plain description, with no banner.
			editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
			editor.renderCustomizationMigrationPage();
			const prompts = readBanner();

			assert.deepStrictEqual({ userData, prompts }, {
				userData: {
					title: '2 customizations are not available to Copilot [Agent Host]',
					consequenceMentionsSync: true,
					bannerHidden: false,
					descriptionHidden: true,
				},
				prompts: {
					title: '',
					consequenceMentionsSync: false,
					bannerHidden: true,
					descriptionHidden: false,
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
		const promptFile: IPromptPath = {
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

	test('customization migration groups can be collapsed independently', () => {
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
			} as IPromptPath,
			{
				uri: URI.file('/workspace/.github/prompts/workspace-b.prompt.md'),
				name: 'workspace-b.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			} as IPromptPath,
			{
				uri: URI.file('/user-data/prompts/user-a.prompt.md'),
				name: 'user-a.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			} as IPromptPath,
			{
				uri: URI.file('/user-data/prompts/user-b.prompt.md'),
				name: 'user-b.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			} as IPromptPath,
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

			const groupToggles = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-toggle')] as HTMLButtonElement[];
			assert.deepStrictEqual(groupToggles.map(button => button.getAttribute('aria-expanded')), ['true', 'true']);

			groupToggles[0].click();

			const groupContainers = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-items')] as HTMLElement[];
			assert.deepStrictEqual(groupContainers.map(container => container.style.display), ['none', '']);
			assert.deepStrictEqual(
				[...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-toggle')].map(button => button.getAttribute('aria-expanded')),
				['false', 'true'],
			);

			editor.renderCustomizationMigrationPage();

			const rerenderedContainers = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-items')] as HTMLElement[];
			assert.deepStrictEqual(rerenderedContainers.map(container => container.style.display), ['none', '']);
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});
});
