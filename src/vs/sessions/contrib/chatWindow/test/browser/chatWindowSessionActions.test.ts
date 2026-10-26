/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatWindowSessionHasWorkspaceContext, getChatWindowSession, IChatWindow, IChatWindowService, SessionTitleBarActionsShownContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { bindChatWindowTitleBarContext } from '../../browser/chatWindowService.js';
import { IsQuickChatSessionContext, SessionWorkspaceIsVirtualContext } from '../../../../common/contextkeys.js';

suite('Chat window session actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function shown(isAuxiliaryWindow: boolean, sessionHasWorkspace: boolean): boolean {
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		IsAuxiliaryWindowContext.bindTo(contextKeyService).set(isAuxiliaryWindow);
		ChatWindowSessionHasWorkspaceContext.bindTo(contextKeyService).set(sessionHasWorkspace);
		return contextKeyService.contextMatchesRules(SessionTitleBarActionsShownContext);
	}

	test('the session commands of the title bar show in the main window, and in a chat window that shows a session with a workspace only', () => {
		assert.deepStrictEqual({
			mainWindow: shown(false, false),
			chatWindowWithSession: shown(true, true),
			chatWindowWithoutWorkspaceSuchAsAQuickChat: shown(true, false),
		}, {
			mainWindow: true,
			chatWindowWithSession: true,
			chatWindowWithoutWorkspaceSuchAsAQuickChat: false,
		});
	});

	test('they act on the session of the chat window of their window, and in the main window or a docked window on the active session', () => {
		const own = observableValue<IActiveSession | undefined>('own', undefined);
		const docked = constObservable<IActiveSession | undefined>(undefined);
		const windows = [
			{ docked: false, windowId: 2, session: own },
			{ docked: true, windowId: 1, session: docked },
		] as unknown as readonly IChatWindow[];
		const service = { windows: constObservable(windows) } as unknown as IChatWindowService;

		assert.deepStrictEqual({
			chatWindow: getChatWindowSession(service, 2) === own,
			mainWindow: getChatWindowSession(service, 1),
			unknown: getChatWindowSession(service, 5),
		}, {
			chatWindow: true,
			mainWindow: undefined,
			unknown: undefined,
		});
	});

	test('the keys of the title bar change with the workspace of the session only, not with its chats or their stats', () => {
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const workspace = observableValue<{ isVirtualWorkspace: boolean } | undefined>('workspace', { isVirtualWorkspace: false });
		const chatStats = observableValue('chatStats', 0);
		const chat = { workspace };
		const session = observableValue<IActiveSession | undefined>('session', {
			isQuickChat: constObservable(false),
			workspace: constObservable({}),
			activeChat: derived(reader => { chatStats.read(reader); return chat; }),
		} as unknown as IActiveSession);
		store.add(bindChatWindowTitleBarContext(session, contextKeyService));

		const changes: string[] = [];
		store.add(contextKeyService.onDidChangeContext(e => {
			for (const key of [ChatWindowSessionHasWorkspaceContext.key, SessionWorkspaceIsVirtualContext.key, IsQuickChatSessionContext.key]) {
				if (e.affectsSome(new Set([key]))) {
					changes.push(key);
				}
			}
		}));
		const read = () => ({ hasWorkspace: ChatWindowSessionHasWorkspaceContext.getValue(contextKeyService), isVirtual: SessionWorkspaceIsVirtualContext.getValue(contextKeyService) });

		const initial = read();
		chatStats.set(1, undefined);
		chatStats.set(2, undefined);
		const afterStats = { values: read(), changes: [...changes] };
		workspace.set({ isVirtualWorkspace: true }, undefined);

		assert.deepStrictEqual({ initial, afterStats, afterVirtual: read(), changes }, {
			initial: { hasWorkspace: true, isVirtual: false },
			afterStats: { values: { hasWorkspace: true, isVirtual: false }, changes: [] },
			afterVirtual: { hasWorkspace: true, isVirtual: true },
			changes: [SessionWorkspaceIsVirtualContext.key],
		});
	});
});
