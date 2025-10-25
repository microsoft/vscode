/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MessagePoster } from './messaging';

export class StyleLoadingMonitor {
	private readonly _unloadedStyles: string[] = [];
	private _finishedLoading: boolean = false;

	private _poster?: MessagePoster;

	constructor() {
		const onStyleLoadError = (event: any) => {
			const source = event.target.dataset.source;
			this._unloadedStyles.push(source);
		};

		window.addEventListener('DOMContentLoaded', () => {
			for (const link of document.getElementsByClassName('code-user-style') as HTMLCollectionOf<HTMLElement>) {
				if (link.dataset.source) {
					link.onerror = onStyleLoadError;
				}
			}
		});

		window.addEventListener('load', () => {
			if (!this._unloadedStyles.length) {
				return;
			}
			this._finishedLoading = true;
			this._poster?.postMessage('previewStyleLoadError', { unloadedStyles: this._unloadedStyles });
		});
	}

	public setPoster(poster: MessagePoster): void {
		this._poster = poster;
		if (this._finishedLoading) {
			poster.postMessage('previewStyleLoadError', { unloadedStyles: this._unloadedStyles });
		}
	}
}
