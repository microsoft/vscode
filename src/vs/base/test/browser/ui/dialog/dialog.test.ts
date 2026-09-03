/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../browser/dom.js';
import { Button, IButton, unthemedButtonStyles } from '../../../../browser/ui/button/button.js';
import { Dialog, IDialogStyles } from '../../../../browser/ui/dialog/dialog.js';
import { unthemedInboxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { ICheckboxStyles } from '../../../../browser/ui/toggle/toggle.js';
import { DeferredPromise } from '../../../../common/async.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

const unthemedDialogStyles: IDialogStyles = {
	dialogForeground: undefined,
	dialogBackground: undefined,
	dialogShadow: undefined,
	dialogBorder: undefined,
	errorIconForeground: undefined,
	warningIconForeground: undefined,
	infoIconForeground: undefined,
	textLinkForeground: undefined,
};

const unthemedCheckboxStyles: ICheckboxStyles = {
	checkboxBackground: undefined,
	checkboxBorder: undefined,
	checkboxForeground: undefined,
	checkboxDisabledBackground: undefined,
	checkboxDisabledForeground: undefined,
};

suite('Dialog', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps horizontal arrow keys in editable custom body controls', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		let textarea!: HTMLTextAreaElement;
		let contentEditable!: HTMLDivElement;
		const dialog = disposables.add(new Dialog(container, 'Message', ['Save', 'Cancel'], {
			renderBody: body => {
				textarea = append(body, $('textarea'));
				contentEditable = append(body, $('div'));
				contentEditable.contentEditable = 'true';
			},
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		const dispatchArrowRight = (target: HTMLElement) => {
			target.focus();
			const event = new (getWindow(target).KeyboardEvent)('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return {
				activeElement: getWindow(target).document.activeElement,
				defaultPrevented: event.defaultPrevented,
			};
		};

		assert.deepStrictEqual({
			textarea: dispatchArrowRight(textarea),
			contentEditable: dispatchArrowRight(contentEditable),
		}, {
			textarea: { activeElement: textarea, defaultPrevented: false },
			contentEditable: { activeElement: contentEditable, defaultPrevented: false },
		});

		dialog.dispose();
		await result;
	});

	test('renders a plain string detail as text', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		const dialog = disposables.add(new Dialog(container, 'Message', ['OK'], {
			detail: 'Some detail text',
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		const detailElement = container.querySelector('.dialog-message-detail')!;
		assert.strictEqual(detailElement.textContent, 'Some detail text');
		assert.strictEqual(detailElement.children.length, 0);

		dialog.dispose();
		await result;
	});

	test('applies modal blocker classes', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		const dialog = disposables.add(new Dialog(container, 'Message', ['OK'], {
			modalBlockExtraClasses: ['test-modal-block'],
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		assert.strictEqual(container.querySelector('.monaco-dialog-modal-block')?.classList.contains('test-modal-block'), true);

		dialog.dispose();
		await result;
	});

	test('keeps the dialog open when an asynchronous button handler rejects closure', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		let primaryButton!: IButton;
		let attempts = 0;
		const dialog = disposables.add(new Dialog(container, 'Message', ['Save', 'Cancel'], {
			cancelId: 1,
			buttonHandler: async button => {
				await Promise.resolve();
				return button !== 0 || ++attempts > 1;
			},
			buttonOptions: [{
				styleButton: button => primaryButton = button,
			}],
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		let completed = false;
		const result = dialog.show().then(value => {
			completed = true;
			return value;
		});

		primaryButton.element.click();
		await Promise.resolve();
		await Promise.resolve();
		const afterRejectedClosure = completed;
		primaryButton.element.click();

		assert.deepStrictEqual({
			afterRejectedClosure,
			result: await result,
			attempts,
		}, {
			afterRejectedClosure: false,
			result: { button: 0, checkboxChecked: undefined, values: undefined },
			attempts: 2,
		});
	});

	test('routes the close action through a pending asynchronous button handler', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		let primaryButton!: IButton;
		const saveStarted = new DeferredPromise<void>();
		const releaseSave = new DeferredPromise<void>();
		const dialog = disposables.add(new Dialog(container, 'Message', ['Save', 'Cancel'], {
			cancelId: 1,
			buttonHandler: async button => {
				if (button === 0) {
					saveStarted.complete();
					await releaseSave.p;
					return false;
				}
				return true;
			},
			buttonOptions: [{
				styleButton: button => primaryButton = button,
			}],
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		primaryButton.element.click();
		await saveStarted.p;
		const closeButton = container.querySelector<HTMLElement>('.dialog-toolbar .action-label');
		assert.ok(closeButton);
		closeButton.click();
		const cancelled = await result;
		releaseSave.complete();
		await Promise.resolve();

		assert.deepStrictEqual(cancelled, { button: 1, checkboxChecked: undefined });
	});

	test('prefers a pre-rendered detailElement over plain detail text and makes its links keyboard-focusable', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));

		const rendered = $('div.rendered-markdown');
		const link = append(rendered, $('a'));
		link.textContent = 'Command Link';

		const dialog = disposables.add(new Dialog(container, 'Message', ['OK'], {
			detail: 'ignored plain-text detail',
			detailElement: rendered,
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		const detailElement = container.querySelector('.dialog-message-detail')!;
		assert.strictEqual(detailElement.contains(rendered), true);
		assert.strictEqual(detailElement.textContent, 'Command Link');
		assert.strictEqual(link.tabIndex, 0);

		dialog.dispose();
		await result;
	});

	test('focuses a footer-only action without applying hyperlink styles to it', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		let action!: Button;
		let link!: HTMLAnchorElement;
		const dialog = disposables.add(new Dialog(container, 'Message', [], {
			disableDefaultAction: true,
			renderFooter: footer => {
				action = disposables.add(new Button(footer, { buttonForeground: 'rgb(1, 2, 3)' }));
				action.label = 'Cancel';
				link = append(footer, $('a'));
				link.textContent = 'Terms';
			},
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: {
				...unthemedDialogStyles,
				textLinkForeground: 'rgb(4, 5, 6)',
			},
		}));
		const result = dialog.show();

		assert.deepStrictEqual({
			activeElement: getWindow(action.element).document.activeElement,
			actionColor: action.element.style.color,
			actionTextDecoration: action.element.style.textDecoration,
			linkColor: link.style.color,
			linkTextDecoration: link.style.textDecoration,
		}, {
			activeElement: action.element,
			actionColor: 'rgb(1, 2, 3)',
			actionTextDecoration: '',
			linkColor: 'rgb(4, 5, 6)',
			linkTextDecoration: 'underline',
		});

		dialog.dispose();
		await result;
	});
});
