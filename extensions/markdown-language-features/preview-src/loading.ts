/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { postCommand } from './messaging';

export class StyleLoadingMonitor {
	private unloadedStyles: string[] = [];

	constructor() {
		const onStyleLoadError = (event: any) => {
			const source = event.target.dataset.source;
			this.unloadedStyles.push(source);
		};

		window.addEventListener('DOMContentLoaded', () => {
			for (const link of document.getElementsByClassName('code-user-style') as HTMLCollectionOf<HTMLElement>) {
				if (link.dataset.source) {
					link.onerror = onStyleLoadError;
				}
			}
		});

		window.addEventListener('load', () => {
			if (!this.unloadedStyles.length) {
				return;
			}
			postCommand('_markdown.onPreviewStyleLoadError', [this.unloadedStyles]);
		});
	}
}