/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
(function () {
	const unloadedStyles: string[] = [];

	const settings: any = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));

	const onStyleLoadError = (event: any) => {
		const source = event.target.dataset.source;
		unloadedStyles.push(source);
	};

	window.addEventListener('DOMContentLoaded', () => {
		for (const link of document.getElementsByClassName('code-user-style') as HTMLCollectionOf<HTMLElement>) {
			if (link.dataset.source) {
				link.onerror = onStyleLoadError;
			}
		}
	});

	window.addEventListener('load', () => {
		if (!unloadedStyles.length) {
			return;
		}
		window.parent.postMessage({
			type: 'command',
			source: settings.source,
			body: {
				command: '_markdown.onPreviewStyleLoadError',
				args: [unloadedStyles]
			}
		}, '*');
	});
})();