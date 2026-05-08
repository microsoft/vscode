/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AICustomizationManagementEditor, buildCustomizationPreviewMarkdown } from '../../../browser/aiCustomization/aiCustomizationManagementEditor.js';
import { BUILTIN_STORAGE } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('aiCustomizationManagementEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	type TestableEditor = {
		currentEditingPromptType: PromptsType | undefined;
		currentEditingStorage: string | undefined;
		currentEditingReadOnly: boolean;
		editorDisplayMode: 'preview' | 'raw';
		editorPreviewDisposables: { add<T>(value: T): T; clear(): void; dispose(): void };
		editorPreviewRenderScheduler: { cancel(): void; schedule(): void };
		viewMode: 'list' | 'editor' | 'mcpDetail' | 'pluginDetail';
		dimension: undefined;
		hoverService: IHoverService;
		configurationService: IConfigurationService;
		getEditorModeButtonLabel(): string;
		getEditorModeButtonTooltip(): string;
		onMarkdownPreviewSettingChanged(): void;
	};

	function createConfigurationServiceStub(values: Record<string, unknown> = {}): IConfigurationService {
		const merged: Record<string, unknown> = { ...values };
		return {
			getValue: (key: string) => merged[key],
			setValue: (key: string, value: unknown) => { merged[key] = value; },
		} as unknown as IConfigurationService & { setValue(key: string, value: unknown): void };
	}

	function createTestEditor(hoverService?: IHoverService, configurationService?: IConfigurationService): TestableEditor {
		const editor = Object.create(AICustomizationManagementEditor.prototype) as unknown as TestableEditor;
		editor.currentEditingPromptType = undefined;
		editor.currentEditingStorage = undefined;
		editor.currentEditingReadOnly = false;
		editor.editorDisplayMode = 'preview';
		editor.editorPreviewDisposables = {
			add<T>(value: T): T {
				return value;
			},
			clear(): void { },
			dispose(): void { },
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
		editor.editorPreviewRenderScheduler = {
			cancel(): void { },
			schedule(): void { },
		};
		editor.viewMode = 'list';
		editor.dimension = undefined;
		return editor;
	}

	test('uses edit copy for built-in skills that support raw overrides', () => {
		const editor = createTestEditor();
		editor.currentEditingPromptType = PromptsType.skill;
		editor.currentEditingStorage = BUILTIN_STORAGE;
		editor.currentEditingReadOnly = true;
		editor.editorDisplayMode = 'preview';

		assert.strictEqual(editor.getEditorModeButtonLabel(), 'Edit');
		assert.strictEqual(editor.getEditorModeButtonTooltip(), 'Edit the raw markdown file');

		editor.editorPreviewDisposables.dispose();
	});

	test('uses view-raw copy for true read-only extension content', () => {
		const editor = createTestEditor();
		editor.currentEditingPromptType = PromptsType.agent;
		editor.currentEditingStorage = 'extension';
		editor.currentEditingReadOnly = true;
		editor.editorDisplayMode = 'preview';

		assert.strictEqual(editor.getEditorModeButtonLabel(), 'View Raw');
		assert.strictEqual(editor.getEditorModeButtonTooltip(), 'Show the raw markdown file');

		editor.editorPreviewDisposables.dispose();
	});

	test('hides preview button when markdown preview setting is disabled', () => {
		const editor = createTestEditor(undefined, createConfigurationServiceStub({
			[ChatConfiguration.ChatCustomizationsMarkdownPreviewEnabled]: false,
		}));
		editor.currentEditingPromptType = PromptsType.agent;
		editor.currentEditingStorage = BUILTIN_STORAGE;
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

		configurationService.setValue(ChatConfiguration.ChatCustomizationsMarkdownPreviewEnabled, false);
		editor.onMarkdownPreviewSettingChanged();

		assert.strictEqual(editor.editorDisplayMode, 'raw');
		assert.strictEqual(editor.getEditorModeButtonLabel(), '');

		editor.editorPreviewDisposables.dispose();
	});

	suite('buildCustomizationPreviewMarkdown', () => {
		test('returns content unchanged when there is no front matter', () => {
			const content = '# Hello\n\nNo front matter here.\n';
			assert.strictEqual(buildCustomizationPreviewMarkdown(content), content);
		});

		test('wraps front matter in a fenced yaml block', () => {
			const content = '---\ndescription: An agent\nmode: agent\n---\n\n# Body\n\nHello.\n';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.strictEqual(result, '```yaml\ndescription: An agent\nmode: agent\n```\n\n# Body\n\nHello.\n');
		});

		test('handles CRLF line endings', () => {
			const content = '---\r\ndescription: An agent\r\n---\r\n\r\n# Body\r\n';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.strictEqual(result, '```yaml\ndescription: An agent\n```\n\n# Body\r\n');
		});

		test('uses a longer fence when YAML contains triple backticks', () => {
			const content = '---\ndescription: "Use ```ts for code"\n---\n\n# Body\n';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.ok(result.startsWith('````yaml\n'), `Expected 4-backtick fence, got: ${result.slice(0, 20)}`);
			assert.ok(result.includes('\n````\n'), 'Expected matching 4-backtick closing fence');
			assert.ok(result.includes('description: "Use ```ts for code"'), 'YAML body should be preserved verbatim');
		});

		test('uses a fence longer than the longest backtick run in YAML', () => {
			const content = '---\nexample: "fence: ```` four ticks"\n---\n\nbody\n';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.ok(result.startsWith('`````yaml\n'), `Expected 5-backtick fence, got: ${result.slice(0, 20)}`);
		});

		test('returns content unchanged when there is no closing front-matter delimiter', () => {
			const content = '---\ndescription: Open frontmatter\n# typing in progress';
			assert.strictEqual(buildCustomizationPreviewMarkdown(content), content);
		});

		test('renders empty front matter as an empty fenced yaml block', () => {
			const content = '---\n---';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.strictEqual(result, '```yaml\n\n```\n\n');
		});

		test('renders comment-only front matter inside the fenced yaml block', () => {
			const content = '---\n# note\n---\nBody text here.';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.strictEqual(result, '```yaml\n# note\n```\n\nBody text here.');
		});

		test('handles front matter with no body', () => {
			const content = '---\ndescription: Just metadata\n---\n';
			const result = buildCustomizationPreviewMarkdown(content);
			assert.strictEqual(result, '```yaml\ndescription: Just metadata\n```\n\n');
		});
	});
});
