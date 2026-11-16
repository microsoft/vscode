/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope } from '../../../../../workbench/services/sessions/common/session.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { ChangesHeaderChangesetOperationsActionContribution } from '../../../changes/browser/changesActions.js';
import { bindSessionActionContextKeys } from '../../../../../workbench/contrib/sessionChanges/browser/sessionActionContextKeys.js';
import '../../../changes/browser/changesetReviewActions.js';
import { ChangesetReviewSupportContext } from '../../../../../workbench/contrib/sessionChanges/browser/changesViewService.js';
import { CHANGESET_REVIEW_ACTION_ID, SessionChangesEditor, SessionChangesUIElementFactory } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditor.js';
import { IGitHubService } from '../../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { bindSessionScopeContextKeys } from '../../../../../workbench/contrib/sessionChanges/browser/sessionActionsHost.js';
import { ITestSessionsService, ITestSessionWithChat, stubSessionHostsFromSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('Chat window changeset actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('every action that changesets contribute to the Changes editor is registered once, and the same command run from the Changes editor in the main part of a chat window acts on the session of that window, and from the main window on its session, whichever session is active', async () => {
		const invoked: string[] = [];
		const main = createTestActiveSession('main');
		const chat = createTestActiveSession('chat');
		const file = (session: ITestSessionWithChat) => URI.file(`/${session.sessionId}/a.txt`);
		const changesOf = (session: ITestSessionWithChat, review: boolean): IChangesSessionObservables => {
			const operations: ISessionChangesetOperation[] = [
				upcastPartial<ISessionChangesetOperation>({ id: 'commit', label: 'Commit', scopes: [SessionChangesetOperationScope.Changeset] }),
				upcastPartial<ISessionChangesetOperation>({ id: 'discard', label: 'Discard Changes', scopes: [SessionChangesetOperationScope.Resource] }),
			];
			const changeset = upcastPartial<ISessionChangeset>({
				id: 'uncommitted',
				capabilities: { review },
				operations: constObservable(operations),
				invokeOperation: async (id: string) => { invoked.push(`${session.sessionId}:${id}`); },
			});
			return upcastPartial<IChangesSessionObservables>({
				changesetObs: constObservable(changeset),
				changesetOperationsObs: constObservable(operations),
				changesObs: constObservable([{ modifiedUri: file(session), originalUri: undefined, insertions: 1, deletions: 0 }]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			});
		};
		// The main window's session has changes without review; the chat window's, with.
		const mainChanges = changesOf(main, false);
		const chatChanges = changesOf(chat, true);

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async <R>(id: string, ...args: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)) as R,
		}));
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ onDidChangeProviders: Event.None, getProvider: () => undefined }));
		instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({ register: () => Disposable.None }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditorPane: undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ mainWindowActiveSession: constObservable(main), activeSession: constObservable(main) }));
		stubSessionHostsFromSessionsService(instantiationService);
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			activeSessionChangesetObs: mainChanges.changesetObs,
			activeSessionChangesetOperationsObs: mainChanges.changesetOperationsObs,
			activeSessionChangesObs: mainChanges.changesObs,
			getSessionChanges: sessionObs => sessionObs.get() === chat ? chatChanges : mainChanges,
			setChangesetFilesReviewState: (_resources: readonly URI[], _reviewed: boolean, session?: ITestSessionWithChat) => { invoked.push(`${session?.sessionId}:review`); },
		}));

		// The context of the chat window, scoped to the global one as a window's is; its main part's groups scope theirs to it.
		const windowContextKeyService = disposables.add(contextKeyService.createScoped(document.createElement('div')));
		// The Changes editor of each window: in the chat window's main part in group 1, in the main window in group 2.
		const scopes = {
			chat: { session: constObservable(chat), chat: constObservable(chat.activeChat.get()), changes: chatChanges, isMainWindow: false },
			main: { session: constObservable(main), chat: constObservable(main.activeChat.get()), changes: mainChanges, isMainWindow: true },
		} satisfies Record<string, IChangesSessionScope>;
		const editorOf = (scope: IChangesSessionScope) => Object.defineProperty(Object.create(SessionChangesEditor.prototype), 'changesScope', { value: scope }) as SessionChangesEditor;
		const editors = new Map([[1, editorOf(scopes.chat)], [2, editorOf(scopes.main)]]);
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			getGroup: (id: number) => upcastPartial<IEditorGroup>({ activeEditorPane: upcastPartial<IVisibleEditorPane>(editors.get(id)!) }),
		}));
		// The main window's keys, bound globally for its session.
		ChangesetReviewSupportContext.bindTo(contextKeyService).set(false);

		disposables.add(instantiationService.createInstance(ChangesHeaderChangesetOperationsActionContribution));
		// The main window's session action keys, bound on the global context as the main window binds them.
		disposables.add(bindSessionActionContextKeys(instantiationService, {
			session: scopes.main.session,
			chat: scopes.main.chat,
			changes: mainChanges,
			pullRequest: instantiationService.invokeFunction(accessor => accessor.get(IGitHubService)).getSessionPullRequest(scopes.main.session),
		}, contextKeyService));
		// The keys of the chat window's session on its context, as the chat window's provider binds them.
		disposables.add(bindSessionScopeContextKeys(instantiationService, scopes.chat, windowContextKeyService));

		const menuService = disposables.add(instantiationService.createInstance(MenuService));
		const isChangesetAction = (id: string) => id.startsWith('workbench.contrib.sessions.changesHeaderChangesetOperation.') || id.startsWith('workbench.contrib.sessions.changesetOperation.') || id === CHANGESET_REVIEW_ACTION_ID;

		// Shows the Changes editor in a window and invokes every action that changesets contribute to its title and to the
		// toolbars of its files, with the arguments they get there.
		const runIn = async (windowContextKeyService: IContextKeyService, groupId: number, session: ITestSessionWithChat) => {
			const editor = editors.get(groupId)!;
			const scope = editor.changesScope;
			invoked.length = 0;
			const editorContextKeyService = disposables.add(windowContextKeyService.createScoped(document.createElement('div')));
			ActiveEditorContext.bindTo(editorContextKeyService).set(SessionChangesEditor.ID);
			editorContextKeyService.createKey('resourceScheme', 'changes-multi-diff-source');
			const factory = instantiationService.createInstance(SessionChangesUIElementFactory, constObservable([]), scope, editor);
			const shown: string[] = [];
			for (const menuId of [Menus.SessionsEditorTitle, MenuId.MultiDiffEditorFileToolbar]) {
				const menu = menuService.createMenu(menuId, editorContextKeyService);
				const actions = menu.getActions({ shouldForwardArgs: true }).flatMap(([, group]) => group).flatMap((action): readonly IAction[] => action instanceof SubmenuItemAction ? action.actions : [action]);
				for (const action of actions.filter(action => action instanceof MenuItemAction && isChangesetAction(action.id))) {
					shown.push(action.id);
					if (menuId === Menus.SessionsEditorTitle) {
						await action.run(URI.parse('changes-multi-diff-source:/session'), { groupId });
					} else {
						const item = factory.createToolbarActionViewItem(action, {});
						await (item?.action ?? action).run(file(session));
						item?.dispose();
					}
				}
				menu.dispose();
			}
			return { shown: shown.sort(), invoked: [...invoked].sort() };
		};

		const result = {
			chatWindow: await runIn(windowContextKeyService, 1, chat),
			mainWindow: await runIn(contextKeyService, 2, main),
		};

		assert.deepStrictEqual(result, {
			chatWindow: {
				shown: [CHANGESET_REVIEW_ACTION_ID, 'workbench.contrib.sessions.changesHeaderChangesetOperation.commit', 'workbench.contrib.sessions.changesetOperation.discard'],
				invoked: ['chat:commit', 'chat:discard', 'chat:review'],
			},
			mainWindow: {
				shown: ['workbench.contrib.sessions.changesHeaderChangesetOperation.commit', 'workbench.contrib.sessions.changesetOperation.discard'],
				invoked: ['main:commit', 'main:discard'],
			},
		});
	});
});
