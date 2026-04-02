/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

/**
 * Preload script for pages loaded in Integrated Browser
 *
 * It runs in an isolated context that Electron calls an "isolated world".
 * Specifically the isolated world with worldId 999, which shows in DevTools as "Electron Isolated Context".
 * Despite being isolated, it still runs on the same page as the JS from the actual loaded website
 * which runs on the so-called "main world" (worldId 0. In DevTools as "top").
 *
 * Learn more: see Electron docs for Security, contextBridge, and Context Isolation.
 */
(function () {

	const { contextBridge, ipcRenderer } = require('electron');

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
	// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/electron/electron/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	// Listen for keydown events that the page did not handle and forward them for shortcut handling.
	window.addEventListener('keydown', (event) => {
		// Require that the event is trusted -- i.e. user-initiated.
		// eslint-disable-next-line no-restricted-syntax
		if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
			return;
		}

		// filter to events that either have modifiers or do not have a character representation.
		if (!(event.ctrlKey || event.altKey || event.metaKey) && event.key.length === 1) {
			return;
		}

		// Capture a snapshot of the relevant event properties now, before the event object
		// may be mutated or recycled by the browser.
		const keyEventSnapshot = {
			key: event.key,
			keyCode: event.keyCode,
			code: event.code,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			repeat: event.repeat
		};

		// Defer the defaultPrevented check until after all synchronous event handlers
		// (including those in the page's main world) have had a chance to run.
		// Electron's isolated-world listeners can fire before main-world listeners for the
		// same event, so checking defaultPrevented synchronously would always see false
		// even when a page handler (e.g. vscode.dev for Command+Shift+P / F1) calls
		// preventDefault(). A microtask runs after all worlds' synchronous handlers
		// have completed, giving the correct value.
		queueMicrotask(() => {
			// If the event was already handled by the page, do not forward it.
			if (event.defaultPrevented) {
				return;
			}

			ipcRenderer.send('vscode:browserView:keydown', keyEventSnapshot);
		});
	});

	const globals = {
		/**
		 * Get the currently selected text in the page.
		 */
		getSelectedText(): string {
			try {
				// Even if the page has overridden window.getSelection, our call here will still reach the original
				// implementation. That's because Electron proxies functions, such as getSelectedText here, that are
				// exposed to a different context via exposeInIsolatedWorld or exposeInMainWorld.
				return window.getSelection()?.toString() ?? '';
			} catch {
				return '';
			}
		}
	};

	try {
		// Use contextBridge APIs to expose globals to the same isolated world where this preload script runs (worldId 999).
		// The globals object will be recursively frozen (and for functions also proxied) by Electron to prevent
		// modification within the given context.
		contextBridge.exposeInIsolatedWorld(999, 'browserViewAPI', globals);
	} catch (error) {
		console.error(error);
	}
}());
