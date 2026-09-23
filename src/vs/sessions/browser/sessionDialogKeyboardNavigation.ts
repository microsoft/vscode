/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../base/common/lifecycle.js';

export const sessionDialogAllowableCommands = new Set([
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'copy',
	'cut',
	'paste',
	'editor.action.selectAll',
	'editor.action.clipboardCopyAction',
	'editor.action.clipboardCutAction',
	'editor.action.clipboardPasteAction',
	'hideCodeActionWidget',
	'clearFilterCodeActionWidget',
	'selectPrevCodeAction',
	'selectNextCodeAction',
	'acceptSelectedCodeAction',
	'previewSelectedCodeAction',
	'toggleSectionCodeAction',
	'collapseSectionCodeAction',
	'expandSectionCodeAction',
	'quickInput.next',
	'quickInput.previous',
	'quickInput.accept',
	'quickInput.hide',
]);

interface ISessionDialogKeyboardNavigation extends IDisposable {
	focusFirst(): void;
}

/** Keeps form focus inside a dialog while allowing owned popups to handle Escape first. */
export function registerSessionDialogKeyboardNavigation(
	targetWindow: Window & typeof globalThis,
	getFocusableElements: () => readonly HTMLElement[],
	isPopupTarget: (target: HTMLElement) => boolean,
	acceptPromptSuggestion: () => boolean = () => false,
	cancelPromptSuggestion: () => boolean = () => false,
): ISessionDialogKeyboardNavigation {
	const store = new DisposableStore();
	let suppressPopupEscapeKeyUp = false;

	const visibleFocusableElements = (): readonly HTMLElement[] => getFocusableElements().filter(element => {
		if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
			return false;
		}
		for (let current: HTMLElement | null = element; current; current = current.parentElement) {
			if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') {
				return false;
			}
			const style = targetWindow.getComputedStyle(current);
			if (style.display === 'none' || style.visibility === 'hidden') {
				return false;
			}
		}
		return true;
	});

	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
		const target = event.target;
		const isPopup = target instanceof targetWindow.HTMLElement && isPopupTarget(target);
		// Keep ownership of the Escape press when the popup closes and key repeat targets the form.
		if (event.key === 'Escape' && !event.repeat) {
			const promptSuggestionCancelled = !isPopup && !event.altKey && !event.ctrlKey && !event.metaKey && cancelPromptSuggestion();
			suppressPopupEscapeKeyUp = isPopup || promptSuggestionCancelled;
			if (promptSuggestionCancelled) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
		}
		if (isPopup || event.key !== 'Tab') {
			return;
		}
		if (!event.shiftKey && acceptPromptSuggestion()) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		const focusableElements = visibleFocusableElements();
		if (focusableElements.length === 0) {
			return;
		}
		const activeElement = targetWindow.document.activeElement;
		let focusedIndex = focusableElements.findIndex(element => element === activeElement);
		if (focusedIndex < 0) {
			focusedIndex = focusableElements.findIndex(element => !!activeElement && element.contains(activeElement));
		}
		if (focusedIndex < 0) {
			focusedIndex = event.shiftKey ? 0 : -1;
		}
		const nextIndex = event.shiftKey
			? (focusedIndex - 1 + focusableElements.length) % focusableElements.length
			: (focusedIndex + 1) % focusableElements.length;
		event.preventDefault();
		event.stopImmediatePropagation();
		focusableElements[nextIndex].focus();
	}, true));

	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			if (suppressPopupEscapeKeyUp) {
				event.stopImmediatePropagation();
			}
			suppressPopupEscapeKeyUp = false;
		}
	}, true));

	return {
		focusFirst: () => visibleFocusableElements()[0]?.focus(),
		dispose: () => store.dispose(),
	};
}
