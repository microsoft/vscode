/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { EditorResolution } from 'vs/platform/editor/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { TestJSONEditingService } from 'vs/workbench/services/configuration/test/common/testServices';
import { PreferencesService } from 'vs/workbench/services/preferences/browser/preferencesService';
import { IPreferencesService, ISettingsEditorOptions } from 'vs/workbench/services/preferences/common/preferences';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestRemoteAgentService, ITestInstantiationService, TestEditorService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('PreferencesService', () => {

	let disposables: DisposableStore;
	let testInstantiationService: ITestInstantiationService;
	let testObject: PreferencesService;
	let editorService: TestEditorService2;

	setup(() => {
		disposables = new DisposableStore();
		editorService = new TestEditorService2();
		testInstantiationService = workbenchInstantiationService({
			editorService: () => editorService
		}, disposables);

		testInstantiationService.stub(IJSONEditingService, TestJSONEditingService);
		testInstantiationService.stub(IRemoteAgentService, TestRemoteAgentService);
		testInstantiationService.stub(ICommandService, TestCommandService);

		// PreferencesService creates a PreferencesEditorInput which depends on IPreferencesService, add the real one, not a stub
		const collection = new ServiceCollection();
		collection.set(IPreferencesService, new SyncDescriptor(PreferencesService));
		const instantiationService = testInstantiationService.createChild(collection);
		testObject = instantiationService.createInstance(PreferencesService);
	});

	teardown(() => {
		disposables.dispose();
	});

	test('options are preserved when calling openEditor', async () => {
		testObject.openSettings({ jsonEditor: false, query: 'test query' });
		const options = editorService.lastOpenEditorOptions as ISettingsEditorOptions;
		assert.strictEqual(options.focusSearch, true);
		assert.strictEqual(options.override, EditorResolution.DISABLED);
		assert.strictEqual(options.query, 'test query');
	});
});

class TestEditorService2 extends TestEditorService {
	lastOpenEditorOptions: any;

	override async openEditor(editor: any, optionsOrGroup?: any): Promise<any | undefined> {
		this.lastOpenEditorOptions = optionsOrGroup;
		return undefined;
	}
}
