/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { areNewSessionWelcomePhrasesEnabled, isExperimentalSessionComposerLayoutEnabled } from '../../browser/newChatWidget.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';

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

			assert.strictEqual(isExperimentalSessionComposerLayoutEnabled(configurationService), testCase.expected);
		});
	}

	test('welcome phrases are independent from the experimental composer layout', () => {
		const configurations = [
			new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: true,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: true,
				[NEW_SESSION_WELCOME_PHRASES_SETTING]: false,
			}),
			new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: false,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: false,
				[NEW_SESSION_WELCOME_PHRASES_SETTING]: true,
			}),
		];
		for (const configurationService of configurations) {
			store.add(configurationService.onDidChangeConfigurationEmitter);
		}

		assert.deepStrictEqual(configurations.map(configurationService => ({
			experimentalLayout: isExperimentalSessionComposerLayoutEnabled(configurationService),
			welcomePhrases: areNewSessionWelcomePhrasesEnabled(configurationService),
		})), [
			{ experimentalLayout: true, welcomePhrases: false },
			{ experimentalLayout: false, welcomePhrases: true },
		]);
	});

	test('places repository controls in the workspace row and restores their home', () => {
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
