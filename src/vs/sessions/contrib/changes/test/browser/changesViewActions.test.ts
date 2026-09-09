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
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { SessionsDiffViewModeContext } from '../../../editor/common/diffEditorOptionsService.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext, TextCompareEditorActiveContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatPetAchievementId, ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { OpenMultiDiffEditorLayoutDebugAction } from '../../../../../workbench/contrib/multiDiffEditor/browser/actions.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChangesContextKeys, ChangesViewMode } from '../../common/changes.js';
import { CustomViewVisibleContext, IsPhoneLayoutContext, SessionHasChangesContext, SessionHasWorkspaceContext, SessionIsCreatedContext, SinglePaneDiffEditorInputActiveContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { MultiDiffEditor } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';
import { CHANGES_HEADER_ACTIONS_ID, unlockChatPetCreatePullRequestAchievement } from '../../browser/changesView.js';
import { SessionsChangesAccessibilityHelp } from '../../browser/sessionsChangesAccessibilityHelp.js';
import '../../browser/changesViewActions.js';

suite('Changes View Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let changesViewWhen: ContextKeyExpression | undefined;

	suiteSetup(async () => {
		({ changesViewWhen } = await import('../../browser/changes.contribution.js'));
	});

	test('Changes view is available for new and created workspace sessions', () => {
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
			whileNew: true,
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

	test('Create PR button actions unlock Ship it without drafts or updates', () => {
		const attemptedUnlocks: ChatPetAchievementId[] = [];
		const chatPetService = new class extends mock<IChatPetService>() {
			override unlockAchievement(id: ChatPetAchievementId): boolean {
				attemptedUnlocks.push(id);
				return true;
			}
		}();

		const results = [
			'create-pr',
			'create-pr-auto-merge',
			'create-pr-auto-squash',
			'create-pr-auto-rebase',
			'create-pr-agent-merge',
			'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR',
			'workbench.action.agentSessions.runSkill.createPR',
			'create-draft-pr',
			'workbench.action.agentSessions.runSkill.createDraftPR',
			'workbench.action.agentSessions.runSkill.updatePR',
		].map(actionId => unlockChatPetCreatePullRequestAchievement(actionId, chatPetService));

		assert.deepStrictEqual({ results, attemptedUnlocks }, {
			results: [true, true, true, true, true, true, true, false, false, false],
			attemptedUnlocks: Array(7).fill(ChatPetAchievementIds.CreatePullRequest),
		});
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

	test('collapse all diffs is contributed to the editor header layout overflow menu', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.collapseAllDiffs');

		assert.ok(item, 'expected collapse all diffs action in the editor header layout overflow menu');
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
			group: 'secondary/1_diff',
			order: 10,
			icon: Codicon.collapseAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
		});
	});

	test('expand all diffs is contributed to the editor header layout overflow menu', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.expandAllDiffs');

		assert.ok(item, 'expected expand all diffs action in the editor header layout overflow menu');
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
			group: 'secondary/1_diff',
			order: 10,
			icon: Codicon.expandAll.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasEditorAreaVisibleGate: true,
			hasAllCollapsedGate: true,
		});
	});

	test('Diff View submenu is contributed for text and multi-diff editors in both Agents layouts', () => {
		const getSubmenu = (menuId: MenuId) => MenuRegistry.getMenuItems(menuId)
			.filter(isISubmenuItem)
			.find(item => item.submenu === Menus.SessionsDiffEditorView);
		const singlePane = getSubmenu(Menus.SessionsEditorTitle);
		const classic = getSubmenu(MenuId.EditorTitle);

		assert.ok(singlePane);
		assert.ok(classic);
		const singlePaneWhen = singlePane.when?.serialize() ?? '';
		const classicWhen = classic.when?.serialize() ?? '';
		assert.deepStrictEqual({
			singlePaneTitle: typeof singlePane.title === 'string' ? singlePane.title : singlePane.title.value,
			singlePaneGroup: singlePane.group,
			singlePaneHasTextDiffGate: singlePaneWhen.includes(TextCompareEditorActiveContext.key),
			singlePaneHasChangesGate: singlePaneWhen.includes(SessionChangesEditor.ID),
			singlePaneHasMultiDiffGate: singlePaneWhen.includes(MultiDiffEditor.ID),
			singlePaneHasLayoutGate: singlePaneWhen.includes(SinglePaneLayoutEnabledContext.key),
			classicTitle: typeof classic.title === 'string' ? classic.title : classic.title.value,
			classicHasSessionsGate: classicWhen.includes(IsSessionsWindowContext.key),
			classicHasTextDiffGate: classicWhen.includes(TextCompareEditorActiveContext.key),
			classicHasChangesGate: classicWhen.includes(SessionChangesEditor.ID),
			classicHasMultiDiffGate: classicWhen.includes(MultiDiffEditor.ID),
			classicHasLayoutGate: classicWhen.includes(SinglePaneLayoutEnabledContext.key),
		}, {
			singlePaneTitle: 'Diff View',
			singlePaneGroup: '1_diff',
			singlePaneHasTextDiffGate: true,
			singlePaneHasChangesGate: true,
			singlePaneHasMultiDiffGate: true,
			singlePaneHasLayoutGate: true,
			classicTitle: 'Diff View',
			classicHasSessionsGate: true,
			classicHasTextDiffGate: true,
			classicHasChangesGate: true,
			classicHasMultiDiffGate: true,
			classicHasLayoutGate: true,
		});
	});

	test('Agents Diff View submenu exposes inline, side-by-side, and automatic modes', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionsDiffEditorView)
			.filter(isIMenuItem)
			.map(item => ({
				id: item.command.id,
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
				order: item.order,
			}));
		const modeContext = new Context(1, null);
		modeContext.setValue(SessionsDiffViewModeContext.key, 'sideBySide');

		assert.deepStrictEqual({
			items,
			selectedMode: modeContext.getValue(SessionsDiffViewModeContext.key),
		}, {
			items: [
				{ id: 'diffEditor.setViewMode.inline', title: 'Inline', group: '1_view', order: 1 },
				{ id: 'diffEditor.setViewMode.sideBySide', title: 'Side by Side', group: '1_view', order: 2 },
				{ id: 'diffEditor.setViewMode.automatic', title: 'Automatic (Currently Side by Side)', group: '1_view', order: 3 },
				{ id: 'diffEditor.setViewMode.automatic', title: 'Automatic (Currently Inline)', group: '1_view', order: 3 },
				{ id: 'diffEditor.viewMode.inlineTemporary', title: 'Inline (Temporary)', group: '1_view', order: 4 },
			],
			selectedMode: 'sideBySide',
		});
	});

	test('preferred diff view is contributed to the command palette (Changes category)', () => {
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
			hasMultiDiffEditorGate: when.includes(MultiDiffEditor.ID),
		}, {
			id: 'toggle.diff.renderSideBySide',
			title: 'Toggle Preferred Diff View',
			category: 'Changes',
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasTextCompareEditorGate: true,
			hasMultiDiffEditorGate: true,
		});
	});

	test('multi-diff layout debug state is contributed to the command palette for the Changes editor', () => {
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.filter(isIMenuItem)
			.find(item => item.command.id === OpenMultiDiffEditorLayoutDebugAction.ID && item.when?.serialize().includes(SessionChangesEditor.ID));

		assert.ok(item, 'expected the multi-diff layout debug action in the command palette');
		const when = item.when?.serialize() ?? '';
		assert.deepStrictEqual({
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			category: item.command.category && typeof item.command.category !== 'string' ? item.command.category.value : item.command.category,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditor.ID),
			hasSinglePaneConfigGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasSharedPrecondition: !!item.command.precondition,
		}, {
			title: 'Open Multi Diff Editor Layout Debug State',
			category: 'Developer',
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneConfigGate: true,
			hasSharedPrecondition: false,
		});
	});

	function getChangesAccessibilityHelp(singlePane: boolean): string {
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() { });
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly isSinglePaneLayoutEnabled = singlePane;
		});
		const provider = new SessionsChangesAccessibilityHelp().getProvider(instantiationService);

		const content = provider.provideContent();
		provider.dispose();
		return content;
	}

	test('Changes accessibility help describes the single-pane diff action', () => {
		assert.strictEqual(getChangesAccessibilityHelp(true).includes('Use Diff View in the editor title area\'s More Actions menu'), true);
	});

	test('Changes accessibility help describes the classic diff action', () => {
		assert.strictEqual(getChangesAccessibilityHelp(false).includes('Use Diff View in the editor title area\'s More Actions menu'), true);
	});

	test('view mode toggles are moved to the editor header layout overflow for non-text single-file diffs', () => {
		const getItems = (menuId: MenuId) => MenuRegistry.getMenuItems(menuId)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.action.agentSessions.setChangesListViewMode' || item.command.id === 'workbench.action.agentSessions.setChangesTreeViewMode')
			.map(item => {
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
					hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
					hasViewModeGate: when.includes(ChangesContextKeys.ViewMode.key),
					matchesSingleFileDiffContext: item.when?.evaluate(context) ?? false,
				};
			})
			.sort((a, b) => a.id.localeCompare(b.id));

		const expectedItems = (group: string) => [{
			id: 'workbench.action.agentSessions.setChangesListViewMode',
			title: 'View as List',
			group,
			order: 20,
			icon: Codicon.listFlat.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasDiffEditorInputGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasEditorAreaVisibleGate: false,
			hasViewModeGate: true,
			matchesSingleFileDiffContext: true,
		}, {
			id: 'workbench.action.agentSessions.setChangesTreeViewMode',
			title: 'View as Tree',
			group,
			order: 20,
			icon: Codicon.listTree.id,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasDiffEditorInputGate: true,
			hasSinglePaneConfigGate: true,
			hasAuxBarVisibleGate: true,
			hasEditorAreaVisibleGate: false,
			hasViewModeGate: true,
			matchesSingleFileDiffContext: true,
		}];

		assert.deepStrictEqual({
			headerLayout: getItems(Menus.SessionsEditorHeaderLayout),
			editorTitleOverflow: getItems(Menus.SessionsEditorTitle),
		}, {
			headerLayout: expectedItems('secondary/2_viewMode'),
			editorTitleOverflow: [],
		});
	});

	test('Create Pull Request anchor is visible for created sessions but hidden for custom views', () => {
		const item = MenuRegistry.getMenuItems(Menus.TitleBarSessionMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === CHANGES_HEADER_ACTIONS_ID);
		const editorTitleItem = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === CHANGES_HEADER_ACTIONS_ID);

		assert.ok(item, 'expected the changes header actions anchor on the title bar session menu');
		const when = item.when?.serialize() ?? '';
		const context = new Context(1, null);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(IsAuxiliaryWindowContext.key, false);
		context.setValue(CustomViewVisibleContext.key, false);
		context.setValue(SinglePaneLayoutEnabledContext.key, true);
		context.setValue(SessionIsCreatedContext.key, true);
		context.setValue(SessionHasChangesContext.key, true);
		const visibleForSession = item.when?.evaluate(context) ?? false;
		context.setValue(CustomViewVisibleContext.key, true);
		assert.deepStrictEqual({
			editorTitleItem,
			group: item.group,
			order: item.order,
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasAuxiliaryWindowGate: when.includes(IsAuxiliaryWindowContext.key),
			hasSinglePaneLayoutGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasCreatedSessionGate: when.includes(SessionIsCreatedContext.key),
			hasChangesGate: when.includes(SessionHasChangesContext.key),
			visibleForSession,
			visibleForCustomView: item.when?.evaluate(context) ?? false,
		}, {
			editorTitleItem: undefined,
			group: 'navigation',
			order: 5,
			hasSessionsWindowGate: true,
			hasAuxiliaryWindowGate: true,
			hasSinglePaneLayoutGate: true,
			hasCreatedSessionGate: true,
			hasChangesGate: true,
			visibleForSession: true,
			visibleForCustomView: false,
		});
	});
});
