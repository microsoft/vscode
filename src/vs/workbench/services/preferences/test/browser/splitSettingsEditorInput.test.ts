/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { findGroup } from '../../../editor/common/editorGroupFinder.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { ACTIVE_GROUP } from '../../../editor/common/editorService.js';
import { getDefaultSettingsResource, ISettingsEditorOptions } from '../../common/preferences.js';
import { SplitSettingsEditorInput } from '../../common/preferencesEditorInput.js';
import { createEditorPart, ITestInstantiationService, registerTestEditor, registerTestSideBySideEditor, TestEditorPart, TestFileEditorInput, workbenchInstantiationService, workbenchTeardown } from '../../../../test/browser/workbenchTestServices.js';

suite('SplitSettingsEditorInput', () => {

	const TEST_EDITOR_ID = 'MyTestEditorForSplitSettingsEditorInput';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForSplitSettingsEditorInput';

	const settingsResource = URI.file('/User/settings.json');

	const disposables = new DisposableStore();

	let configurationService: TestConfigurationService;
	let instantiationService: ITestInstantiationService;
	let part: TestEditorPart;

	setup(async () => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_EDITOR_INPUT_ID));
		disposables.add(registerTestSideBySideEditor());

		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);
	});

	teardown(async () => {
		await workbenchTeardown(instantiationService);
		disposables.clear();
	});

	function createSplitSettingsEditorInput(target: ConfigurationTarget): SplitSettingsEditorInput {
		const primary = disposables.add(new TestFileEditorInput(settingsResource, TEST_EDITOR_INPUT_ID));
		const secondary = disposables.add(new TestFileEditorInput(getDefaultSettingsResource(target), TEST_EDITOR_INPUT_ID));

		return disposables.add(instantiationService.createInstance(SplitSettingsEditorInput, 'settings.json', undefined, secondary, primary));
	}

	/**
	 * The untyped editor the preferences service opens the split settings editor with.
	 */
	function splitSettingsRequest(target: ConfigurationTarget | undefined, options?: ISettingsEditorOptions): IResourceEditorInput {
		const settingsOptions: ISettingsEditorOptions = { override: SplitSettingsEditorInput.EDITOR_ID, target, pinned: true, ...options };

		return { resource: settingsResource, options: settingsOptions };
	}

	async function findGroupId(editor: IResourceEditorInput): Promise<number> {
		const [group]: [IEditorGroup, unknown] = await instantiationService.invokeFunction(findGroup, editor, ACTIVE_GROUP);

		return group.id;
	}

	test('matches untyped requests for the same settings file and configuration target', () => {
		const input = createSplitSettingsEditorInput(ConfigurationTarget.USER_LOCAL);

		assert.deepStrictEqual({
			sameTarget: input.matches(splitSettingsRequest(ConfigurationTarget.USER_LOCAL)),
			targetWithSameDefaultSettings: input.matches(splitSettingsRequest(ConfigurationTarget.USER_REMOTE)),
			targetWithOtherDefaultSettings: input.matches(splitSettingsRequest(ConfigurationTarget.WORKSPACE)),
			withoutTarget: input.matches(splitSettingsRequest(undefined)),
			withoutOverride: input.matches({ resource: settingsResource }),
			otherEditor: input.matches(splitSettingsRequest(ConfigurationTarget.USER_LOCAL, { override: DEFAULT_EDITOR_ASSOCIATION.id })),
			otherResource: input.matches({ ...splitSettingsRequest(ConfigurationTarget.USER_LOCAL), resource: URI.file('/other/settings.json') })
		}, {
			sameTarget: true,
			targetWithSameDefaultSettings: true,
			targetWithOtherDefaultSettings: false,
			withoutTarget: false,
			withoutOverride: false,
			otherEditor: false,
			otherResource: false
		});
	});

	test('reveals the split settings editor that is opened in another group', async () => {
		const rootGroup = part.activeGroup;
		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		await sideGroup.openEditor(createSplitSettingsEditorInput(ConfigurationTarget.USER_LOCAL), { pinned: true });
		part.activateGroup(rootGroup);

		const sameTarget = await findGroupId(splitSettingsRequest(ConfigurationTarget.USER_LOCAL, { revealIfOpened: true }));
		const otherTarget = await findGroupId(splitSettingsRequest(ConfigurationTarget.WORKSPACE, { revealIfOpened: true }));
		const withoutReveal = await findGroupId(splitSettingsRequest(ConfigurationTarget.USER_LOCAL));
		await configurationService.setUserConfiguration('workbench.editor.revealIfOpen', true);
		const revealIfOpenSetting = await findGroupId(splitSettingsRequest(ConfigurationTarget.USER_LOCAL));

		assert.deepStrictEqual(
			{ sameTarget, otherTarget, withoutReveal, revealIfOpenSetting },
			{ sameTarget: sideGroup.id, otherTarget: rootGroup.id, withoutReveal: rootGroup.id, revealIfOpenSetting: sideGroup.id }
		);
	});

	test('opens in the locked group that already contains the split settings editor', async () => {
		const rootGroup = part.activeGroup;
		await rootGroup.openEditor(createSplitSettingsEditorInput(ConfigurationTarget.USER_LOCAL), { pinned: true });
		rootGroup.lock(true);

		const sameTarget = await findGroupId(splitSettingsRequest(ConfigurationTarget.USER_LOCAL));
		const groupCountAfterSameTarget = part.groups.length;
		const otherTarget = await findGroupId(splitSettingsRequest(ConfigurationTarget.WORKSPACE));

		assert.deepStrictEqual(
			{ sameTarget, groupCountAfterSameTarget, otherTargetInLockedGroup: otherTarget === rootGroup.id },
			{ sameTarget: rootGroup.id, groupCountAfterSameTarget: 1, otherTargetInLockedGroup: false }
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
