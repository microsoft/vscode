/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
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
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { ChatWindowContext, ChatWindowHasEditorAreaContext, ChatWindowIdContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { ChangesetOperationsActionControllerContribution, ChangesHeaderChangesetOperationsActionContribution } from '../../../changes/browser/changesActions.js';
import '../../../changes/browser/changesetReviewActions.js';
import { ChangesetReviewSupportContext } from '../../../changes/browser/changesViewService.js';
import { CHANGESET_REVIEW_ACTION_ID, SessionChangesEditor, SessionChangesUIElementFactory } from '../../../changes/browser/sessionChangesEditor.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../../changes/common/changesViewService.js';
import { ChatWindowChangesetActionsContribution } from '../../browser/chatWindowEditorArea.js';

suite('Chat window changeset actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('every action that changesets contribute to the Changes editor shows and acts in a chat window for the session of the window, and in the main window for its session, whichever session is active', async () => {
		const invoked: string[] = [];
		const main = createTestActiveSession('main');
		const chat = createTestActiveSession('chat');
		const file = (session: IActiveSession) => URI.file(`/${session.sessionId}/a.txt`);
		const changesOf = (session: IActiveSession, review: boolean): IChangesSessionObservables => {
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
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({ register: () => Disposable.None }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditorPane: undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ mainWindowActiveSession: constObservable(main), activeSession: constObservable(main) }));
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			activeSessionChangesetObs: mainChanges.changesetObs,
			activeSessionChangesetOperationsObs: mainChanges.changesetOperationsObs,
			activeSessionChangesObs: mainChanges.changesObs,
			getSessionChanges: sessionObs => sessionObs.get() === chat ? chatChanges : mainChanges,
			setChangesetFilesReviewState: (_resources: readonly URI[], _reviewed: boolean, session?: IActiveSession) => { invoked.push(`${session?.sessionId}:review`); },
		}));

		// The editor area of the chat window, whose context key service is scoped to the global one as an editor part's is.
		const editorAreaContextKeyService = disposables.add(contextKeyService.createScoped(document.createElement('div')));
		ChatWindowContext.bindTo(editorAreaContextKeyService).set('chat');
		ChatWindowIdContext.bindTo(editorAreaContextKeyService).set(7);
		ChatWindowHasEditorAreaContext.bindTo(editorAreaContextKeyService).set(true);
		const editorArea = upcastPartial<IEditorPart>({});
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			getScopedInstantiationService: () => instantiationService.createChild(new ServiceCollection([IContextKeyService, editorAreaContextKeyService])),
		}));
		instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
			windows: constObservable([upcastPartial<IChatWindow>({ windowId: 7, session: constObservable(chat), editorArea })]),
		}));
		// The main window's keys, bound globally for its session.
		ChangesetReviewSupportContext.bindTo(contextKeyService).set(false);

		disposables.add(instantiationService.createInstance(ChangesHeaderChangesetOperationsActionContribution));
		disposables.add(instantiationService.createInstance(ChangesetOperationsActionControllerContribution));
		disposables.add(instantiationService.createInstance(ChatWindowChangesetActionsContribution));

		const menuService = disposables.add(instantiationService.createInstance(MenuService));
		const editor = Object.create(SessionChangesEditor.prototype) as SessionChangesEditor;
		const isChangesetAction = (id: string) => id.startsWith('workbench.contrib.sessions.changesHeaderChangesetOperation.') || id.startsWith('workbench.contrib.sessions.changesetOperation.') || id === CHANGESET_REVIEW_ACTION_ID;

		// Shows the Changes editor in a window and invokes every action that changesets contribute to its title and to the
		// toolbars of its files, with the arguments they get there.
		const runIn = async (windowContextKeyService: IContextKeyService, scope: IChangesSessionScope, session: IActiveSession) => {
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
						await action.run(URI.parse('changes-multi-diff-source:/session'), { groupId: 1 });
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
			chatWindow: await runIn(editorAreaContextKeyService, { session: constObservable(chat), changes: chatChanges }, chat),
			mainWindow: await runIn(contextKeyService, { session: instantiationService.invokeFunction(accessor => accessor.get(ISessionsService).mainWindowActiveSession), changes: mainChanges }, main),
		};

		assert.deepStrictEqual(result, {
			chatWindow: {
				shown: [CHANGESET_REVIEW_ACTION_ID, 'workbench.contrib.sessions.changesHeaderChangesetOperation.commit.chatWindow7', 'workbench.contrib.sessions.changesetOperation.discard.chatWindow7'],
				invoked: ['chat:commit', 'chat:discard', 'chat:review'],
			},
			mainWindow: {
				shown: ['workbench.contrib.sessions.changesHeaderChangesetOperation.commit', 'workbench.contrib.sessions.changesetOperation.discard'],
				invoked: ['main:commit', 'main:discard'],
			},
		});
	});
});
