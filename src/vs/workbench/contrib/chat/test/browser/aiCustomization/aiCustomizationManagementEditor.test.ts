/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
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
import { PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';

suite('aiCustomizationManagementEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	type TestableEditor = {
		currentEditingPromptType: PromptsType | undefined;
		currentEditingSource: string | undefined;
		currentEditingReadOnly: boolean;
		promptFilesToMigrate: readonly IPromptPath[];
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
		migrationDescriptionElement: HTMLElement | undefined;
		migrationSearchQuery: string;
		selectedPromptMigrationUris: ResourceSet;
		collapsedPromptMigrationGroups: Set<string>;
		migrationPageDisposables: DisposableStore;
		labelService: { getUriLabel(uri: URI, options?: { relative?: boolean }): string };
		showEmbeddedEditor(...args: unknown[]): Promise<void>;
		getActiveHarnessLabel(): string;
		welcomePage: { setPromptMigrationInfo(info: unknown): void } | undefined;
		selectedSection: AICustomizationManagementSection | undefined;
		contributedSectionContainers: Map<AICustomizationManagementSection, HTMLElement>;
		automationsContentContainer: HTMLElement | undefined;
		automationsListWidget: { setVisible(visible: boolean): void } | undefined;
		getEditorModeButtonLabel(): string;
		getEditorModeButtonTooltip(): string;
		renderPreviewAttribute(attribute: IHeaderAttribute, promptType: PromptsType, target: Target): void;
		onStructuredPreviewSettingChanged(): void;
		refreshPromptMigrationUi(): void;
		renderPromptMigrationPage(): void;
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
		editor.promptFilesToMigrate = [];
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
		editor.migrationDescriptionElement = undefined;
		editor.migrationSearchQuery = '';
		editor.selectedPromptMigrationUris = new ResourceSet();
		editor.collapsedPromptMigrationGroups = new Set();
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
		editor.automationsContentContainer = undefined;
		editor.automationsListWidget = undefined;
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

	test('hides prompt migration UI when the experimental setting is disabled', () => {
		const welcomePageCalls: unknown[] = [];
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: false,
		}));
		editor.promptFilesToMigrate = [{
			uri: URI.file('/workspace/.github/prompts/prompt.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
		} as IPromptPath];
		editor.welcomePage = {
			setPromptMigrationInfo: info => welcomePageCalls.push(info),
		};

		editor.refreshPromptMigrationUi();

		assert.deepStrictEqual(welcomePageCalls, [undefined]);
		editor.editorPreviewDisposables.dispose();
	});

	test('prompt migration groups can be collapsed independently', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}));
		editor.promptFilesToMigrate = [
			{
				uri: URI.file('/workspace/.github/prompts/workspace-a.prompt.md'),
				name: 'workspace-a.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
			} as IPromptPath,
			{
				uri: URI.file('/workspace/.github/prompts/workspace-b.prompt.md'),
				name: 'workspace-b.prompt.md',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
			} as IPromptPath,
			{
				uri: URI.file('/user/prompts/user-a.prompt.md'),
				name: 'user-a.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
			} as IPromptPath,
			{
				uri: URI.file('/user/prompts/user-b.prompt.md'),
				name: 'user-b.prompt.md',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
			} as IPromptPath,
		];
		editor.selectedPromptMigrationUris = new ResourceSet(editor.promptFilesToMigrate.map(file => file.uri));
		editor.migrationListContainer = document.createElement('div');
		editor.migrationDescriptionElement = document.createElement('p');
		editor.migrationMigrateButton = { enabled: false, label: '' };
		document.body.appendChild(editor.migrationListContainer);

		try {
			editor.renderPromptMigrationPage();

			const groupToggles = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-toggle')] as HTMLButtonElement[];
			assert.deepStrictEqual(groupToggles.map(button => button.getAttribute('aria-expanded')), ['true', 'true']);

			groupToggles[0].click();

			const groupContainers = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-items')] as HTMLElement[];
			assert.deepStrictEqual(groupContainers.map(container => container.style.display), ['none', '']);
			assert.deepStrictEqual(
				[...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-toggle')].map(button => button.getAttribute('aria-expanded')),
				['false', 'true'],
			);

			editor.renderPromptMigrationPage();

			const rerenderedContainers = [...editor.migrationListContainer.querySelectorAll('.prompt-migration-group-items')] as HTMLElement[];
			assert.deepStrictEqual(rerenderedContainers.map(container => container.style.display), ['none', '']);
		} finally {
			editor.migrationListContainer.remove();
			editor.migrationPageDisposables.dispose();
			editor.editorPreviewDisposables.dispose();
		}
	});

	test('propagates editor and section visibility to the Automations widget', () => {
		const visibility: boolean[] = [];
		const editor = createTestEditor();
		editor.selectedSection = AICustomizationManagementSection.Automations;
		editor.automationsContentContainer = document.createElement('div');
		editor.automationsListWidget = {
			setVisible: visible => visibility.push(visible),
		};

		editor.updateContentVisibility();
		editor.setVisible(true);
		editor.selectedSection = AICustomizationManagementSection.Agents;
		editor.updateContentVisibility();

		assert.deepStrictEqual({
			visibility,
			display: editor.automationsContentContainer.style.display,
		}, {
			visibility: [false, true, false],
			display: 'none',
		});
		editor.editorPreviewDisposables.dispose();
	});
});
