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
import '../../browser/media/sessionsViewPane.css';

suite('SessionStorageCleanupNotice', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reflows actions on resize without clipping long labels or losing focus', () => {
		const notice = disposables.add(new SessionStorageCleanupNotice(
			() => { },
			() => { },
			upcastPartial<ISessionWorktreeCleanupService>({
				suggestion: observableValue<ISessionWorktreeCleanupSuggestion | undefined>('suggestion', {
					description: 'Old worktrees are using storage.',
					manage: async () => { },
					disable: async () => { },
					dismiss: () => { },
				}),
				activate: async () => { },
			}),
			new NullLogService(),
			upcastPartial<INotificationService>({}),
			upcastPartial<IHoverService>({ setupManagedHover: () => upcastPartial<IManagedHover>({ dispose: () => { } }) }),
		));
		const container = document.createElement('div');
		container.className = 'agent-sessions-viewpane';
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		container.style.setProperty('--vscode-spacing-size100', '10px');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.appendChild(notice.domNode);
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const buttons = [...notice.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		const actions = notice.domNode.querySelector<HTMLElement>('.agent-sessions-storage-cleanup-notice-actions')!;

		for (const labels of [
			['Open Worktree Cleanup', 'Don\'t Show Again'],
			['Bereinigung der Arbeitsverzeichnisse oeffnen', 'Diese Vorschlaege nicht erneut anzeigen'],
			['OpenWorktreeCleanup'.repeat(4), 'DontShowAgain'.repeat(4)],
		]) {
			buttons.forEach((button, index) => button.textContent = labels[index]);
			buttons[0].focus();
			for (const zoom of [1, 2]) {
				container.style.zoom = String(zoom);
				container.style.width = '2000px';
				const requiredWidth = buttons.reduce((width, button) => width + button.getBoundingClientRect().width / zoom, 4)
					+ container.clientWidth - actions.clientWidth;
				for (const { width, sameRow } of [
					{ width: requiredWidth + 1, sameRow: true },
					{ width: requiredWidth - 1, sameRow: false },
					{ width: 180 / zoom, sameRow: false },
					{ width: requiredWidth + 1, sameRow: true },
				]) {
					container.style.width = `${width}px`;
					const bounds = buttons.map(button => button.getBoundingClientRect());
					assert.deepStrictEqual({
						sameRow: bounds[0].top === bounds[1].top,
						noHorizontalOverflow: [actions, ...buttons].every(element => element.scrollWidth <= element.clientWidth),
						noVerticalOverflow: buttons.every(button => button.scrollHeight <= button.clientHeight),
						keyboardFocusable: buttons.every(button => button.tabIndex === 0),
						focusPreserved: document.activeElement === buttons[0],
					}, {
						sameRow,
						noHorizontalOverflow: true,
						noVerticalOverflow: true,
						keyboardFocusable: true,
						focusPreserved: true,
					}, JSON.stringify({ labels, zoom, width }));
				}
			}
		}
	});

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
		suggestion.set({
			...suggestion.get()!,
			description: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
		}, undefined);
		const lowDiskDescription = notice.domNode.querySelector('.agent-sessions-storage-cleanup-notice-description')?.textContent;
		const reusesButtons = buttons.every(button => notice.domNode.contains(button));
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
			lowDiskDescription,
			reusesButtons,
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
			description: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
			dismissAriaLabel: 'Dismiss Session Storage Suggestion',
			allActionsKeyboardFocusable: true,
			lowDiskDescription: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
			reusesButtons: true,
			announcements: [
				'Old worktrees are using storage. Run Open Worktree Cleanup to review it. To stop these suggestions, run Disable Session Storage Cleanup Suggestions.',
				'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space. Run Open Worktree Cleanup to review it. To stop these suggestions, run Disable Session Storage Cleanup Suggestions.',
			],
			activateCount: 1,
			manageCount: 1,
			disableCount: 1,
			dismissCount: 2,
			focusCount: 3,
		});
	});
});
