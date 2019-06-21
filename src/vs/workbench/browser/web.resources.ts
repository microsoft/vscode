/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { getMediaMime } from 'vs/base/common/mime';

export class WebResources {

	private readonly _regexp = /url\(('|")?(vscode-remote:\/\/.*?)\1\)/g;
	private readonly _urlCache = new Map<string, string>();
	private readonly _requestCache = new Map<string, Promise<any>>();
	private readonly _observer: MutationObserver;

	constructor(@IFileService private readonly _fileService: IFileService) {
		// todo@joh add observer to more than head-element
		// todo@joh explore alternative approach
		this._observer = new MutationObserver(r => this._handleMutation(r));
		this._observer.observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['style']
		});
	}

	dispose(): void {
		this._observer.disconnect();
		this._urlCache.forEach(value => URL.revokeObjectURL(value));
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
			} else if (record.type === 'attributes') {
				// style-attribute
				this._handleAttrMutation(record.target);
			}
		}
	}

	private _handleStyleNode(target: Node): void {
		if (target.textContent && target.textContent.indexOf('vscode-remote://') >= 0) {
			const content = target.textContent;
			this._rewriteUrls(content).then(value => {
				if (content === target.textContent) {
					target.textContent = value;
				}
			}).catch(e => {
				console.error(e);
			});
		}
	}

	private _handleAttrMutation(target: Node): void {
		const styleValue = (<HTMLElement>target).getAttribute('style');
		if (styleValue && styleValue.indexOf('vscode-remote://') >= 0) {
			this._rewriteUrls(styleValue).then(value => {
				if (value !== styleValue) {
					(<HTMLElement>target).setAttribute('style', value);
				}
			}).catch(e => {
				console.error(e);
			});
		}
	}

	private async _rewriteUrls(textContent: string): Promise<string> {

		const positions: number[] = [];
		const promises: Promise<any>[] = [];

		let match: RegExpMatchArray | null = null;
		while (match = this._regexp.exec(textContent)) {

			const remoteUrl = match[2];
			positions.push(match.index! + 'url('.length + (typeof match[1] === 'string' ? match[1].length : 0));
			positions.push(remoteUrl.length);

			if (!this._urlCache.has(remoteUrl)) {
				let request = this._requestCache.get(remoteUrl);
				if (!request) {
					const uri = URI.parse(remoteUrl, true);
					request = this._fileService.readFile(uri).then(file => {
						const blobUrl = URL.createObjectURL(new Blob([file.value.buffer], { type: getMediaMime(uri.path) }));
						this._urlCache.set(remoteUrl, blobUrl);
					});
					this._requestCache.set(remoteUrl, request);
				}
				promises.push(request);
			}
		}

		let content = textContent;
		await Promise.all(promises);
		for (let i = positions.length - 1; i >= 0; i -= 2) {
			const start = positions[i - 1];
			const len = positions[i];
			const url = this._urlCache.get(content.substr(start, len));
			content = content.substring(0, start) + url + content.substring(start + len);
		}
		return content;
	}
}
