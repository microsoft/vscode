/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISessionWorktreeCleanupService, ISessionWorktreeCleanupSuggestion } from '../../../sessionInputBanners/browser/sessionWorktreeCleanupService.js';
import { SessionStorageCleanupNotice } from '../../browser/views/sessionStorageCleanupNotice.js';

suite('SessionStorageCleanupNotice', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the global suggestion and exposes all actions', () => {
		const suggestion = observableValue<ISessionWorktreeCleanupSuggestion | undefined>('suggestion', undefined);
		let activateCount = 0;
		let manageCount = 0;
		let disableCount = 0;
		let dismissCount = 0;
		let focusCount = 0;
		const announcements: string[] = [];
		const notice = disposables.add(new SessionStorageCleanupNotice(
			() => { focusCount++; },
			message => announcements.push(message),
			upcastPartial<ISessionWorktreeCleanupService>({
				suggestion,
				activate: async () => { activateCount++; },
			}),
			new NullLogService(),
			upcastPartial<INotificationService>({}),
			upcastPartial<IHoverService>({ setupManagedHover: () => upcastPartial<IManagedHover>({ dispose: () => { } }) }),
		));
		document.body.appendChild(notice.domNode);
		disposables.add(toDisposable(() => notice.domNode.remove()));
		const initiallyVisible = notice.domNode.classList.contains('visible');
		const initiallyDisabled = [...notice.domNode.querySelectorAll<HTMLElement>('.monaco-button')]
			.every(button => button.getAttribute('aria-disabled') === 'true');

		suggestion.set({
			description: 'Old worktrees are using storage.',
			manage: async () => { manageCount++; },
			disable: async () => { disableCount++; },
			dismiss: () => { dismissCount++; },
		}, undefined);
		const buttons = [...notice.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		const allActionsKeyboardFocusable = buttons.every(button => button.tabIndex === 0);
		buttons.find(button => button.textContent === 'Open Worktree Cleanup')?.click();
		buttons.find(button => button.textContent === 'Don\'t Show Again')?.click();
		notice.domNode.querySelector<HTMLElement>('.agent-sessions-storage-cleanup-notice-dismiss')?.click();
		notice.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		assert.deepStrictEqual({
			initiallyVisible,
			initiallyDisabled,
			visible: notice.domNode.classList.contains('visible'),
			role: notice.domNode.getAttribute('role'),
			ariaLabel: notice.domNode.getAttribute('aria-label'),
			description: notice.domNode.querySelector('.agent-sessions-storage-cleanup-notice-description')?.textContent,
			dismissAriaLabel: notice.domNode.querySelector('.agent-sessions-storage-cleanup-notice-dismiss')?.getAttribute('aria-label'),
			allActionsKeyboardFocusable,
			announcements,
			activateCount,
			manageCount,
			disableCount,
			dismissCount,
			focusCount,
		}, {
			initiallyVisible: false,
			initiallyDisabled: true,
			visible: true,
			role: 'region',
			ariaLabel: 'Session Storage Cleanup Suggestion',
			description: 'Old worktrees are using storage.',
			dismissAriaLabel: 'Dismiss Session Storage Suggestion',
			allActionsKeyboardFocusable: true,
			announcements: ['Old worktrees are using storage. Run Open Worktree Cleanup to review it. To stop these suggestions, run Disable Session Storage Cleanup Suggestions.'],
			activateCount: 1,
			manageCount: 1,
			disableCount: 1,
			dismissCount: 2,
			focusCount: 3,
		});
	});
});
