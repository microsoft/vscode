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
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, isEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { TestJSONEditingService } from '../../../configuration/test/common/testServices.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../editor/common/editorService.js';
import { IEditorGroupsService, IModalEditorPart } from '../../../editor/common/editorGroupsService.js';
import { PreferencesService } from '../../browser/preferencesService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../common/preferences.js';
import { SplitSettingsEditorInput } from '../../common/preferencesEditorInput.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService, ITestInstantiationService, workbenchInstantiationService, TestEditorService, TestEditorGroupsService, TestEditorGroupView } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';

suite('PreferencesService', () => {
	let lastOpenUntypedEditor: IUntypedEditorInput | undefined;
	let lastOpenEditorOptions: IEditorOptions | undefined;
	let lastOpenEditorGroup: PreferredGroup | undefined;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestObject(editorGroupsService?: IEditorGroupsService, configurationService?: TestConfigurationService): PreferencesService {
		lastOpenUntypedEditor = undefined;
		lastOpenEditorOptions = undefined;
		lastOpenEditorGroup = undefined;

		const testInstantiationService: ITestInstantiationService = workbenchInstantiationService(
			configurationService ? { configurationService: () => configurationService } : {},
			disposables
		);

		class TestPreferencesEditorService extends TestEditorService {
			override async openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrGroup?: IEditorOptions | PreferredGroup, group?: PreferredGroup): Promise<undefined> {
				if (isEditorInput(editor)) {
					lastOpenEditorOptions = optionsOrGroup as IEditorOptions;
					lastOpenEditorGroup = group;
					// openEditor takes ownership of the input
					editor.dispose();
				} else {
					lastOpenUntypedEditor = editor;
					lastOpenEditorOptions = editor.options;
					lastOpenEditorGroup = optionsOrGroup as PreferredGroup;
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

	test('opens the settings JSON file as an untyped text editor', async () => {
		const testObject = createTestObject();
		await testObject.openUserSettings({ jsonEditor: true });

		const options = lastOpenEditorOptions as ISettingsEditorOptions;
		assert.deepStrictEqual({
			resource: EditorResourceAccessor.getCanonicalUri(lastOpenUntypedEditor)?.toString(),
			override: options.override,
			target: options.target,
			pinned: options.pinned
		}, {
			resource: testObject.userSettingsResource.toString(),
			override: DEFAULT_EDITOR_ASSOCIATION.id,
			target: ConfigurationTarget.USER_LOCAL,
			pinned: true
		});
	});

	test('opens the split settings JSON editor as an untyped editor resolved by its registration', async () => {
		const configurationService = new TestConfigurationService({ workbench: { settings: { useSplitJSON: true } } });
		const testObject = createTestObject(undefined, configurationService);
		await testObject.openUserSettings({ jsonEditor: true });

		const options = lastOpenEditorOptions as ISettingsEditorOptions;
		assert.deepStrictEqual({
			resource: EditorResourceAccessor.getCanonicalUri(lastOpenUntypedEditor)?.toString(),
			override: options.override,
			target: options.target,
			pinned: options.pinned
		}, {
			resource: testObject.userSettingsResource.toString(),
			override: SplitSettingsEditorInput.EDITOR_ID,
			target: ConfigurationTarget.USER_LOCAL,
			pinned: true
		});
	});

	test('split settings editor input reports the editor id of its registration', () => {
		const testObject = createTestObject();
		const input = testObject.createSplitJsonEditorInput(ConfigurationTarget.USER_LOCAL, testObject.userSettingsResource);
		assert.ok(input instanceof SplitSettingsEditorInput);
		disposables.add(input);
		disposables.add(input.primary);
		disposables.add(input.secondary);

		// The type id stays the one of side by side editors so that the side by side
		// editor context keys and serializer keep applying to the split settings editor
		assert.deepStrictEqual({ typeId: input.typeId, editorId: input.editorId }, { typeId: SideBySideEditorInput.ID, editorId: SplitSettingsEditorInput.EDITOR_ID });
	});

	test('opens keyboard shortcuts in the modal group regardless of the source group', async () => {
		const mainGroup = new TestEditorGroupView(1);
		const testObject = createTestObject(new TestEditorGroupsService([mainGroup]));

		await testObject.openGlobalKeybindingSettings(false, { groupId: mainGroup.id });

		assert.strictEqual(lastOpenEditorGroup, MODAL_GROUP);
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
