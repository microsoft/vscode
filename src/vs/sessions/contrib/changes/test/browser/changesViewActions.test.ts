/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext, TextCompareEditorActiveContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChangesContextKeys, ChangesViewMode } from '../../common/changes.js';
import { IsPhoneLayoutContext, SessionHasChangesContext, SessionHasWorkspaceContext, SessionIsCreatedContext, SinglePaneDiffEditorInputActiveContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { CHANGES_HEADER_ACTIONS_ID } from '../../browser/changesView.js';
import '../../browser/changesViewActions.js';

suite('Changes View Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let changesViewWhen: ContextKeyExpression | undefined;

	suiteSetup(async () => {
		({ changesViewWhen } = await import('../../browser/changes.contribution.js'));
	});

	test('Changes view is hidden until the session is created', () => {
		assert.ok(changesViewWhen);
		const context = new Context(1, null);
		context.setValue(IsPhoneLayoutContext.key, false);
		context.setValue(SessionHasWorkspaceContext.key, true);
		context.setValue(SessionIsCreatedContext.key, false);
		const whileNew = changesViewWhen.evaluate(context);

		context.setValue(SessionIsCreatedContext.key, true);
		assert.deepStrictEqual({
			whileNew,
			afterCreation: changesViewWhen.evaluate(context),
		}, {
			whileNew: false,
			afterCreation: true,
		});
	});

	test('Open Pull Request delegates to the shared GitHub action', async () => {
		const activeSession = new class extends mock<IActiveSession>() { };
		const calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
				calls.push({ commandId, args });
				return undefined;
			}
		});
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.agentSessions.openPullRequest')!.handler(accessor));

		assert.deepStrictEqual(calls, [{
			commandId: 'workbench.agentSessions.action.openPullRequest',
			args: [activeSession],
		}]);
	});

	test('primary header actions gate themselves to the single-pane Changes editor', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderPrimary)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'chatEditing.versionsPicker' || item.command.id === 'workbench.changesView.action.viewChanges');

		assert.deepStrictEqual(items.map(item => {
			const when = item.when?.serialize() ?? '';
			return {
				id: item.command.id,
				hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
				hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			};
		}), [
			{
				id: 'chatEditing.versionsPicker',
				hasActiveEditorGate: true,
				hasSinglePaneConfigGate: true,
			},
			{
				id: 'workbench.changesView.action.viewChanges',
				hasActiveEditorGate: true,
				hasSinglePaneConfigGate: true,
			},
		]);
	});

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

	test('toggle inline view is contributed to multi-file and single-file diff editor headers with toggle state', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'toggle.diff.renderSideBySide');

		assert.ok(item, 'expected the toggle inline view action on the single-pane editor header menu');
		const when = item.when?.serialize() ?? '';
		const toggled = item.command.toggled;
		const toggledInfo = isICommandActionToggleInfo(toggled) ? toggled : undefined;
		const nonTextDiffContext = new Context(1, null);
		nonTextDiffContext.setValue(IsSessionsWindowContext.key, true);
		nonTextDiffContext.setValue(SinglePaneDiffEditorInputActiveContext.key, true);
		nonTextDiffContext.setValue(SinglePaneLayoutEnabledContext.key, true);
		nonTextDiffContext.setValue(IsAuxiliaryWindowContext.key, false);
		nonTextDiffContext.setValue(IsTopRightEditorGroupContext.key, true);
		nonTextDiffContext.setValue(MainEditorAreaVisibleContext.key, true);
		assert.deepStrictEqual({
			id: item.command.id,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			group: item.group,
			order: item.order,
			icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			toggledTitle: toggledInfo?.title,
			toggledOnMultiDiffSideBySide: toggledInfo?.condition.serialize().includes(EditorContextKeys.multiDiffEditorRenderSideBySide.key),
			toggledOnSingleDiffSideBySide: toggledInfo?.condition.serialize().includes(EditorContextKeys.diffEditorInlineMode.key),
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasTextCompareEditorGate: when.includes(TextCompareEditorActiveContext.key),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
			matchesNonTextDiffContext: item.when?.evaluate(nonTextDiffContext) ?? false,
		}, {
			id: 'toggle.diff.renderSideBySide',
			title: 'Show Side by Side Diff',
			group: '1_diff',
			order: 20,
			icon: Codicon.diffSidebyside.id,
			toggledTitle: 'Show Inline Diff',
			toggledOnMultiDiffSideBySide: true,
			toggledOnSingleDiffSideBySide: true,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasTextCompareEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			matchesNonTextDiffContext: false,
		});
	});

	test('toggle inline view is contributed to the command palette (Changes category)', () => {
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'toggle.diff.renderSideBySide' && item.command.category !== undefined && (typeof item.command.category === 'string' ? item.command.category : item.command.category.value) === 'Changes');

		assert.ok(item, 'expected the toggle inline view action in the command palette');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			id: item.command.id,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			category: item.command.category && typeof item.command.category !== 'string' ? item.command.category.value : item.command.category,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasTextCompareEditorGate: when.includes(TextCompareEditorActiveContext.key),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			id: 'toggle.diff.renderSideBySide',
			title: 'Toggle Diff View',
			category: 'Changes',
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasTextCompareEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});


	test('view mode toggles include non-text single-file diff editor headers', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.action.agentSessions.setChangesListViewMode' || item.command.id === 'workbench.action.agentSessions.setChangesTreeViewMode');

		const actual = items.map(item => {
			const when = item.when?.serialize() ?? '';
			const context = new Context(1, null);
			context.setValue(IsSessionsWindowContext.key, true);
			context.setValue(SinglePaneDiffEditorInputActiveContext.key, true);
			context.setValue(SinglePaneLayoutEnabledContext.key, true);
			context.setValue(IsAuxiliaryWindowContext.key, false);
			context.setValue(IsTopRightEditorGroupContext.key, true);
			context.setValue(AuxiliaryBarVisibleContext.key, true);
			context.setValue(
				ChangesContextKeys.ViewMode.key,
				item.command.id === 'workbench.action.agentSessions.setChangesListViewMode' ? ChangesViewMode.Tree : ChangesViewMode.List
			);
			return {
				id: item.command.id,
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
				order: item.order,
				icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
				hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
				hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
				hasDiffEditorInputGate: when.includes(SinglePaneDiffEditorInputActiveContext.key),
				hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
				hasAuxBarVisibleGate: when.includes(AuxiliaryBarVisibleContext.key),
				hasViewModeGate: when.includes(ChangesContextKeys.ViewMode.key),
				matchesSingleFileDiffContext: item.when?.evaluate(context) ?? false,
			};
		}).sort((a, b) => a.id.localeCompare(b.id));

		assert.deepStrictEqual(actual, [{
			id: 'workbench.action.agentSessions.setChangesListViewMode',
			title: 'View as List',
			group: 'secondary/2_viewMode',
			order: 20,
			icon: Codicon.listFlat.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasDiffEditorInputGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
			matchesSingleFileDiffContext: true,
		}, {
			id: 'workbench.action.agentSessions.setChangesTreeViewMode',
			title: 'View as Tree',
			group: 'secondary/2_viewMode',
			order: 20,
			icon: Codicon.listTree.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasDiffEditorInputGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasViewModeGate: true,
			matchesSingleFileDiffContext: true,
		}]);
	});

	test('Create Pull Request anchor is contributed to the right-side title bar menu for created sessions', () => {
		const item = MenuRegistry.getMenuItems(Menus.TitleBarSessionMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === CHANGES_HEADER_ACTIONS_ID);
		const editorTitleItem = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === CHANGES_HEADER_ACTIONS_ID);

		assert.ok(item, 'expected the changes header actions anchor on the title bar session menu');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			editorTitleItem,
			group: item.group,
			order: item.order,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasAuxiliaryWindowGate: when.includes(IsAuxiliaryWindowContext.key),
			hasSinglePaneLayoutGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasCreatedSessionGate: when.includes(SessionIsCreatedContext.key),
			hasChangesGate: when.includes(SessionHasChangesContext.key),
		}, {
			editorTitleItem: undefined,
			group: 'navigation',
			order: 5,
			hasSessionsWindowGate: true,
			hasAuxiliaryWindowGate: true,
			hasSinglePaneLayoutGate: true,
			hasCreatedSessionGate: true,
			hasChangesGate: true,
		});
	});
});
