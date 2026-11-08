/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { NullCommandService } from '../../../../../../platform/commands/test/common/nullCommandService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SessionUsesExperimentalComposerLayoutContext } from '../../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { bindSessionHostScopeContext, createMainWindowInstantiationService, createSessionHostServices, InSessionHostScopeContext, ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../../../workbench/services/sessions/browser/sessionHost.js';
import '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostAgentPicker.js';
import '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostSessionConfigPicker.js';

/** The pickers of the session a chat input shows, contributed to the workbench's chat input menus. */
const PICKERS = new Set([
	'sessions.agentHost.agentPicker',
	'sessions.agentHost.runningSessionModePicker',
	'sessions.agentHost.runningSessionConfigPicker',
	'sessions.agentHost.runningSessionPermissionModePicker',
	'sessions.agentHost.runningSessionCodexApprovalsPicker',
]);

suite('Agent Host chat input pickers: session host scopes', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let store: DisposableStore;
	setup(() => store = disposables.add(new DisposableStore()));

	function hostOf(kind: SessionHostKind, contextKeyService: IContextKeyService, parent?: ISessionHost): ISessionHost {
		return new SessionHost({ kind, parent, session: constObservable(undefined), chat: constObservable(undefined), contextKeyService, windowId: kind === SessionHostKind.MainWindow ? constObservable(mainWindow.vscodeWindowId) : undefined });
	}

	function hasHost(instantiationService: IInstantiationService): boolean {
		try {
			return !!instantiationService.invokeFunction(accessor => accessor.get(ISessionHost));
		} catch {
			return false;
		}
	}

	function setUpScopes() {
		const root = store.add(new ContextKeyService(new TestConfigurationService()));
		// Everything else the pickers need holds: only the scope tells them apart.
		ChatContextKeys.chatIsAgentHostSession.bindTo(root).set(true);
		IsSessionsWindowContext.bindTo(root).set(true);
		const gridHost = hostOf(SessionHostKind.MainWindow, root);
		const sessionHostService = upcastPartial<ISessionHostService>({ getHostOfWindow: windowId => windowId === mainWindow.vscodeWindowId ? gridHost : undefined });
		// Strict, as the Agents window's root.
		const rootInstantiationService = store.add(new InstantiationService(new ServiceCollection([IContextKeyService, root], [ISessionHostService, sessionHostService]), true));
		const mainWindowInstantiationService = store.add(createMainWindowInstantiationService(rootInstantiationService));
		const scoped = (contextKeyService: IContextKeyService) => store.add(contextKeyService.createScoped(document.createElement('div')));

		// Quick Chat: a chat widget the workbench creates at the root.
		const quickChat = rootInstantiationService;
		// The inbox's detail chat: a scope of the inbox view, in the main window's parts, with a context of its own.
		const inboxDetailChat = store.add(mainWindowInstantiationService.createChild(new ServiceCollection([IContextKeyService, scoped(root)])));
		// A pane of the grid.
		const paneContext = scoped(root);
		const pane = store.add(mainWindowInstantiationService.createChild(createSessionHostServices(paneContext, hostOf(SessionHostKind.Pane, paneContext, gridHost))));
		// A chat window: its provider provides its host, the window its context.
		const chatWindowContext = scoped(root);
		const chatWindow = store.add(rootInstantiationService.createChild(new ServiceCollection([ISessionHost, hostOf(SessionHostKind.ChatWindow, chatWindowContext)], [IContextKeyService, chatWindowContext])));
		bindSessionHostScopeContext(chatWindow);

		return { root, rootInstantiationService, scopes: { quickChat, inboxDetailChat, pane, chatWindow }, scoped };
	}

	test('the pickers show in the chat inputs of session host scopes only: not in Quick Chat\'s nor in the inbox\'s detail chat', () => {
		const { scopes, scoped } = setUpScopes();
		const menuService = store.add(new MenuService(NullCommandService, new MockKeybindingService(), store.add(new InMemoryStorageService())));
		// What the toolbars of a chat input render, in and out of their overflow: the actions of their menus in its context.
		const pickersOf = (instantiationService: IInstantiationService) => {
			const widgetContext = scoped(instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService)));
			const layout = SessionUsesExperimentalComposerLayoutContext.bindTo(widgetContext);
			const pickers = (menuId: MenuId, experimentalLayout: boolean) => {
				layout.set(experimentalLayout);
				const menu = store.add(menuService.createMenu(menuId, widgetContext));
				return menu.getActions().flatMap(([, actions]) => actions).map(action => action.id).filter(id => PICKERS.has(id)).sort();
			};
			return { input: pickers(MenuId.ChatInput, true), secondary: pickers(MenuId.ChatInputSecondary, false) };
		};
		const allInput = [...PICKERS].sort();
		const allSecondary = [...PICKERS].filter(id => id !== 'sessions.agentHost.agentPicker').sort();

		assert.deepStrictEqual({
			quickChat: pickersOf(scopes.quickChat),
			inboxDetailChat: pickersOf(scopes.inboxDetailChat),
			pane: pickersOf(scopes.pane),
			chatWindow: pickersOf(scopes.chatWindow),
		}, {
			quickChat: { input: [], secondary: [] },
			inboxDetailChat: { input: [], secondary: [] },
			pane: { input: allInput, secondary: allSecondary },
			chatWindow: { input: allInput, secondary: allSecondary },
		});
	});

	test('a context is that of a session host scope only where its scope provides a session host', () => {
		const { root, rootInstantiationService, scopes } = setUpScopes();
		const inScope = (instantiationService: IInstantiationService) => ({
			key: instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService)).contextMatchesRules(InSessionHostScopeContext),
			host: hasHost(instantiationService),
		});
		// A scope without a host cannot claim to be one.
		const bindOutsideHosts = () => bindSessionHostScopeContext(rootInstantiationService);

		assert.throws(bindOutsideHosts);
		assert.deepStrictEqual({
			quickChat: inScope(scopes.quickChat),
			inboxDetailChat: inScope(scopes.inboxDetailChat),
			pane: inScope(scopes.pane),
			chatWindow: inScope(scopes.chatWindow),
			rootAfterRejectedBind: root.contextMatchesRules(InSessionHostScopeContext),
		}, {
			quickChat: { key: false, host: false },
			// The main window's parts inject its host, but their contexts are not those of a session host scope.
			inboxDetailChat: { key: false, host: true },
			pane: { key: true, host: true },
			chatWindow: { key: true, host: true },
			rootAfterRejectedBind: false,
		});
	});
});
