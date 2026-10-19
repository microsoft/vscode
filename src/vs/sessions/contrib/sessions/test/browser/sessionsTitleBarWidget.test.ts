/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IOpenSessionOptions, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';

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

	test('uses only the workspace context in the command center', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_workspaceInfo', { label: 'vscode-tools' });
		Reflect.set(widget, 'sessionsService', upcastPartial<ISessionsService>({ activeSession: constObservable(undefined) }));
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
		Reflect.set(widget, 'hoverService', upcastPartial<IHoverService>({ setupDelayedHover: () => Disposable.None }));

		renderActiveSession.call(widget);

		assert.deepStrictEqual({
			ariaLabel: container.getAttribute('aria-label'),
			text: container.textContent,
			separators: container.querySelectorAll('.agent-sessions-titlebar-separator').length,
			workspaceIcon: !!container.querySelector('.codicon-worktree-compact'),
			branchIcon: !!container.querySelector('.codicon-git-branch-compact'),
			branch: container.querySelector('.agent-sessions-titlebar-branch')?.textContent,
		}, {
			ariaLabel: 'Show Sessions: vscode, branch feature/session-branch',
			text: 'vscode·feature/session-branch',
			separators: 1,
			workspaceIcon: true,
			branchIcon: true,
			branch: 'feature/session-branch',
		});
	});
});
