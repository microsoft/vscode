/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { showMobileDialogSheet } from '../../browser/parts/dialogs/mobileDialogSheet.js';
import { createSessionsSignInDialogOptions, SessionsSigningInDialog } from '../../browser/sessionsSignInDialog.js';
import '../../browser/media/workbench.css';

suite('Sessions - Sign-In Dialog', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers signed-out continuation only when allowed', () => {
		const commandService = new class extends mock<ICommandService>() { }();
		let continueCount = 0;
		const required = createSessionsSignInDialogOptions(commandService, false);
		const optional = createSessionsSignInDialogOptions(commandService, false, true, () => continueCount++);

		optional.onDidDismissDialog?.();

		assert.deepStrictEqual({
			required: {
				disableCloseButton: required.disableCloseButton,
				autoDismissOnSignIn: required.autoDismissOnSignIn,
				allowContinueWithoutSignIn: required.allowContinueWithoutSignIn,
				hasFooter: required.renderDialogFooter !== undefined,
				hasDismissHandler: required.onDidDismissDialog !== undefined,
			},
			optional: {
				disableCloseButton: optional.disableCloseButton,
				autoDismissOnSignIn: optional.autoDismissOnSignIn,
				allowContinueWithoutSignIn: optional.allowContinueWithoutSignIn,
				hasFooter: optional.renderDialogFooter !== undefined,
				continueCount,
			},
		}, {
			required: {
				disableCloseButton: true,
				autoDismissOnSignIn: true,
				allowContinueWithoutSignIn: false,
				hasFooter: false,
				hasDismissHandler: false,
			},
			optional: {
				disableCloseButton: false,
				autoDismissOnSignIn: true,
				allowContinueWithoutSignIn: true,
				hasFooter: false,
				continueCount: 1,
			},
		});
	});

	for (const chosenButton of [0, 1]) {
		test(`mobile recovery accepts ${chosenButton === 0 ? 'retry' : 'cancel'} above signing-in progress`, async () => {
			const container = dom.append(mainWindow.document.body, dom.$('.monaco-workbench.agent-sessions-workbench.phone-layout'));
			container.style.cssText = 'position: fixed; inset: 0; width: 390px; contain: layout;';
			store.add(toDisposable(() => container.remove()));
			const backgroundSheet = dom.append(container, dom.$('.mobile-picker-sheet-overlay'));
			const background = dom.append(backgroundSheet, dom.$('button', { type: 'button' }));
			background.textContent = 'Other sheet';
			const layoutService = new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
			}();
			const hostService = new class extends mock<IHostService>() {
				override async setWindowDimmed(): Promise<void> { }
			}();
			let progressCancelled = 0;
			store.add(new SessionsSigningInDialog(() => progressCancelled++, new MockKeybindingService(), layoutService, hostService));
			const progress = container.querySelector<HTMLElement>('.monaco-dialog-box')!;
			background.focus();
			// Hidden Electron workers do not dispatch native focus transitions.
			progress.dispatchEvent(new mainWindow.FocusEvent('focusout', { bubbles: true, relatedTarget: background }));
			const backgroundBounds = background.getBoundingClientRect();
			const backgroundBlocked = {
				focus: progress.contains(dom.getActiveElement()),
				pointer: !background.contains(mainWindow.document.elementFromPoint(backgroundBounds.x + backgroundBounds.width / 2, backgroundBounds.y + backgroundBounds.height / 2)),
				keyup: !background.dispatchEvent(new mainWindow.KeyboardEvent('keyup', { key: ' ', keyCode: 32, bubbles: true, cancelable: true })),
			};

			const closed = showMobileDialogSheet(layoutService, {
				title: 'Setup error',
				message: 'Setup could not complete.',
				buttons: [{ label: 'Retry', isCancel: false }, { label: 'Cancel', isCancel: true }],
				defaultButtonIndex: 1,
				checkbox: chosenButton === 1 ? { label: 'Remember this choice' } : undefined,
			});
			const buttons = container.querySelectorAll<HTMLElement>('.mobile-content-sheet-actions .monaco-button');
			store.add(toDisposable(() => buttons[1].click()));
			const first = container.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? buttons[0];
			progress.dispatchEvent(new mainWindow.FocusEvent('focusout', { bubbles: true, relatedTarget: buttons[1] }));
			const initialFocus = dom.getActiveElement() === buttons[1];
			buttons[1].dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
			const tabWraps = dom.getActiveElement() === first;
			first.focus();
			const keyupAllowed = first.dispatchEvent(new mainWindow.KeyboardEvent('keyup', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }));
			first.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true }));
			const reverseTabWraps = dom.getActiveElement() === buttons[1];

			const overlay = container.querySelector<HTMLElement>('.mobile-dialog-sheet-overlay')!;
			await Promise.all(overlay.getAnimations({ subtree: true }).map(animation => animation.finished));
			const hitTargets = Array.from(buttons, button => {
				const bounds = button.getBoundingClientRect();
				return button.contains(mainWindow.document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
			});
			buttons[chosenButton].click();
			const result = await closed;

			assert.deepStrictEqual({
				backgroundBlocked, initialFocus, tabWraps, reverseTabWraps, keyupAllowed, hitTargets,
				result, progressCancelled, focusRestored: progress.contains(dom.getActiveElement()),
			}, {
				backgroundBlocked: { focus: true, pointer: true, keyup: true }, initialFocus: true, tabWraps: true, reverseTabWraps: true, keyupAllowed: true, hitTargets: [true, true],
				result: { button: chosenButton, checkboxChecked: undefined }, progressCancelled: 0, focusRestored: true,
			});
		});
	}
});
