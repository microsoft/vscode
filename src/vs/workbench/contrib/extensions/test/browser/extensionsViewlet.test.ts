/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { retry } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getIconsStyleSheet } from '../../../../../platform/theme/browser/iconsStyleSheet.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import '../../../../browser/media/style.css';
import '../../browser/media/extensionsViewlet.css';

suite('Extensions viewlet notification layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const iconsStyleSheet = store.add(getIconsStyleSheet(undefined));
		const style = append(mainWindow.document.head, $('style', undefined, iconsStyleSheet.getCSS()));
		store.add(toDisposable(() => style.remove()));
		await mainWindow.document.fonts.load('16px codicon');
	});

	async function createNotification(width: number, message: string, actionLabel?: string, showAction = true) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.mac.vs-dark'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = `${width}px`;
		for (const [name, value] of Object.entries({
			'--vscode-spacing-size40': '4px',
			'--vscode-spacing-size60': '6px',
			'--vscode-spacing-size80': '8px',
			'--vscode-codiconFontSize': '16px',
		})) {
			container.style.setProperty(name, value);
		}

		const header = append(append(container, $('.extensions-viewlet')), $('.header'));
		const notification = append(header, $('.notification-container'));
		const messageContainer = append(notification, $('.message-container'));
		append(messageContainer, $('span.codicon.codicon-info'));
		const messageText = append(messageContainer, $('span.message-text'));
		append(messageText, $('span.message', undefined, message));
		const actions = actionLabel || showAction ? append(notification, $('.notification-actions')) : undefined;
		let action: HTMLElement | undefined;
		if (actionLabel && actions) {
			const button = store.add(new Button(actions, { ...defaultButtonStyles, ariaLabel: actionLabel }));
			button.element.classList.add('message-action-button');
			button.label = actionLabel;
			action = button.element;
		}
		const show = showAction ? append(actions!, $('span.message-text-action', { tabindex: '0', role: 'button' }, 'Show')) : undefined;
		const dismiss = append(notification, $('span.dismiss-action.codicon.codicon-close', { tabindex: '0', role: 'button', 'aria-label': 'Dismiss' }));

		// Browser unit tests load CSS imports asynchronously.
		await retry(async () => {
			assert.strictEqual(mainWindow.getComputedStyle(notification).display, 'grid');
			if (action) {
				assert.strictEqual(mainWindow.getComputedStyle(action).lineHeight, '16px');
			}
		}, 10, 100);

		return { notification, messageContainer, messageText, actions, action, show, dismiss };
	}

	for (const width of [180, 240, 320, 480]) {
		for (const { name, message, label } of [
			{ name: 'restart', message: 'All extensions require a restart to apply updates.', label: 'Restart Extensions' },
			{ name: 'long localized', message: 'Alle Erweiterungen erfordern einen Neustart, um die Aktualisierungen anzuwenden.', label: 'Alle Erweiterungen neu starten' },
			{ name: 'unbroken', message: 'Extension'.repeat(20), label: 'Restart'.repeat(10) },
		]) {
			test(`${name} notification reflows without overflow at ${width}px`, async () => {
				const { notification, messageContainer, messageText, actions, action, show, dismiss } = await createNotification(width, message, label);
				const messageBounds = messageContainer.getBoundingClientRect();
				const textBounds = messageText.getBoundingClientRect();
				const actionsBounds = actions!.getBoundingClientRect();
				const actionBounds = action!.getBoundingClientRect();
				const dismissBounds = dismiss.getBoundingClientRect();

				assert.deepStrictEqual({
					actionsBelowMessage: actionsBounds.top - messageBounds.bottom >= 7.99,
					actionsAlignedWithText: Math.abs(actionsBounds.left - textBounds.left) < 1,
					notificationFits: notification.scrollWidth <= notification.clientWidth,
					messageFits: messageText.scrollWidth <= messageText.clientWidth,
					actionFits: action!.scrollWidth <= action!.clientWidth,
					standardButtonHeight: actionBounds.height >= 24,
					showGroupedWithAction: show!.parentElement === actions && show!.getBoundingClientRect().top >= actionsBounds.top,
					dismissFits: dismissBounds.right <= notification.getBoundingClientRect().right,
					dismissSize: dismissBounds.width,
					dismissAtTop: dismissBounds.top === messageBounds.top,
				}, {
					actionsBelowMessage: true,
					actionsAlignedWithText: true,
					notificationFits: true,
					messageFits: true,
					actionFits: true,
					standardButtonHeight: true,
					showGroupedWithAction: true,
					dismissFits: true,
					dismissSize: 20,
					dismissAtTop: true,
				});
			});
		}
	}

	test('Show-only notification keeps its action below the message', async () => {
		const { messageContainer, messageText, action, show, dismiss } = await createNotification(240, 'Some extensions are disabled.');
		const showBounds = show!.getBoundingClientRect();

		assert.deepStrictEqual({
			action,
			belowMessage: showBounds.top - messageContainer.getBoundingClientRect().bottom >= 7.99,
			alignedWithText: Math.abs(showBounds.left - messageText.getBoundingClientRect().left) < 1,
			dismissAtTop: dismiss.getBoundingClientRect().top === messageContainer.getBoundingClientRect().top,
		}, {
			action: undefined,
			belowMessage: true,
			alignedWithText: true,
			dismissAtTop: true,
		});
	});

	test('dismiss-only notification has no empty action row', async () => {
		const { notification, messageContainer, actions, dismiss } = await createNotification(180, 'Extensions are disabled.', undefined, false);
		const dismissBounds = dismiss.getBoundingClientRect();

		assert.deepStrictEqual({
			actions,
			dismissAtTop: dismissBounds.top === messageContainer.getBoundingClientRect().top,
			dismissAtRight: dismissBounds.right === notification.getBoundingClientRect().right,
			notificationFits: notification.scrollWidth <= notification.clientWidth,
			dismissSize: dismissBounds.width,
		}, {
			actions: undefined,
			dismissAtTop: true,
			dismissAtRight: true,
			notificationFits: true,
			dismissSize: 20,
		});
	});
});

suite('Extensions viewlet focus styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		// Hidden Electron windows do not match focus pseudo-classes; run these tests in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`notification action has a separated focus outline in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.setProperty('--vscode-focusBorder', '#0078d4');
			container.style.setProperty('--vscode-button-background', '#0078d4');
			container.style.setProperty('--vscode-button-foreground', '#ffffff');
			container.style.setProperty('--vscode-strokeThickness', '1px');

			const header = append(append(container, $('.extensions-viewlet')), $('.header'));
			const notification = append(header, $('.notification-container'));
			const actions = append(notification, $('.notification-actions'));
			const button = store.add(new Button(actions, { ...defaultButtonStyles, ariaLabel: 'Restart Extensions' }));
			button.element.classList.add('message-action-button');
			button.label = 'Restart Extensions';
			const action = button.element;
			const input = append(container, $('input', { type: 'text' }));
			input.focus();
			action.focus();

			const style = mainWindow.getComputedStyle(action);
			assert.deepStrictEqual({
				focused: mainWindow.document.activeElement === action,
				focusVisible: action.matches(':focus-visible'),
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
			}, {
				focused: true,
				focusVisible: true,
				outlineStyle: 'solid',
				outlineWidth: '1px',
				outlineColor: 'rgb(0, 120, 212)',
				outlineOffset: '2px',
			});
		});
	}
});
