/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// todo@joh explore alternative, explicit approach
class ResourcesMutationObserver {

	private readonly _urlCache = new Map<string, string>();
	private readonly _observer: MutationObserver;

	private readonly _regexp = /url\(('|")?(vscode-remote:\/\/(.*?))\1\)/ig;

	constructor() {
		this._observer = new MutationObserver(r => this._handleMutation(r));
		this._observer.observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['style']
		});
		this.scan();
	}

	scan(): void {
		document.querySelectorAll('style').forEach(value => this._handleStyleNode(value));
		// todo@joh more!
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
		return textContent.replace(this._regexp, function (_m, quote = '', url) {
			return `url(${quote}${location.href}vscode-resources/fetch?${encodeURIComponent(url)}${quote})`;
		});
	}
}

class ResourceServiceWorker {

	private readonly _disposables = new DisposableStore();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) {
		this._initServiceWorker();
		this._initFetchHandler();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _initServiceWorker(): void {
		const url = require.toUrl('./resourceServiceWorkerMain.js');
		navigator.serviceWorker.register(url, { scope: '/' }).then(reg => {
			// console.log('registered', reg);
			return navigator.serviceWorker.ready;
		}).then(() => {
			// console.log('ready');
			this._disposables.add(new ResourcesMutationObserver());
		}).catch(err => {
			console.error(err);
		});
	}

	private _initFetchHandler(): void {

		const fetchListener: (this: ServiceWorkerContainer, ev: MessageEvent) => void = event => {
			const uri = URI.parse(event.data.uri);
			this._fileService.readFile(uri).then(file => {
				// todo@joh typings
				(<any>event.source).postMessage({
					token: event.data.token,
					data: file.value.buffer.buffer
				}, [file.value.buffer.buffer]);
			});
		};
		navigator.serviceWorker.addEventListener('message', fetchListener);
		this._disposables.add(toDisposable(() => navigator.serviceWorker.removeEventListener('message', fetchListener)));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourceServiceWorker,
	LifecyclePhase.Starting
);


