/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { localize } from '../../../../../nls.js';

const $ = DOM.$;

/**
 * Show a phone-friendly bottom sheet that prompts the user for a free-form
 * feedback comment.
 *
 * The sheet matches the design mock for the diff viewer's "Comment"
 * affordance: a slide-up bottom sheet with a drag handle, title, multi-line
 * textarea, and a primary Send button. Tapping the backdrop, the close
 * button, or pressing Escape resolves with `undefined`. Tapping Send
 * resolves with the trimmed text (or `undefined` if it is empty).
 *
 * Visual + behavioural parity with {@link showMobileSortGroupSheet}: same
 * overlay/backdrop pattern, same closing animation, same focus management.
 *
 * @param workbenchContainer The workbench root element. The overlay is
 * appended here and removed on dismiss.
 * @param options Sheet content options (title, placeholder, send label).
 * @returns A promise that resolves with the entered text, or `undefined`
 * if the sheet was dismissed without sending.
 */
export interface IMobileFeedbackComposerSheetOptions {
	readonly title?: string;
	readonly placeholder?: string;
	readonly sendLabel?: string;
	/** Optional secondary line shown above the textarea. */
	readonly description?: string;
}

export function showMobileFeedbackComposerSheet(
	workbenchContainer: HTMLElement,
	options: IMobileFeedbackComposerSheetOptions = {},
): Promise<string | undefined> {
	const title = options.title ?? localize('feedbackComposer.title', "Add feedback");
	const placeholder = options.placeholder ?? localize('feedbackComposer.placeholder', "Add a comment for the agent…");
	const sendLabel = options.sendLabel ?? localize('feedbackComposer.send', "Send");

	return new Promise<string | undefined>(resolve => {
		const disposables: (() => void)[] = [];
		let resolved = false;

		const finish = (text: string | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			sheet.classList.add('closing');
			backdrop.classList.add('closing');
			DOM.getWindow(workbenchContainer).setTimeout(() => {
				for (const d of disposables) {
					try { d(); } catch { /* ignore */ }
				}
				overlay.remove();
				resolve(text);
			}, 180);
		};

		// -- DOM: backdrop + sheet -------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-feedback-composer-sheet-overlay'));
		const backdrop = DOM.append(overlay, $('div.mobile-feedback-composer-sheet-backdrop'));
		const sheet = DOM.append(overlay, $('div.mobile-feedback-composer-sheet'));
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('aria-label', title);

		// -- Header (handle bar + title + close) -----------------------
		DOM.append(sheet, $('div.mobile-feedback-composer-sheet-handle'));
		const header = DOM.append(sheet, $('div.mobile-feedback-composer-sheet-header'));
		DOM.append(header, $('div.mobile-feedback-composer-sheet-title')).textContent = title;
		const closeBtn = DOM.append(header, $('button.mobile-feedback-composer-sheet-close', { type: 'button' })) as HTMLButtonElement;
		closeBtn.setAttribute('aria-label', localize('feedbackComposer.close', "Close"));
		DOM.append(closeBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		const closeGesture = Gesture.addTarget(closeBtn);
		disposables.push(() => closeGesture.dispose());
		const closeClick = DOM.addDisposableListener(closeBtn, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			finish(undefined);
		});
		disposables.push(() => closeClick.dispose());
		const closeTap = DOM.addDisposableListener(closeBtn, TouchEventType.Tap, () => finish(undefined));
		disposables.push(() => closeTap.dispose());

		// -- Optional description --------------------------------------
		if (options.description) {
			const desc = DOM.append(sheet, $('div.mobile-feedback-composer-sheet-description'));
			desc.textContent = options.description;
		}

		// -- Textarea --------------------------------------------------
		const textarea = DOM.append(sheet, $('textarea.mobile-feedback-composer-sheet-textarea')) as HTMLTextAreaElement;
		textarea.placeholder = placeholder;
		textarea.rows = 4;
		textarea.setAttribute('aria-label', title);
		textarea.spellcheck = true;

		// -- Footer (Send button) --------------------------------------
		const footer = DOM.append(sheet, $('div.mobile-feedback-composer-sheet-footer'));
		const sendBtn = DOM.append(footer, $('button.mobile-feedback-composer-sheet-send', { type: 'button' })) as HTMLButtonElement;
		sendBtn.disabled = true;
		sendBtn.setAttribute('aria-label', sendLabel);
		DOM.append(sendBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.send));
		DOM.append(sendBtn, $('span.mobile-feedback-composer-sheet-send-label')).textContent = sendLabel;

		const submit = () => {
			const text = textarea.value.trim();
			if (text.length === 0) {
				return;
			}
			finish(text);
		};

		const sendClick = DOM.addDisposableListener(sendBtn, DOM.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			submit();
		});
		disposables.push(() => sendClick.dispose());
		const sendGesture = Gesture.addTarget(sendBtn);
		disposables.push(() => sendGesture.dispose());
		const sendTap = DOM.addDisposableListener(sendBtn, TouchEventType.Tap, () => submit());
		disposables.push(() => sendTap.dispose());

		const updateSendState = () => {
			sendBtn.disabled = textarea.value.trim().length === 0;
		};
		const inputListener = DOM.addDisposableListener(textarea, DOM.EventType.INPUT, updateSendState);
		disposables.push(() => inputListener.dispose());

		// Keyboard: Enter (without Shift/Alt) submits; Shift+Enter inserts a newline.
		const keydownListener = DOM.addDisposableListener(textarea, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				submit();
			}
		});
		disposables.push(() => keydownListener.dispose());

		// -- Dismissal: backdrop + Escape ------------------------------
		const backdropClick = DOM.addDisposableListener(backdrop, DOM.EventType.CLICK, () => finish(undefined));
		disposables.push(() => backdropClick.dispose());
		const backdropGesture = Gesture.addTarget(backdrop);
		disposables.push(() => backdropGesture.dispose());
		const backdropTap = DOM.addDisposableListener(backdrop, TouchEventType.Tap, () => finish(undefined));
		disposables.push(() => backdropTap.dispose());

		const keyHandler = DOM.addDisposableListener(DOM.getWindow(workbenchContainer), DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				finish(undefined);
			}
		}, true);
		disposables.push(() => keyHandler.dispose());

		// Auto-focus the textarea so the soft keyboard appears immediately.
		textarea.focus();
	});
}
