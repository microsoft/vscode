/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IOpenSessionOptions, ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISession } from '../../../../../workbench/contrib/sessions/common/session.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';
import { ISessionHost, SessionHostKind } from '../../../../../workbench/contrib/sessions/browser/sessionHost.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

suite('SessionsTitleBarWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const getCommandCenterTitle = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitle') as (this: SessionsTitleBarWidget) => string | undefined;
	const renderActiveSession = Reflect.get(SessionsTitleBarWidget.prototype, '_renderActiveSession') as (this: SessionsTitleBarWidget) => void;
	const openBlockedSession = Reflect.get(SessionsTitleBarWidget.prototype, '_openBlockedSession') as (this: SessionsTitleBarWidget, resource: URI, preserveFocus: boolean, sideBySide: boolean) => void;

	test('Alt-clicking a blocked session requests its main chat to the side', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		const resource = URI.parse('test:///blocked');
		const session = upcastPartial<ISession>({ sessionId: 'blocked', resource });
		const options: IOpenSessionOptions[] = [];
		Reflect.set(widget, 'sessionsManagementService', upcastPartial<ISessionsManagementService>({
			getSession: () => session,
		}));
		Reflect.set(widget, 'sessionsService', upcastPartial<ISessionsService>({
			openSessionToSide: async (_session, openOptions) => {
				if (openOptions) {
					options.push(openOptions);
				}
			},
		}));

		openBlockedSession.call(widget, resource, true, true);

		assert.deepStrictEqual(options, [{ preserveFocus: true, source: 'sessionsList', forceMainChat: true }]);
	});

	test('in a chat window, a blocked session opens in that window, not in the main window', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		const resource = URI.parse('test:/blocked');
		const session = upcastPartial<ISession>({ sessionId: 'blocked', resource });
		const chatWindow = upcastPartial<IChatWindow>({ windowId: 7 });
		const opened: string[] = [];
		Reflect.set(widget, '_windowHost', upcastPartial<ISessionHost>({ kind: SessionHostKind.ChatWindow, parent: undefined, windowId: constObservable(7) }));
		Reflect.set(widget, 'chatWindowService', upcastPartial<IChatWindowService>({ getWindow: windowId => windowId === 7 ? chatWindow : undefined }));
		Reflect.set(widget, 'sessionsManagementService', upcastPartial<ISessionsManagementService>({ getSession: () => session }));
		Reflect.set(widget, 'sessionsService', upcastPartial<ISessionsService>({
			openSession: async () => { opened.push('main window'); },
			openSessionToSide: async () => { opened.push('main window to the side'); },
		}));
		Reflect.set(widget, 'instantiationService', upcastPartial<IInstantiationService>({
			invokeFunction: (() => { opened.push('chat window'); return Promise.resolve(); }) as IInstantiationService['invokeFunction'],
		}));

		openBlockedSession.call(widget, resource, false, false);
		openBlockedSession.call(widget, resource, true, true);

		assert.deepStrictEqual(opened, ['chat window', 'chat window']);
	});

	test('uses only the workspace context in the command center', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_workspaceInfo', { label: 'vscode-tools' });
		Reflect.set(widget, '_windowHost', upcastPartial<ISessionHost>({ session: constObservable(undefined) }));
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		const workspaceTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_sessionTitle', 'Custom context');
		const customContextTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_sessionTitle', undefined);
		Reflect.set(widget, '_workspaceInfo', undefined);
		Reflect.set(widget, '_isQuickChat', true);
		const quickChatTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_isQuickChat', false);
		const emptyTitle = getCommandCenterTitle.call(widget);

		assert.deepStrictEqual({ workspaceTitle, customContextTitle, quickChatTitle, emptyTitle }, {
			workspaceTitle: 'vscode-tools',
			customContextTitle: 'Custom context',
			quickChatTitle: 'No workspace',
			emptyTitle: undefined,
		});
	});

	test('renders worktree branch context in the command center', () => {
		const container = mainWindow.document.createElement('div');
		const dynamicDisposables = disposables.add(new DisposableStore());
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_container', container);
		Reflect.set(widget, '_dynamicDisposables', dynamicDisposables);
		Reflect.set(widget, '_workspaceInfo', {
			label: 'vscode',
			icon: Codicon.worktreeCompact,
			workingDirectoryPath: '/src/vscode.worktrees/feature',
			branch: 'feature/session-branch',
			worktreePending: false,
		});
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		const hoverDelegate: IHoverDelegate = { placement: 'element', delay: 500, showHover: () => undefined };
		const hovers: { content: string | undefined; sharedDelegate: boolean }[] = [];
		Reflect.set(widget, 'options', { hoverDelegate });
		Reflect.set(widget, 'hoverService', upcastPartial<IHoverService>({
			setupManagedHover: (delegate, _target, content) => {
				hovers.push({ content: typeof content === 'string' ? content : undefined, sharedDelegate: delegate === hoverDelegate });
				return { ...Disposable.None, show: () => { }, hide: () => { }, update: () => { } };
			},
		}));

		renderActiveSession.call(widget);

		assert.deepStrictEqual({
			ariaLabel: container.getAttribute('aria-label'),
			text: container.textContent,
			separators: container.querySelectorAll('.agent-sessions-titlebar-separator').length,
			workspaceIcon: !!container.querySelector('.codicon-worktree-compact'),
			branchIcon: !!container.querySelector('.codicon-git-branch-compact'),
			branch: container.querySelector('.agent-sessions-titlebar-branch')?.textContent,
			hovers,
			nativeTitles: container.querySelectorAll('[title]').length,
		}, {
			ariaLabel: 'Show Sessions: vscode, branch feature/session-branch',
			text: 'vscode·feature/session-branch',
			separators: 1,
			workspaceIcon: true,
			branchIcon: true,
			branch: 'feature/session-branch',
			hovers: [
				{ content: 'vscode', sharedDelegate: true },
				{ content: 'feature/session-branch', sharedDelegate: true },
			],
			nativeTitles: 0,
		});
	});
});
