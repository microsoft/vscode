/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onceDocumentLoaded } from './events';

const vscode = acquireVsCodeApi();

function getSettings() {
	const element = document.getElementById('simple-browser-settings');
	if (element) {
		const data = element.getAttribute('data-settings');
		if (data) {
			return JSON.parse(data);
		}
	}

	throw new Error(`Could not load settings`);
}

const settings = getSettings();

const iframe = document.querySelector('iframe')!;
const header = document.querySelector('.header')!;
const input = header.querySelector<HTMLInputElement>('.url-input')!;
const forwardButton = header.querySelector<HTMLButtonElement>('.forward-button')!;
const backButton = header.querySelector<HTMLButtonElement>('.back-button')!;
const reloadButton = header.querySelector<HTMLButtonElement>('.reload-button')!;
const openExternalButton = header.querySelector<HTMLButtonElement>('.open-external-button')!;

window.addEventListener('message', e => {
	switch (e.data.type) {
		case 'focus':
			{
				iframe.focus();
				break;
			}
		case 'didChangeFocusLockIndicatorEnabled':
			{
				toggleFocusLockIndicatorEnabled(e.data.enabled);
				break;
			}
	}
});

onceDocumentLoaded(() => {
	setInterval(() => {
		const iframeFocused = document.activeElement?.tagName === 'IFRAME';
		document.body.classList.toggle('iframe-focused', iframeFocused);
	}, 50);

	iframe.addEventListener('load', () => {
		// Noop
	});

	input.addEventListener('change', e => {
		const url = (e.target as HTMLInputElement).value;
		navigateTo(url);
	});

	forwardButton.addEventListener('click', () => {
		history.forward();
	});

	backButton.addEventListener('click', () => {
		history.back();
	});

	if (openExternalButton) {
		openExternalButton.addEventListener('click', () => {
			vscode.postMessage({
				type: 'openExternal',
				url: input.value
			});
		});
	}

	if (reloadButton) {
		reloadButton.addEventListener('click', () => {
			// This does not seem to trigger what we want
			// history.go(0);

			// This incorrectly adds entries to the history but does reload
			// It also always incorrectly always loads the value in the input bar,
			// which may not match the current page if the user has navigated
			navigateTo(input.value);
		});
	}

	// Set the initial URL
	navigateTo(settings.url);

	// Check if 'input' and 'settings' are truthy and if 'settings' has a 'url' property
	if (input && settings && settings.url) {
		// If all conditions are met, set the value of 'input' to the 'url' from 'settings'
		input.value = settings.url;
	} else {
		// If any of the conditions are not met, set the value of 'input' to an empty string
		input.value = '';
	}

	// Toggle the focus lock indicator
	toggleFocusLockIndicatorEnabled(settings.focusLockIndicatorEnabled);

	function navigateTo(rawUrl: string): void {
		try {
			const url = new URL(rawUrl);

			// Try to bust the cache for the iframe
			// There does not appear to be any way to reliably do this except modifying the url
			url.searchParams.append('vscodeBrowserReqId', Date.now().toString());

			iframe.src = url.toString();
		} catch {
			// If rawUrl is not a valid URL, log an error and do not change iframe.src
			console.error(`Invalid URL: ${rawUrl}`);
		}

		vscode.setState({ url: rawUrl });
	}
});

function toggleFocusLockIndicatorEnabled(enabled: boolean) {
	document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}

