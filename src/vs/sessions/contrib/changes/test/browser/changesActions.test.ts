/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub, restore } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID, AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID, AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { bindChangesetOperations, ChangesHeaderChangesetOperationsActionContribution } from '../../browser/changesActions.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../common/changesViewService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';

suite('Changes Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => restore());

	test('Open File targets the workspace resource for a snapshot-backed diff', async () => {
		const workspaceResource = URI.file('/workspace/file.ts');
		const modifiedSnapshot = URI.parse('readonly-content:/after/file.ts');
		const opened: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesObs = constObservable([{
				uri: workspaceResource,
				originalUri: URI.parse('readonly-content:/before/file.ts'),
				modifiedUri: modifiedSnapshot,
				insertions: 1,
				deletions: 1,
			}]);
		});
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ sessionId: 'active', resource: URI.parse('agent-host:active') }));
			override readonly mainWindowActiveSession = this.activeSession;
			override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const input = args[0] as { readonly resource: URI };
				opened.push(input.resource.toString());
				return undefined;
			}
		});

		await instantiationService.invokeFunction(accessor =>
			CommandsRegistry.getCommand('workbench.agentSessions.changes.openFile')!.handler(accessor, modifiedSnapshot));

		assert.deepStrictEqual(opened, [workspaceResource.toString()]);
	});

	test('only the tab-level Commit action renders its icon and label through the Changes editor', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const actionViewItemService = new NullActionViewItemService();
		const register = spy(actionViewItemService, 'register');
		disposables.add(new ChangesHeaderChangesetOperationsActionContribution(actionViewItemService));

		const commandId = 'workbench.contrib.sessions.changesHeaderChangesetOperation.commit';
		assert.deepStrictEqual(register.getCalls().map(call => [call.args[0], call.args[1]]), [
			[Menus.SessionsEditorTitle, commandId],
		]);
		const factory = register.firstCall.args[2];
		stub(actionViewItemService, 'lookUp').callsFake((menu, id) => menu === Menus.SessionsEditorTitle && id === commandId ? factory : undefined);
		instantiationService.stub(IActionViewItemService, actionViewItemService);
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() { }());
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
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
			actionViewItemProvider: (action, options) => editor.getActionViewItem(action, options)
				?? createActionViewItem(instantiationService, action, options),
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

	test('resource operations are limited to Changes resources and remain visible but disabled while unavailable or running', async () => {
		const operation = {
			id: 'discard-changes',
			label: 'Discard Changes',
			scopes: [SessionChangesetOperationScope.Resource],
			status: SessionChangesetOperationStatus.Idle,
		} satisfies ISessionChangesetOperation;
		const operations = observableValue<readonly ISessionChangesetOperation[]>('test.operations', [operation]);
		const resource = URI.file('/workspace/changed.ts');
		const invokedResources: string[] = [];
		const changeset = upcastPartial<ISessionChangeset>({
			operations,
			invokeOperation: async (_operationId, target) => {
				if (target?.kind === 'resource') {
					invokedResources.push(target.resource.toString());
				}
			},
		});
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesObs = constObservable([{
				uri: resource,
				modifiedUri: resource,
				insertions: 1,
				deletions: 0,
			}]);
			override readonly activeSessionChangesetObs = constObservable(changeset);
			override readonly activeSessionChangesetOperationsObs = operations;
		}();
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, changesViewService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { override readonly mainWindowActiveSession = constObservable(undefined); }());
		// The main window's context, bound for its session.
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(bindChangesetOperations({ session: constObservable(undefined), changes: { changesetObs: constObservable(changeset), changesetOperationsObs: operations } }, contextKeyService));

		const commandId = 'workbench.contrib.sessions.changesetOperation.discard-changes';
		const getAction = (menuId: MenuId) => MenuRegistry.getMenuItems(menuId)
			.filter(isIMenuItem)
			.find(item => item.command.id === commandId);
		const states = [SessionChangesetOperationStatus.Idle, SessionChangesetOperationStatus.Disabled, SessionChangesetOperationStatus.Running].map(status => {
			operations.set([{ ...operation, status }], undefined);
			const action = getAction(MenuId.AgentsChangeInlineToolbar);
			return {
				shown: !!action && contextKeyService.contextMatchesRules(action.when),
				enabled: !!action && contextKeyService.contextMatchesRules(action.command.precondition),
			};
		});
		operations.set([operation], undefined);
		const multiDiffAction = getAction(MenuId.MultiDiffEditorFileToolbar)!;
		const editorContextKeyService = disposables.add(contextKeyService.createScoped(document.createElement('div')));
		const resourceScheme = editorContextKeyService.createKey<string>('resourceScheme', 'changes-multi-diff-source');
		const visibleForChanges = editorContextKeyService.contextMatchesRules(multiDiffAction.when);
		resourceScheme.set('file');
		const visibleForOtherEditors = editorContextKeyService.contextMatchesRules(multiDiffAction.when);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(commandId)!.handler, URI.file('/workspace/unrelated.ts'));
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(commandId)!.handler, resource);

		assert.deepStrictEqual({
			states,
			visibleForChanges,
			visibleForOtherEditors,
			invokedResources,
		}, {
			states: [
				{ shown: true, enabled: true },
				{ shown: true, enabled: false },
				{ shown: true, enabled: false },
			],
			visibleForChanges: true,
			visibleForOtherEditors: false,
			invokedResources: [resource.toString()],
		});
	});

	test('the Changes editor of every window shows and runs the Commit of the session it shows, as one action that each window shows for its own session', async () => {
		const invoked: string[] = [];
		const operations = constObservable<readonly ISessionChangesetOperation[]>([{
			id: AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID,
			label: 'Commit',
			scopes: [SessionChangesetOperationScope.Changeset],
			status: SessionChangesetOperationStatus.Idle,
		}]);
		const scopeOf = (name: string): IChangesSessionScope => {
			const changeset = upcastPartial<ISessionChangeset>({
				id: `changeset-${name}`,
				label: name,
				isEnabled: constObservable(true),
				operations,
				invokeOperation: async operationId => { invoked.push(`${name}:${operationId}`); },
			});
			return upcastPartial<IChangesSessionScope>({
				session: constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ resource: URI.parse(`test-session:${name}`), status: constObservable(SessionStatus.Completed) })),
				changes: upcastPartial<IChangesSessionObservables>({ changesetObs: constObservable<ISessionChangeset | undefined>(changeset), changesetOperationsObs: operations }),
			});
		};
		// The main window binds the keys of its session on its context, a chat window those of its own on its scoped one.
		const mainContextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const windowContextKeyService = disposables.add(mainContextKeyService.createScoped(document.createElement('div')));
		const scopes = { main: scopeOf('main'), window: scopeOf('window') };
		disposables.add(bindChangesetOperations(scopes.main, mainContextKeyService));
		disposables.add(bindChangesetOperations(scopes.window, windowContextKeyService));
		// The Changes editor of each window, in group 1 of the main window and group 2 of the chat window.
		const editorOf = (scope: IChangesSessionScope) => Object.defineProperty(Object.create(SessionChangesEditor.prototype), 'changesScope', { value: scope }) as SessionChangesEditor;
		const editors = new Map([[1, editorOf(scopes.main)], [2, editorOf(scopes.window)]]);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroup(id: number) { return upcastPartial<IEditorGroup>({ activeEditorPane: upcastPartial<IVisibleEditorPane>(editors.get(id)!) }); }
		}());

		const shown = (contextKeyService: IContextKeyService) => {
			const editorContextKeyService = disposables.add(contextKeyService.createScoped(document.createElement('div')));
			ActiveEditorContext.bindTo(editorContextKeyService).set(SessionChangesEditor.ID);
			return MenuRegistry.getMenuItems(Menus.SessionsEditorTitle).filter(isIMenuItem)
				.filter(item => item.command.id.startsWith('workbench.contrib.sessions.changesHeaderChangesetOperation.') && editorContextKeyService.contextMatchesRules(item.when) && editorContextKeyService.contextMatchesRules(item.command.precondition))
				.map(item => item.command.id);
		};
		const result = { main: shown(mainContextKeyService), chatWindow: shown(windowContextKeyService) };
		for (const [id, groupId] of [[result.main[0], 1], [result.chatWindow[0], 2]] as const) {
			await instantiationService.invokeFunction(CommandsRegistry.getCommand(id)!.handler, URI.parse('changes-multi-diff-source:/session'), { groupId });
		}

		const commit = `workbench.contrib.sessions.changesHeaderChangesetOperation.${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`;
		assert.deepStrictEqual({ ...result, invoked }, {
			main: [commit],
			chatWindow: [commit],
			invoked: [`main:${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`, `window:${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`],
		});
	});

	test('changesets contribute operations to the Changes tab-level toolbar for draft and existing sessions', async () => {
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
		const chat = upcastPartial<IChat>({
			changesets: constObservable([changeset]),
		});
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', upcastPartial<IActiveSession>({
			resource: URI.parse('test-session:draft'),
			status,
			workspace,
			mainChat: constObservable(chat),
			activeChat: constObservable(chat),
		}));
		const changes = { changesetObs: constObservable(changeset), changesetOperationsObs: operations };
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(bindChangesetOperations({ session: activeSession, changes }, contextKeyService));
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { override readonly mainWindowActiveSession = activeSession; }());
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionChangesetObs = changes.changesetObs;
			override readonly activeSessionChangesetOperationsObs = operations;
		}());

		const actionPrefix = 'workbench.contrib.sessions.changesHeaderChangesetOperation.';
		const commitId = `${actionPrefix}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`;
		const getActions = () => MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(actionPrefix));
		const editorContextKeyService = disposables.add(contextKeyService.createScoped(document.createElement('div')));
		const activeEditor = ActiveEditorContext.bindTo(editorContextKeyService);
		activeEditor.set(SessionChangesEditor.ID);
		const isEnabled = (id: string) => editorContextKeyService.contextMatchesRules(getActions().find(item => item.command.id === id)?.command.precondition);
		const disabledWithoutChanges = !isEnabled(commitId);
		workspace.set(upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({
					uncommittedChanges: 1,
				}),
			})],
		}), undefined);
		const actions = getActions();
		const commitAction = actions.find(item => item.command.id === commitId)!;
		const visibleForChangesTab = editorContextKeyService.contextMatchesRules(commitAction.when);
		activeEditor.set('workbench.editors.textEditor');
		const visibleForTextTab = editorContextKeyService.contextMatchesRules(commitAction.when);
		activeEditor.set(SessionChangesEditor.ID);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(commitId)!.handler);

		assert.deepStrictEqual({
			actions: actions.map(item => ({
				id: item.command.id,
				title: item.command.title,
				tooltip: item.command.tooltip,
				icon: item.command.icon,
				group: item.group,
				order: item.order,
				enabled: editorContextKeyService.contextMatchesRules(item.command.precondition),
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
				id: commitId,
				title: 'Commit',
				tooltip: 'Commit uncommitted changes',
				icon: Codicon.check,
				group: 'navigation',
				order: 0,
				enabled: true,
			}],
			invokedOperations: [AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID],
			disabledWithoutChanges: true,
			visibleForChangesTab: true,
			visibleForTextTab: false,
			resourceOperationRegistered: false,
			checkoutOperationRegistered: false,
			syncOperationRegistered: false,
		});

		const disabledStates = [SessionChangesetOperationStatus.Disabled, SessionChangesetOperationStatus.Running].map(operationStatus => {
			operations.set([{ ...operations.get()[0], status: operationStatus }], undefined);
			return isEnabled(commitId);
		});
		assert.deepStrictEqual(disabledStates, [false, false]);

		// An existing session only contributes the Commit operation of the
		// changeset selected in the Changes view.
		operations.set(operations.get().map(operation => ({ ...operation, status: SessionChangesetOperationStatus.Idle })), undefined);
		status.set(SessionStatus.Completed, undefined);
		const existingSessionActions = getActions();
		invokedOperations.length = 0;
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(commitId)!.handler);
		assert.deepStrictEqual({
			actions: existingSessionActions.map(item => ({
				id: item.command.id,
				group: item.group,
				enabled: editorContextKeyService.contextMatchesRules(item.command.precondition),
				visibleForChangesTab: editorContextKeyService.contextMatchesRules(item.when),
			})),
			invokedOperations,
		}, {
			actions: [{
				id: commitId,
				group: 'navigation',
				enabled: true,
				visibleForChangesTab: true,
			}],
			invokedOperations: [AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID],
		});

		activeSession.set(undefined, undefined);
		assert.deepStrictEqual({
			menuActions: getActions().length,
			commitCommandRegistered: CommandsRegistry.getCommand(commitId) !== undefined,
		}, {
			menuActions: 0,
			commitCommandRegistered: false,
		});
	});
});
