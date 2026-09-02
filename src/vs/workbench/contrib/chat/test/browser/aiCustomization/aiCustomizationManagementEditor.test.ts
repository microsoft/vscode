/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { AICustomizationManagementEditor, isCurrentPluginContributionNavigation } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { AICustomizationManagementSection, AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IHeaderAttribute } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';

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
		currentEditingSource: AICustomizationSource | undefined;
		currentEditingReadOnly: boolean;
		editorDisplayMode: 'preview' | 'raw';
		editorPreviewFrontMatterContainer: HTMLElement | undefined;
		editorPreviewDisposables: DisposableStore;
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail';
		dimension: undefined;
		hoverService: IHoverService;
		configurationService: IConfigurationService;
		editorDisposables: DisposableStore;
		contributedSectionContainers: Map<AICustomizationManagementSection, HTMLElement>;
		selectedSection: AICustomizationManagementSection | undefined;
		getEditorModeButtonLabel(): string;
		getEditorModeButtonTooltip(): string;
		renderPreviewAttribute(attribute: IHeaderAttribute, promptType: PromptsType, target: Target): void;
		showEmbeddedEditor(uri: URI, displayName: string, promptType: PromptsType, source: AICustomizationSource, isWorkspaceFile?: boolean, isReadOnly?: boolean): Promise<void>;
		onStructuredPreviewSettingChanged(): void;
		setVisible(visible: boolean): void;
	};

	function createConfigurationServiceStub(values: Record<string, unknown> = {}): IConfigurationService {
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
		editor.editorDisplayMode = 'preview';
		editor.editorPreviewFrontMatterContainer = document.createElement('div');
		editor.editorPreviewDisposables = new DisposableStore();
		editor.editorDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
		editor.hoverService = hoverService ?? {
			setupManagedHover: () => ({
				dispose() { },
				show() { },
				hide() { },
				update() { },
			}),
		} as unknown as IHoverService;
		editor.configurationService = configurationService ?? createConfigurationServiceStub();
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

		assert.strictEqual(editor.getEditorModeButtonLabel(), 'Edit');
		configurationService.setValue(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled, false);
		editor.onStructuredPreviewSettingChanged();

		assert.strictEqual(editor.editorDisplayMode, 'raw');
		assert.strictEqual(editor.getEditorModeButtonLabel(), '');

		editor.editorPreviewDisposables.dispose();
	});
});
