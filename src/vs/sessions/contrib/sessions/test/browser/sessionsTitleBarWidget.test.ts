/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';

suite('SessionsTitleBarWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const getCommandCenterTitle = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitle') as (this: SessionsTitleBarWidget) => string | undefined;
	const getCommandCenterTitles = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitles') as (this: SessionsTitleBarWidget) => { sessionTitle: string | undefined; contextTitle: string | undefined };
	const renderActiveSession = Reflect.get(SessionsTitleBarWidget.prototype, '_renderActiveSession') as (this: SessionsTitleBarWidget) => void;

	test('prepends the active session title to the command-center context', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_workspaceInfo', { label: 'vscode-tools' });
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		Reflect.set(widget, '_activeSessionTitle', undefined);
		Reflect.set(widget, '_activeChatTitle', undefined);
		const standardPresentation = getCommandCenterTitles.call(widget);

		Reflect.set(widget, '_activeSessionTitle', 'General help');
		Reflect.set(widget, '_activeChatTitle', 'Current chat');
		const sessionViewPresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		Reflect.set(widget, '_activeChatTitle', 'General help');
		const matchingChatTitlePresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		Reflect.set(widget, '_activeChatTitle', 'Current chat');
		Reflect.set(widget, '_sessionTitle', 'Custom context');
		const customContextPresentation = {
			titles: getCommandCenterTitles.call(widget),
			combinedTitle: getCommandCenterTitle.call(widget),
		};

		assert.deepStrictEqual({
			standardPresentation,
			sessionViewPresentation,
			matchingChatTitlePresentation,
			customContextPresentation,
		}, {
			standardPresentation: {
				sessionTitle: undefined,
				contextTitle: 'vscode-tools',
			},
			sessionViewPresentation: {
				titles: {
					sessionTitle: 'General help',
					contextTitle: 'vscode-tools',
				},
				combinedTitle: 'General help · vscode-tools',
			},
			matchingChatTitlePresentation: {
				titles: {
					sessionTitle: undefined,
					contextTitle: 'vscode-tools',
				},
				combinedTitle: 'vscode-tools',
			},
			customContextPresentation: {
				titles: {
					sessionTitle: 'General help',
					contextTitle: 'Custom context',
				},
				combinedTitle: 'General help · Custom context',
			},
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
		Reflect.set(widget, '_activeSessionTitle', undefined);
		Reflect.set(widget, '_activeChatTitle', undefined);
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
