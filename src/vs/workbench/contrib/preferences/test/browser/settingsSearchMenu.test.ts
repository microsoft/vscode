/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { SuggestEnabledInput } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { SettingsSearchFilterDropdownMenuActionViewItem } from '../../browser/settingsSearchMenu.js';

suite('SettingsSearchFilterDropdownMenuActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups ExP Assigned with Advanced and toggles expassigned without removing other filters', async () => {
		let query = '@modified @tag:experimental font';
		let focused = 0;
		const input = new class extends mock<SuggestEnabledInput>() {
			override readonly inputWidget = new class extends mock<CodeEditorWidget>() {
				override getContribution() { return null; }
			}();
			override getValue() { return query; }
			override setValue(value: string) { query = value; }
			override focus() { focused++; }
		}();
		const menu = store.add(new SettingsSearchFilterDropdownMenuActionViewItem(
			store.add(new Action('filter', 'Filter')), {}, undefined, input,
			new class extends mock<IContextMenuService>() { }(),
		));
		const actions = menu.getActions();
		const lastGroup = actions.slice(actions.findLastIndex(action => action.id === Separator.ID) + 1).map(action => action.label);
		const assignmentActions = actions.filter(action => action.id === 'expAssignmentSettingsSearch');
		const initial = assignmentActions[0];
		await initial.run();
		const added = query;
		const checked = menu.getActions().find(action => action.id === 'expAssignmentSettingsSearch')!;
		await checked.run();

		assert.deepStrictEqual({ lastGroup, entries: assignmentActions.length, label: initial.label, initial: initial.checked, checked: checked.checked, added, removed: query, focused }, {
			lastGroup: ['Advanced', 'ExP Assigned'],
			entries: 1,
			label: 'ExP Assigned',
			initial: false,
			checked: true,
			added: '@modified @tag:experimental font @tag:expassigned',
			removed: '@modified @tag:experimental font',
			focused: 2,
		});
	});
});
