/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID, AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasCachedChangesContext, SessionHasChangesContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../common/changes.js';
import { NewSessionUncommittedChangesetOperationsActionContribution } from '../../browser/changesActions.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';

suite('Changes Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('changes pill stays out of the pill row for a session without a workspace folder', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionHeaderMeta)
			.filter(isIMenuItem)
			.find(item => item.command.id === VIEW_SESSION_CHANGES_COMMAND_ID);

		assert.ok(item, 'expected the changes pill on the session metadata menu');
		const evaluate = (state: { changes?: boolean; cachedChanges?: boolean; workspace?: boolean }) => {
			const context = new Context(1, null);
			context.setValue(SessionHasChangesContext.key, state.changes ?? false);
			context.setValue(SessionHasCachedChangesContext.key, state.cachedChanges ?? false);
			context.setValue(SessionHasWorkspaceContext.key, state.workspace ?? false);
			return item.when?.evaluate(context) ?? false;
		};

		assert.deepStrictEqual({
			folderlessChatWithChanges: evaluate({ changes: true }),
			folderlessChatWithCachedChanges: evaluate({ cachedChanges: true }),
			workspaceSessionWithChanges: evaluate({ changes: true, workspace: true }),
			workspaceSessionWithCachedChanges: evaluate({ cachedChanges: true, workspace: true }),
			workspaceSessionWithoutChanges: evaluate({ workspace: true }),
		}, {
			folderlessChatWithChanges: false,
			folderlessChatWithCachedChanges: false,
			workspaceSessionWithChanges: true,
			workspaceSessionWithCachedChanges: true,
			workspaceSessionWithoutChanges: false,
		});
	});

	test('draft session contributes uncommitted changeset operations to the editor header', async () => {
		const invokedOperations: string[] = [];
		const operations = observableValue<readonly ISessionChangesetOperation[]>('test.operations', [{
			id: AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID,
			label: 'Commit',
			description: 'Commit uncommitted changes',
			icon: Codicon.check,
			scopes: [SessionChangesetOperationScope.Changeset],
			status: SessionChangesetOperationStatus.Idle,
		}, {
			id: 'discard-file',
			label: 'Discard File',
			scopes: [SessionChangesetOperationScope.Resource],
			status: SessionChangesetOperationStatus.Idle,
		}, {
			id: AGENT_HOST_SYNC_CHANGESET_OPERATION_ID,
			label: 'Sync Changes',
			scopes: [SessionChangesetOperationScope.Changeset],
			status: SessionChangesetOperationStatus.Disabled,
		}]);
		const changeset = upcastPartial<ISessionChangeset>({
			id: UNCOMMITTED_CHANGES_CHANGESET_ID,
			label: 'Uncommitted Changes',
			isEnabled: constObservable(true),
			operations,
			invokeOperation: async operationId => {
				invokedOperations.push(operationId);
			},
		});
		const status = observableValue('test.status', SessionStatus.Untitled);
		const workspace = observableValue<ISessionWorkspace | undefined>('test.workspace', upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({
					uncommittedChanges: 0,
				}),
			})],
		}));
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', upcastPartial<IActiveSession>({
			resource: URI.parse('test-session:draft'),
			status,
			workspace,
			changesets: constObservable([changeset]),
		}));
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		}();
		disposables.add(new NewSessionUncommittedChangesetOperationsActionContribution(sessionsService));

		const actionPrefix = 'workbench.contrib.sessions.newSessionUncommittedChangesetOperation.';
		const getActions = () => MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(actionPrefix));
		const disabledActions = getActions();
		const disabledCommitAction = disabledActions.find(item => item.command.id === `${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`)!;
		const disabledWithoutChanges = disabledCommitAction.command.precondition?.serialize();
		workspace.set(upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({
					uncommittedChanges: 1,
				}),
			})],
		}), undefined);
		const actions = getActions();
		const commitAction = actions.find(item => item.command.id === `${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`)!;
		const context = new Context(1, null);
		context.setValue(ActiveEditorContext.key, SessionChangesEditor.ID);
		const visibleForChangesTab = commitAction.when?.evaluate(context) ?? true;
		context.setValue(ActiveEditorContext.key, 'workbench.editors.textEditor');
		const visibleForTextTab = commitAction.when?.evaluate(context) ?? true;
		const instantiationService = disposables.add(new TestInstantiationService());
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(`${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`)!.handler);

		assert.deepStrictEqual({
			actions: actions.map(item => ({
				id: item.command.id,
				title: item.command.title,
				tooltip: item.command.tooltip,
				icon: item.command.icon,
				group: item.group,
				order: item.order,
				precondition: item.command.precondition?.serialize(),
			})),
			invokedOperations,
			disabledWithoutChanges,
			visibleForChangesTab,
			visibleForTextTab,
			resourceOperationRegistered: CommandsRegistry.getCommand(`${actionPrefix}discard-file`) !== undefined,
			syncOperationRegistered: CommandsRegistry.getCommand(`${actionPrefix}${AGENT_HOST_SYNC_CHANGESET_OPERATION_ID}`) !== undefined,
		}, {
			actions: [{
				id: `${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`,
				title: 'Commit',
				tooltip: 'Commit uncommitted changes',
				icon: Codicon.check,
				group: 'navigation',
				order: 0,
				precondition: undefined,
			}],
			invokedOperations: [AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID],
			disabledWithoutChanges: 'false',
			visibleForChangesTab: true,
			visibleForTextTab: false,
			resourceOperationRegistered: false,
			syncOperationRegistered: false,
		});

		status.set(SessionStatus.Completed, undefined);
		assert.deepStrictEqual({
			menuActions: getActions().length,
			commitCommandRegistered: CommandsRegistry.getCommand(`${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`) !== undefined,
		}, {
			menuActions: 0,
			commitCommandRegistered: false,
		});
	});
});
