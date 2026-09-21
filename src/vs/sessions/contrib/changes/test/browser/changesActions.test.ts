/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, restore } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { isIMenuItem, MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID, AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID, AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { NewSessionUncommittedChangesetOperationsActionContribution } from '../../browser/changesActions.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';

suite('Changes Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => restore());

	test('only the draft Changes header Commit action renders its icon and label', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const actionViewItemService = new NullActionViewItemService();
		const register = spy(actionViewItemService, 'register');
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		}();
		disposables.add(new NewSessionUncommittedChangesetOperationsActionContribution(sessionsService, actionViewItemService));

		const commandId = 'workbench.contrib.sessions.newSessionUncommittedChangesetOperation.commit';
		assert.deepStrictEqual(register.getCalls().map(call => [call.args[0], call.args[1]]), [
			[Menus.SessionsEditorHeaderLayout, commandId],
		]);
		const factory = register.firstCall.args[2];
		const invokedCommands: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T | undefined> {
				invokedCommands.push(id);
				return undefined;
			}
		}());

		const commit = instantiationService.createInstance(MenuItemAction, {
			id: commandId, title: 'Commit', tooltip: 'Commit uncommitted changes', icon: Codicon.check,
		}, undefined, undefined, undefined, undefined);
		const other = instantiationService.createInstance(MenuItemAction, {
			id: 'other', title: 'Other Action', icon: Codicon.gear,
		}, undefined, undefined, undefined, undefined);
		const disabledCommit = instantiationService.createInstance(MenuItemAction, {
			id: commandId, title: 'Commit', icon: Codicon.check, precondition: ContextKeyExpr.false(),
		}, undefined, undefined, undefined, undefined);
		const container = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => container.remove()));
		const actionBar = disposables.add(new ActionBar(container, {
			actionViewItemProvider: (action, options) => action.id === commandId
				? factory(action, options, instantiationService, dom.getWindow(container).vscodeWindowId)
				: createActionViewItem(instantiationService, action, options),
		}));
		actionBar.push([commit, other, disabledCommit]);

		const commitLabel = container.querySelector<HTMLElement>('.changes-commit-action .action-label')!;
		const otherLabel = container.querySelector<HTMLElement>('.action-item:not(.changes-commit-action) .action-label')!;
		const disabledLabel = container.querySelector<HTMLElement>('.changes-commit-action.disabled .action-label')!;
		actionBar.focus(0);
		const commitFocused = document.activeElement === commitLabel;
		const didRun = Event.toPromise(actionBar.onDidRun);
		commitLabel.click();
		disabledLabel.click();
		await didRun;
		actionBar.focus(1);

		assert.deepStrictEqual({
			commit: {
				text: commitLabel.textContent,
				icon: !!commitLabel.querySelector('.codicon-check'),
				iconAriaHidden: commitLabel.querySelector('.codicon-check')?.getAttribute('aria-hidden'),
				role: commitLabel.getAttribute('role'),
				ariaLabel: commitLabel.getAttribute('aria-label'),
				focused: commitFocused,
			},
			other: {
				text: otherLabel.textContent,
				icon: otherLabel.classList.contains('codicon-gear'),
				focused: document.activeElement === otherLabel,
			},
			disabled: {
				text: disabledLabel.textContent,
				ariaDisabled: disabledLabel.getAttribute('aria-disabled'),
			},
			invokedCommands,
		}, {
			commit: {
				text: 'Commit',
				icon: true,
				iconAriaHidden: 'true',
				role: 'button',
				ariaLabel: 'Commit uncommitted changes',
				focused: true,
			},
			other: { text: '', icon: true, focused: true },
			disabled: { text: 'Commit', ariaDisabled: 'true' },
			invokedCommands: [commandId],
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
			id: AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID,
			label: 'Checkout',
			scopes: [SessionChangesetOperationScope.Changeset],
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
		disposables.add(new NewSessionUncommittedChangesetOperationsActionContribution(sessionsService, new NullActionViewItemService()));

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
			checkoutOperationRegistered: CommandsRegistry.getCommand(`${actionPrefix}${AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID}`) !== undefined,
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
			checkoutOperationRegistered: false,
			syncOperationRegistered: false,
		});

		const disabledStates = [SessionChangesetOperationStatus.Disabled, SessionChangesetOperationStatus.Running].map(operationStatus => {
			operations.set([{ ...operations.get()[0], status: operationStatus }], undefined);
			return getActions().find(item => item.command.id === `${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`)!.command.precondition?.serialize();
		});
		assert.deepStrictEqual(disabledStates, ['false', 'false']);

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
