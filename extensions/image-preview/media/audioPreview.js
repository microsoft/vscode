/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

(function () {
	const vscode = acquireVsCodeApi();

	function getSettings() {
		const element = document.getElementById('settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}

		throw new Error(`Could not load settings`);
	}

	const settings = getSettings();

	// State
	let hasLoadedMedia = false;

	// Elements
	const container = document.createElement('div');
	container.className = 'audio-container';
	document.body.appendChild(container);

	const audio = new Audio(settings.src);
	audio.controls = true;

	audio.addEventListener('error', e => {
		if (hasLoadedMedia) {
			return;
		}

		hasLoadedMedia = true;
		document.body.classList.add('error');
		document.body.classList.remove('loading');
	});

	audio.addEventListener('canplaythrough', () => {
		if (hasLoadedMedia) {
			return;
		}
		hasLoadedMedia = true;

		document.body.classList.remove('loading');
		document.body.classList.add('ready');
		container.append(audio);
	});

	document.querySelector('.open-file-link').addEventListener('click', () => {
		vscode.postMessage({
			type: 'reopen-as-text',
		});
	});
}());
