/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorPane } from '../../../../common/editor.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { TestJSONEditingService } from '../../../configuration/test/common/testServices.js';
import { PreferencesService } from '../../browser/preferencesService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../common/preferences.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService, ITestInstantiationService, workbenchInstantiationService, TestEditorGroupView, TestEditorGroupsService } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { SettingsEditor2Input } from '../../common/preferencesEditorInput.js';

suite('PreferencesService', () => {
	let testInstantiationService: ITestInstantiationService;
	let testObject: PreferencesService;
	let lastOpenEditorOptions: IEditorOptions | undefined;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testInstantiationService = workbenchInstantiationService({}, disposables);

		class TestOpenEditorGroupView extends TestEditorGroupView {
			lastOpenEditorOptions: any;
			override openEditor(_editor: SettingsEditor2Input, options?: IEditorOptions): Promise<IEditorPane> {
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
		testInstantiationService.stub(IURLService, { registerHandler: () => { } });

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
});
