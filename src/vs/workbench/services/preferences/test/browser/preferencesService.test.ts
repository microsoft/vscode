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
import { DEFAULT_EDITOR_ASSOCIATION, isEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { TestJSONEditingService } from '../../../configuration/test/common/testServices.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../editor/common/editorService.js';
import { IEditorGroupsService, IModalEditorPart } from '../../../editor/common/editorGroupsService.js';
import { PreferencesService } from '../../browser/preferencesService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../common/preferences.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService, ITestInstantiationService, workbenchInstantiationService, TestEditorService, TestEditorGroupsService, TestEditorGroupView } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

suite('PreferencesService', () => {
	let lastOpenEditorOptions: IEditorOptions | undefined;
	let lastOpenEditorGroup: PreferredGroup | undefined;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestObject(editorGroupsService?: IEditorGroupsService, configurationService?: TestConfigurationService): PreferencesService {
		lastOpenEditorOptions = undefined;
		lastOpenEditorGroup = undefined;

		const testInstantiationService: ITestInstantiationService = workbenchInstantiationService(
			configurationService ? { configurationService: () => configurationService } : {},
			disposables
		);

		class TestPreferencesEditorService extends TestEditorService {
			override async openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrGroup?: IEditorOptions | PreferredGroup, group?: PreferredGroup): Promise<undefined> {
				lastOpenEditorOptions = optionsOrGroup as IEditorOptions;
				lastOpenEditorGroup = group;
				// openEditor takes ownership of the input
				if (isEditorInput(editor)) {
					editor.dispose();
				}
				return undefined;
			}
		}

		testInstantiationService.stub(IEditorService, disposables.add(new TestPreferencesEditorService()));
		testInstantiationService.stub(IJSONEditingService, TestJSONEditingService);
		testInstantiationService.stub(IRemoteAgentService, TestRemoteAgentService);
		testInstantiationService.stub(ICommandService, TestCommandService);
		testInstantiationService.stub(IURLService, { registerHandler: () => { } });
		if (editorGroupsService) {
			testInstantiationService.stub(IEditorGroupsService, editorGroupsService);
		}

		// PreferencesService creates a PreferencesEditorInput which depends on IPreferencesService, add the real one, not a stub
		const collection = new ServiceCollection();
		collection.set(IPreferencesService, new SyncDescriptor(PreferencesService));
		const instantiationService = disposables.add(testInstantiationService.createChild(collection));
		return disposables.add(instantiationService.createInstance(PreferencesService));
	}

	test('options are preserved when calling openEditor', async () => {
		const testObject = createTestObject();
		await testObject.openSettings({ jsonEditor: false, query: 'test query' });
		const options = lastOpenEditorOptions as ISettingsEditorOptions;
		assert.strictEqual(options.focusSearch, true);
		assert.strictEqual(options.override, DEFAULT_EDITOR_ASSOCIATION.id);
		assert.strictEqual(options.query, 'test query');
	});

	test('opens in the source group when it lives in the main editor part (even with modal editors enabled)', async () => {
		const mainGroup = new TestEditorGroupView(1);
		const testObject = createTestObject(new TestEditorGroupsService([mainGroup]));

		await testObject.openUserSettings({ jsonEditor: false, groupId: mainGroup.id });

		assert.strictEqual(lastOpenEditorGroup, mainGroup);
	});

	test('opens in the modal group when the source group lives in the modal editor part', async () => {
		const modalGroup = new TestEditorGroupView(2);
		const modalEditorPart = { groups: [modalGroup] } as Partial<IModalEditorPart> as IModalEditorPart;
		const editorGroupsService = new class extends TestEditorGroupsService {
			override readonly activeModalEditorPart = modalEditorPart;
		}([modalGroup]);

		// Modal editors are turned off in settings to prove the routing comes from the
		// active modal editor part the action was invoked from and not from the modal default.
		const configurationService = new TestConfigurationService({ workbench: { editor: { useModal: 'off' } } });
		const testObject = createTestObject(editorGroupsService, configurationService);

		await testObject.openUserSettings({ jsonEditor: false, groupId: modalGroup.id });

		assert.strictEqual(lastOpenEditorGroup, MODAL_GROUP);
	});
});
