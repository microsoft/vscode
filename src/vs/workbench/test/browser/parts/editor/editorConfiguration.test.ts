/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DynamicEditorConfigurations } from '../../../../browser/parts/editor/editorConfiguration.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { diffEditorsAssociationsSettingId, editorsAssociationsSettingId, IEditorResolverService, markdownDefaultEditorAgentsWindowSettingId, MarkdownDefaultEditorMode } from '../../../../services/editor/common/editorResolverService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestExtensionService } from '../../../../test/common/workbenchTestServices.js';

suite('DynamicEditorConfigurations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('Markdown defaults distinguish configured booleans from legacy default assignments at startup and on changes', async () => {
		const screenReaderChanged = store.add(new Emitter<void>());
		let screenReaderOptimized = true;
		const accessibilityService = new class extends TestAccessibilityService {
			override onDidChangeScreenReaderOptimized = screenReaderChanged.event;
			override isScreenReaderOptimized() { return screenReaderOptimized; }
		};
		let defaultMode: MarkdownDefaultEditorMode | boolean = true;
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				const inspected = super.inspect<T>(key);
				if (key !== markdownDefaultEditorAgentsWindowSettingId) {
					return inspected;
				}
				return {
					...inspected,
					defaultValue: defaultMode as T,
					value: inspected.value ?? defaultMode as T
				};
			}
		}({ [markdownDefaultEditorAgentsWindowSettingId]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const editorResolverService = new class extends mock<IEditorResolverService>() {
			override onDidChangeEditorRegistrations = Event.None;
			override getEditors() { return []; }
		};
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override remoteAuthority = undefined;
		};
		const defaults: (string | undefined)[][] = [];
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		sinon.stub(configurationRegistry, 'updateConfigurations').callsFake(({ add }) => {
			defaults.push([editorsAssociationsSettingId, diffEditorsAssociationsSettingId].map(key => {
				const associations = add.find(node => node.properties?.[key])?.properties?.[key].agentsWindow?.default as Record<string, string> | undefined;
				return associations?.['*.md'];
			}));
		});
		store.add(new DynamicEditorConfigurations(editorResolverService, new TestExtensionService(), environmentService, configurationService, accessibilityService));
		await Promise.resolve();

		const setScreenReaderOptimized = (value: boolean) => {
			screenReaderOptimized = value;
			screenReaderChanged.fire();
		};
		const notifyModeChanged = () => {
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([markdownDefaultEditorAgentsWindowSettingId]),
				change: { keys: [markdownDefaultEditorAgentsWindowSettingId], overrides: [] },
				affectsConfiguration: key => key === markdownDefaultEditorAgentsWindowSettingId
			});
		};
		const setMode = async (mode: MarkdownDefaultEditorMode | boolean | undefined) => {
			await configurationService.setUserConfiguration(markdownDefaultEditorAgentsWindowSettingId, mode);
			notifyModeChanged();
		};

		await setMode('auto');
		setScreenReaderOptimized(false);
		setScreenReaderOptimized(true);
		await setMode('on');
		setScreenReaderOptimized(false);
		await setMode('off');
		setScreenReaderOptimized(true);
		await setMode('auto');
		await setMode(true);
		await setMode(false);
		await setMode(undefined);
		setScreenReaderOptimized(false);
		setScreenReaderOptimized(true);
		defaultMode = false;
		notifyModeChanged();

		assert.deepStrictEqual(defaults, [
			'vscode.markdown.editor', DEFAULT_EDITOR_ASSOCIATION.id, 'vscode.markdown.editor', DEFAULT_EDITOR_ASSOCIATION.id,
			'vscode.markdown.editor', 'vscode.markdown.editor', 'vscode.markdown.preview.editor',
			'vscode.markdown.preview.editor', DEFAULT_EDITOR_ASSOCIATION.id, 'vscode.markdown.editor',
			'vscode.markdown.preview.editor', DEFAULT_EDITOR_ASSOCIATION.id, 'vscode.markdown.editor', DEFAULT_EDITOR_ASSOCIATION.id,
			'vscode.markdown.preview.editor'
		].map(editor => [editor, editor]));
	});
});
