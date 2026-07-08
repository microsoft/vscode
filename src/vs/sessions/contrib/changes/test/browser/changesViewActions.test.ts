/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsSessionsWindowContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../../common/sessionConfig.js';
import { ChangesContextKeys } from '../../common/changes.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import '../../browser/changesViewActions.js';

suite('Changes View Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('collapse all diffs is contributed to the single-pane editor title bar', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.collapseAllDiffs');

		assert.ok(item, 'expected collapse all diffs action on the single-pane editor title menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(`config.${DOCK_DETAIL_PANEL_SETTING}`),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			group: 'navigation',
			order: 100,
			icon: Codicon.collapseAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});

	test('expand all diffs is contributed to the single-pane editor title bar', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.expandAllDiffs');

		assert.ok(item, 'expected expand all diffs action on the single-pane editor title menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(`config.${DOCK_DETAIL_PANEL_SETTING}`),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
			hasAllCollapsedGate: when.includes(EditorContextKeys.multiDiffEditorAllCollapsed.key),
		}, {
			group: 'navigation',
			order: 100,
			icon: Codicon.expandAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			hasAllCollapsedGate: true,
		});
	});

	test('toggle inline view command is contributed to the single-pane editor title bar', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.toggleInlineView');

		assert.ok(item, 'expected toggle inline view command on the single-pane editor title menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			toggled: (item.command.toggled as ContextKeyExpression | undefined)?.serialize(),
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(`config.${DOCK_DETAIL_PANEL_SETTING}`),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			group: 'navigation',
			order: 99,
			icon: Codicon.diffSidebyside.id,
			toggled: EditorContextKeys.multiDiffEditorRenderSideBySide.negate().serialize(),
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});

	test('view mode toggles are contributed to the single-pane editor title bar', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
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
				hasSinglePaneConfigGate: when.includes(`config.${DOCK_DETAIL_PANEL_SETTING}`),
				hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
				hasAuxBarVisibleGate: when.includes(AuxiliaryBarVisibleContext.key),
				hasViewModeGate: when.includes(ChangesContextKeys.ViewMode.key),
			};
		}).sort((a, b) => a.id.localeCompare(b.id));

		assert.deepStrictEqual(actual, [{
			id: 'workbench.action.agentSessions.setChangesListViewMode',
			title: 'View as List',
			group: '1_changesView',
			order: 10,
			icon: Codicon.listFlat.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
		}, {
			id: 'workbench.action.agentSessions.setChangesTreeViewMode',
			title: 'View as Tree',
			group: '1_changesView',
			order: 10,
			icon: Codicon.listTree.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
		}]);
	});
});
