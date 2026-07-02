/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onceDocumentLoaded } from './events';

interface SimpleBrowserSettings {
	readonly url: string;
	readonly focusLockEnabled: boolean;
}

interface SimpleBrowserState {
	readonly url: string;
}

interface OpenExternalMessage {
	readonly type: 'openExternal';
	readonly url: string;
}

type ExtensionToWebviewMessage =
	| { readonly type: 'focus' }
	| { readonly type: 'didChangeFocusLockIndicatorEnabled'; readonly focusLockEnabled: boolean };

interface VsCodeApi<State, Message> {
	setState(state: State): void;
	postMessage(message: Message): void;
}

declare function acquireVsCodeApi(): VsCodeApi<SimpleBrowserState, OpenExternalMessage>;

const vscode = acquireVsCodeApi();

function isSimpleBrowserSettings(value: unknown): value is SimpleBrowserSettings {
	return typeof value === 'object'
		&& value !== null
		&& 'url' in value
		&& typeof value.url === 'string'
		&& 'focusLockEnabled' in value
		&& typeof value.focusLockEnabled === 'boolean';
}

function isExtensionToWebviewMessage(value: unknown): value is ExtensionToWebviewMessage {
	return typeof value === 'object'
		&& value !== null
		&& 'type' in value
		&& (value.type === 'focus'
			|| (value.type === 'didChangeFocusLockIndicatorEnabled'
				&& 'focusLockEnabled' in value
				&& typeof value.focusLockEnabled === 'boolean'));
}

function getSettings(): SimpleBrowserSettings {
	const element = document.getElementById('simple-browser-settings');
	if (element) {
		const data = element.getAttribute('data-settings');
		if (data) {
			const settings: unknown = JSON.parse(data);
			if (isSimpleBrowserSettings(settings)) {
				return settings;
			}
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
	const message: unknown = e.data;
	if (!isExtensionToWebviewMessage(message)) {
		return;
	}

	switch (message.type) {
		case 'focus':
			{
				iframe.focus();
				break;
			}
		case 'didChangeFocusLockIndicatorEnabled':
			{
				toggleFocusLockIndicatorEnabled(message.focusLockEnabled);
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

	openExternalButton.addEventListener('click', () => {
		vscode.postMessage({
			type: 'openExternal',
			url: input.value
		});
	});

	reloadButton.addEventListener('click', () => {
		// This does not seem to trigger what we want
		// history.go(0);

		// This incorrectly adds entries to the history but does reload
		// It also always incorrectly always loads the value in the input bar,
		// which may not match the current page if the user has navigated
		navigateTo(input.value);
	});

	navigateTo(settings.url);
	input.value = settings.url;

	toggleFocusLockIndicatorEnabled(settings.focusLockEnabled);

	function navigateTo(rawUrl: string): void {
		try {
			const url = new URL(rawUrl);

			// Try to bust the cache for the iframe
			// There does not appear to be any way to reliably do this except modifying the url
			const existing = new URLSearchParams(location.search);
			url.searchParams.append('id', existing.get('id')!);
			url.searchParams.append('vscodeBrowserReqId', Date.now().toString());

			iframe.src = url.toString();
		} catch {
			iframe.src = rawUrl;
		}

		vscode.setState({ url: rawUrl });
	}
});

function toggleFocusLockIndicatorEnabled(enabled: boolean) {
	document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}

