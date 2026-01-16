/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorPane } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { TestJSONEditingService } from '../../../configuration/test/common/testServices.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { PreferencesService } from '../../browser/preferencesService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../common/preferences.js';
import { ITestInstantiationService, TestEditorGroupsService, TestEditorGroupView, TestRemoteAgentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';

suite('PreferencesService', () => {
	let testInstantiationService: ITestInstantiationService;
	let testObject: PreferencesService;
	let lastOpenEditorOptions: IEditorOptions | undefined;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testInstantiationService = workbenchInstantiationService({}, disposables);

		class TestOpenEditorGroupView extends TestEditorGroupView {
			override openEditor(_editor: EditorInput, options?: IEditorOptions): Promise<IEditorPane> {
				lastOpenEditorOptions = options;
				_editor.dispose();
				return Promise.resolve(undefined!);
			}
		}

		const testEditorGroupService = new TestEditorGroupsService([new TestOpenEditorGroupView(0)]);
		testInstantiationService.stub(IEditorGroupsService, testEditorGroupService);
		testInstantiationService.stub(IJSONEditingService, TestJSONEditingService);
		testInstantiationService.stub(IRemoteAgentService, TestRemoteAgentService);
		testInstantiationService.stub(ICommandService, TestCommandService);
		testInstantiationService.stub(IURLService, { registerHandler: () => ({ dispose: () => { } }) });

		// PreferencesService creates a PreferencesEditorInput which depends on IPreferencesService, add the real one, not a stub
		const collection = new ServiceCollection();
		collection.set(IPreferencesService, new SyncDescriptor(PreferencesService));
		const instantiationService = disposables.add(testInstantiationService.createChild(collection));
		testObject = disposables.add(instantiationService.createInstance(PreferencesService));
	});
	test('options are preserved when calling openEditor', async () => {
		await testObject.openSettings({ jsonEditor: false, query: 'test query' });
		const options = lastOpenEditorOptions as ISettingsEditorOptions;
		assert.strictEqual(options.focusSearch, true);
		assert.strictEqual(options.override, DEFAULT_EDITOR_ASSOCIATION.id);
		assert.strictEqual(options.query, 'test query');
	});

	suite('openUserSettings with workbench.settings.editor set to json', () => {
		let jsonTestObject: PreferencesService;

		setup(() => {
			const configService = new TestConfigurationService({
				'workbench.settings.editor': 'json'
			});

			const jsonTestInstantiationService = workbenchInstantiationService({
				configurationService: () => configService
			}, disposables);

			class TestOpenEditorGroupViewForJson extends TestEditorGroupView {
				override openEditor(_editor: EditorInput, options?: IEditorOptions): Promise<IEditorPane> {
					lastOpenEditorOptions = options;
					_editor.dispose();
					return Promise.resolve(undefined!);
				}
			}

			const testEditorGroupService = new TestEditorGroupsService([new TestOpenEditorGroupViewForJson(0)]);
			jsonTestInstantiationService.stub(IEditorGroupsService, testEditorGroupService);
			jsonTestInstantiationService.stub(IJSONEditingService, TestJSONEditingService);
			jsonTestInstantiationService.stub(IRemoteAgentService, TestRemoteAgentService);
			jsonTestInstantiationService.stub(ICommandService, TestCommandService);
			jsonTestInstantiationService.stub(IURLService, { registerHandler: () => ({ dispose: () => { } }) });

			const collection = new ServiceCollection();
			collection.set(IPreferencesService, new SyncDescriptor(PreferencesService));
			const instantiationService = disposables.add(jsonTestInstantiationService.createChild(collection));
			jsonTestObject = disposables.add(instantiationService.createInstance(PreferencesService));
		});

		test('query that looks like a setting key should be converted to revealSetting', async () => {
			await jsonTestObject.openUserSettings({ query: 'editor.fontSize' });
			const options = lastOpenEditorOptions as ISettingsEditorOptions;
			assert.deepStrictEqual(options.revealSetting, { key: 'editor.fontSize' });
			assert.strictEqual(options.query, undefined);
		});

		test('query with @id: prefix should extract the setting key', async () => {
			await jsonTestObject.openUserSettings({ query: '@id:editor.fontSize' });
			const options = lastOpenEditorOptions as ISettingsEditorOptions;
			assert.deepStrictEqual(options.revealSetting, { key: 'editor.fontSize' });
			assert.strictEqual(options.query, undefined);
		});

		test('query with any format should be used as revealSetting key', async () => {
			await jsonTestObject.openUserSettings({ query: '@feature:chat' });
			const options = lastOpenEditorOptions as ISettingsEditorOptions;
			assert.deepStrictEqual(options.revealSetting, { key: '@feature:chat' });
			assert.strictEqual(options.query, undefined);
		});

		test('existing revealSetting should not be overridden by query', async () => {
			await jsonTestObject.openUserSettings({
				query: 'editor.fontSize',
				revealSetting: { key: 'editor.tabSize', edit: true }
			});
			const options = lastOpenEditorOptions as ISettingsEditorOptions;
			assert.deepStrictEqual(options.revealSetting, { key: 'editor.tabSize', edit: true });
			assert.strictEqual(options.query, 'editor.fontSize');
		});
	});
});
