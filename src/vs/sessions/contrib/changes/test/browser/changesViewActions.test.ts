/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsSessionsWindowContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { ChangesContextKeys } from '../../common/changes.js';
import { SessionHasChangesContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { CHANGES_HEADER_ACTIONS_ID } from '../../browser/changesView.js';
import '../../browser/changesViewActions.js';

suite('Changes View Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('collapse all diffs is contributed to the single-pane editor header (right)', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.collapseAllDiffs');

		assert.ok(item, 'expected collapse all diffs action on the single-pane editor header menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			group: '1_diff',
			order: 10,
			icon: Codicon.collapseAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});

	test('expand all diffs is contributed to the single-pane editor header (right)', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.expandAllDiffs');

		assert.ok(item, 'expected expand all diffs action on the single-pane editor header menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
			hasAllCollapsedGate: when.includes(EditorContextKeys.multiDiffEditorAllCollapsed.key),
		}, {
			group: '1_diff',
			order: 10,
			icon: Codicon.expandAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			hasAllCollapsedGate: true,
		});
	});

	test('toggle inline view is contributed to the single-pane editor header (1_diff group) with toggle state', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.toggleInlineView');

		assert.ok(item, 'expected the toggle inline view action on the single-pane editor header menu');
		const when = item.when?.serialize() ?? '';
		const toggled = item.command.toggled;
		const toggledInfo = isICommandActionToggleInfo(toggled) ? toggled : undefined;
		assert.deepStrictEqual({
			id: item.command.id,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			toggledTitle: toggledInfo?.title,
			toggledOnSideBySide: toggledInfo?.condition.serialize() === EditorContextKeys.multiDiffEditorRenderSideBySide.serialize(),
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			id: 'workbench.action.agentSessions.toggleInlineView',
			title: 'Show Side by Side Diff',
			group: '1_diff',
			order: 20,
			icon: Codicon.diffSidebyside.id,
			toggledTitle: 'Show Inline Diff',
			toggledOnSideBySide: true,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});

	test('toggle inline view is contributed to the command palette (Changes category)', () => {
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.toggleInlineView');

		assert.ok(item, 'expected the toggle inline view action in the command palette');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			id: item.command.id,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			category: item.command.category && typeof item.command.category !== 'string' ? item.command.category.value : item.command.category,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			id: 'workbench.action.agentSessions.toggleInlineView',
			title: 'Toggle Diff View',
			category: 'Changes',
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});


	test('view mode toggles are contributed to the single-pane editor header overflow', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.action.agentSessions.setChangesListViewMode' || item.command.id === 'workbench.action.agentSessions.setChangesTreeViewMode');

		const actual = items.map(item => {
			const when = item.when?.serialize() ?? '';
			return {
				id: item.command.id,
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
				order: item.order,
				icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
				hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
				hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
				hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
				hasAuxBarVisibleGate: when.includes(AuxiliaryBarVisibleContext.key),
				hasViewModeGate: when.includes(ChangesContextKeys.ViewMode.key),
			};
		}).sort((a, b) => a.id.localeCompare(b.id));

		assert.deepStrictEqual(actual, [{
			id: 'workbench.action.agentSessions.setChangesListViewMode',
			title: 'View as List',
			group: 'secondary',
			order: 20,
			icon: Codicon.listFlat.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
		}, {
			id: 'workbench.action.agentSessions.setChangesTreeViewMode',
			title: 'View as Tree',
			group: 'secondary',
			order: 20,
			icon: Codicon.listTree.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
		}]);
	});

	test('Create Pull Request anchor is contributed to the title bar session menu', () => {
		const item = MenuRegistry.getMenuItems(Menus.TitleBarSessionMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === CHANGES_HEADER_ACTIONS_ID);

		assert.ok(item, 'expected the changes header actions anchor on the title bar session menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasChangesGate: when.includes(SessionHasChangesContext.key),
		}, {
			group: 'navigation',
			order: 5,
			hasSessionsWindowGate: true,
			hasSinglePaneConfigGate: true,
			hasChangesGate: true,
		});
	});
});
