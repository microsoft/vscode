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
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';
import { ISessionHost, ISessionHostService, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IInstantiationService, ServiceIdentifier, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';

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

	test('in a chat window, a blocked session opens in that window, as a tab or beside its active chat, not in the main window', async () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		const resource = URI.parse('test:/blocked');
		const session = upcastPartial<ISession>({ sessionId: 'blocked', resource });
		const chatWindow = upcastPartial<IChatWindow>({ windowId: 7, chat: constObservable(URI.parse('test:/active')) });
		const opened: unknown[] = [];
		const pending: Promise<unknown>[] = [];
		const sessionsService = upcastPartial<ISessionsService>({
			slotPanes: constObservable([]),
			openSession: async () => { opened.push('main window'); },
			openSessionToSide: async () => { opened.push('main window to the side'); },
		});
		// The main window shows another session: no editors of its own go along
		const services = new Map<ServiceIdentifier<unknown>, unknown>([
			[IChatWindowService, upcastPartial<IChatWindowService>({ open: async (chat, options) => { opened.push({ chat: chat.toString(), window: options?.window === chatWindow, preserveFocus: options?.preserveFocus, beside: options?.beside?.toString(), moveFrom: options?.editors?.moveFrom }); return undefined; } })],
			[ISessionsService, sessionsService],
			[IEditorGroupsService, upcastPartial<IEditorGroupsService>({})],
			[IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({})],
			[ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: () => upcastPartial<ISessionHost>({ session: constObservable(undefined), chat: constObservable(undefined) }) })],
		]);
		const accessor: ServicesAccessor = { get: <T>(id: ServiceIdentifier<T>) => services.get(id) as T };
		Reflect.set(widget, '_windowHost', upcastPartial<ISessionHost>({ kind: SessionHostKind.ChatWindow, parent: undefined, windowId: constObservable(7) }));
		Reflect.set(widget, 'chatWindowService', upcastPartial<IChatWindowService>({ getWindow: windowId => windowId === 7 ? chatWindow : undefined }));
		Reflect.set(widget, 'sessionsManagementService', upcastPartial<ISessionsManagementService>({ getSession: () => session }));
		Reflect.set(widget, 'sessionsService', sessionsService);
		Reflect.set(widget, 'instantiationService', upcastPartial<IInstantiationService>({
			invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => { const result = fn(accessor); pending.push(Promise.resolve(result)); return result; }) as IInstantiationService['invokeFunction'],
		}));

		openBlockedSession.call(widget, resource, false, false);
		openBlockedSession.call(widget, resource, true, true);
		await Promise.all(pending);

		assert.deepStrictEqual(opened, [
			{ chat: 'test:/blocked', window: true, preserveFocus: false, beside: undefined, moveFrom: [] },
			{ chat: 'test:/blocked', window: true, preserveFocus: true, beside: 'test:/active', moveFrom: [] },
		]);
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
