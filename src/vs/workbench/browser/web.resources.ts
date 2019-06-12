/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';

export class WebResources {

	private readonly _regexp = /url\(('|")?(vscode-remote:\/\/.*?)\1\)/g;
	private readonly _cache = new Map<string, string>();
	private readonly _observer: MutationObserver;

	constructor(@IFileService private readonly _fileService: IFileService) {
		this._observer = new MutationObserver(r => this._handleMutation(r));

		// todo@joh add observer to more than head-element
		// todo@joh explore alternative approach
		this._observer.observe(document.head, { subtree: true, childList: true });
	}

	dispose(): void {
		this._observer.disconnect();
		this._cache.forEach(value => URL.revokeObjectURL(value));
	}

	private _handleMutation(records: MutationRecord[]): void {
		for (const record of records) {
			if (record.target.nodeName === 'STYLE') {
				// style-element directly modified
				this._handleStyleNode(record.target);

			} else if (record.target.nodeName === 'HEAD' && record.type === 'childList') {
				// style-element added to head
				record.addedNodes.forEach(node => {
					if (node.nodeName === 'STYLE') {
						this._handleStyleNode(node);
					}
				});
			}
		}
	}

	private _handleStyleNode(target: Node): void {

		if (!target.textContent) {
			return;
		}

		const positions: number[] = [];
		const promises: Promise<any>[] = [];

		let match: RegExpMatchArray | null = null;
		while (match = this._regexp.exec(target.textContent)) {

			const remoteUrl = match[2];
			positions.push(match.index! + 'url('.length + match[1].length);
			positions.push(remoteUrl.length);

			if (this._cache.has(remoteUrl)) {
				promises.push(Promise.resolve());

			} else {
				promises.push(this._fileService.readFile(URI.parse(remoteUrl, true)).then(file => {
					// todo@joh hack
					const type = /\.woff$/.test(remoteUrl) ? 'application/font-woff' : 'image/svg+xml';
					this._cache.set(remoteUrl, URL.createObjectURL(new Blob([file.value.buffer], { type })));
				}));
			}
		}

		if (promises.length === 0) {
			return;
		}

		let content = target.textContent;

		Promise.all(promises).then(() => {

			if (target.textContent !== content) {
				return;
			}

			for (let i = positions.length - 1; i >= 0; i -= 2) {
				const start = positions[i - 1];
				const len = positions[i];
				const url = this._cache.get(content.substr(start, len));
				content = content.substring(0, start) + url + content.substring(start + len);
			}

			target.textContent = content;

		}).catch(e => {
			console.error(e);
		});
	}
}
