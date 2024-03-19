/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { TestJSONEditingService } from 'vs/workbench/services/configuration/test/common/testServices';
import { PreferencesService } from 'vs/workbench/services/preferences/browser/preferencesService';
import { IPreferencesService, ISettingsEditorOptions } from 'vs/workbench/services/preferences/common/preferences';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestRemoteAgentService, ITestInstantiationService, TestEditorService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('PreferencesService', () => {
	let testInstantiationService: ITestInstantiationService;
	let testObject: PreferencesService;
	let editorService: TestEditorService2;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		editorService = disposables.add(new TestEditorService2());
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
		testObject = disposables.add(instantiationService.createInstance(PreferencesService));
	});
	test('options are preserved when calling openEditor', async () => {
		testObject.openSettings({ jsonEditor: false, query: 'test query' });
		const options = editorService.lastOpenEditorOptions as ISettingsEditorOptions;
		assert.strictEqual(options.focusSearch, true);
		assert.strictEqual(options.override, DEFAULT_EDITOR_ASSOCIATION.id);
		assert.strictEqual(options.query, 'test query');
	});
});

class TestEditorService2 extends TestEditorService {
	lastOpenEditorOptions: any;

	override async openEditor(editorInput: any, options?: any): Promise<any | undefined> {
		this.lastOpenEditorOptions = options;
		return super.openEditor(editorInput, options);
	}
}
