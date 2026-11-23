/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseNamedLayoutDefinition, SIDE_BAR_LOCATION_SETTING } from '../../common/namedLayoutDefinition.js';

suite('NamedLayoutDefinition', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps valid values and drops invalid values and settings that layouts cannot define', () => {
		const result = parseNamedLayoutDefinition({
			id: 'debug',
			label: 'Debug',
			settings: { 'workbench.editor.showTabs': 'single', 'editor.fontSize': 20 },
			sideBar: { visible: true, position: 'right', size: 2 },
			panel: { position: 'middle', maximized: true, size: 0.3 },
			viewContainers: { 'workbench.view.debug': { location: 'panel', order: 1 }, 'invalid': 1 },
			views: { 'workbench.debug.variablesView': { visible: 'yes', order: 2 } },
			editor: { orientation: 'vertical', groups: [{ size: 1 }, { size: -1, groups: [{}, {}] }] }
		}, key => key === 'workbench.editor.showTabs' || key === SIDE_BAR_LOCATION_SETTING);

		assert.deepStrictEqual(result, {
			definition: {
				settings: { 'workbench.editor.showTabs': 'single', [SIDE_BAR_LOCATION_SETTING]: 'right' },
				sideBar: { visible: true },
				panel: { size: 0.3, maximized: true },
				viewContainers: { 'workbench.view.debug': { location: 'panel', order: 1 } },
				views: { 'workbench.debug.variablesView': { order: 2 } },
				editor: { orientation: 'vertical', groups: [{ size: 1 }, { groups: [{}, {}] }] }
			},
			problems: [
				`The setting 'editor.fontSize' is ignored, a layout can only define layout related settings.`,
				`The value of 'sideBar.size' is invalid and ignored.`,
				`The value of 'panel.position' is invalid and ignored.`,
				`The value of 'viewContainers.invalid' is invalid and ignored.`,
				`The value of 'views.workbench.debug.variablesView.visible' is invalid and ignored.`,
				`The value of 'editor.groups[1].size' is invalid and ignored.`
			]
		});
	});
});
