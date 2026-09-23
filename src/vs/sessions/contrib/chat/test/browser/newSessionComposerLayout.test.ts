/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { isExperimentalSessionComposerLayoutEnabled } from '../../browser/newChatWidget.js';
import { isExperimentalRunningSessionComposerLayoutEnabled } from '../../browser/chatView.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';

suite('New session composer layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const testCase of [
		{ unifiedPicker: false, experimentalLayout: false, expected: false },
		{ unifiedPicker: false, experimentalLayout: true, expected: false },
		{ unifiedPicker: true, experimentalLayout: false, expected: false },
		{ unifiedPicker: true, experimentalLayout: true, expected: true },
	]) {
		test(`unified picker ${testCase.unifiedPicker}, experimental layout ${testCase.experimentalLayout}`, () => {
			const configurationService = new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: testCase.unifiedPicker,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: testCase.experimentalLayout,
			});
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const mainContainer = document.createElement('div');
			const layoutService = new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = mainContainer;
			}();

			assert.deepStrictEqual({
				newSession: isExperimentalSessionComposerLayoutEnabled(configurationService),
				runningSession: isExperimentalRunningSessionComposerLayoutEnabled(configurationService, layoutService),
			}, {
				newSession: testCase.expected,
				runningSession: testCase.expected,
			});
		});
	}

	test('keeps the experimental running-session layout off on phone', () => {
		const configurationService = new TestConfigurationService({
			[UNIFIED_WORKSPACE_PICKER_SETTING]: true,
			[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const mainContainer = document.createElement('div');
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
		}();

		const desktop = isExperimentalRunningSessionComposerLayoutEnabled(configurationService, layoutService);
		mainContainer.classList.add('phone-layout');
		const phone = isExperimentalRunningSessionComposerLayoutEnabled(configurationService, layoutService);

		assert.deepStrictEqual({ desktop, phone }, { desktop: true, phone: false });
	});

	test('places repository controls after the workspace picker and restores their home', () => {
		const repositoryControlsHome = document.createElement('div');
		const repositoryControls = document.createElement('div');
		repositoryControls.textContent = 'Repository';
		repositoryControlsHome.append(repositoryControls);
		const pickerRow = document.createElement('div');
		const workspacePicker = document.createElement('div');
		workspacePicker.textContent = 'Workspace';
		const harnessPicker = document.createElement('div');
		harnessPicker.classList.add('sessions-chat-session-type-picker');
		harnessPicker.textContent = 'Harness';
		pickerRow.append(workspacePicker, harnessPicker);
		let visibilityUpdates = 0;
		let layouts = 0;
		const harness = Object.assign(Object.create(NewChatInputWidget.prototype), {
			_repositoryControlsContainer: repositoryControls,
			_repositoryControlsHome: repositoryControlsHome,
			_updateBottomContainerVisibility: () => visibilityUpdates++,
			_secondaryPickerResponsiveLayout: { layout: () => layouts++ },
		});
		const placeRepositoryControls = NewChatInputWidget.prototype.placeRepositoryControls as (this: typeof harness, container?: HTMLElement) => void;

		placeRepositoryControls.call(harness, pickerRow);
		const experimentalOrder = Array.from(pickerRow.children, element => element.textContent);
		placeRepositoryControls.call(harness);

		assert.deepStrictEqual({
			experimentalOrder,
			restoredOrder: Array.from(pickerRow.children, element => element.textContent),
			home: Array.from(repositoryControlsHome.children, element => element.textContent),
			visibilityUpdates,
			layouts,
		}, {
			experimentalOrder: ['Workspace', 'Repository', 'Harness'],
			restoredOrder: ['Workspace', 'Harness'],
			home: ['Repository'],
			visibilityUpdates: 2,
			layouts: 2,
		});
	});
});
