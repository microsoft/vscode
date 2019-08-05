/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { isEqualOrParent } from 'vs/base/common/resources';
import { ILogService } from 'vs/platform/log/common/log';

// load and start service worker as soon as this file
// is being loaded and later, when services are ready,
// claim this service worker so that messages can be
// replied to
const _serviceWorker = new class ServiceWorkerStarter {

	private static _url = require.toUrl('./resourceServiceWorkerMain.js');

	private _beforeReadyEvents: ExtendableMessageEvent[] = [];
	private _messageHandler?: (event: ExtendableMessageEvent) => void;

	constructor() {
		navigator.serviceWorker.register(ServiceWorkerStarter._url, { scope: '/' }).then(reg => {
			// console.debug('SW#reg', reg);
			return reg.update();
			// }).then(() => {
			// 	// console.debug('SW#updated', reg);
			// 	return navigator.serviceWorker.ready;
		}).then(() => {
			console.info('SW#ready');
		}).catch(err => {
			console.error('SW#init', err);
		});

		const handleMessage = (event: ExtendableMessageEvent) => {
			if (!this._messageHandler) {
				this._beforeReadyEvents.push(event);
				console.debug('SW#buffered', event.data);
			} else {
				this._messageHandler(event);
			}
		};

		navigator.serviceWorker.addEventListener('message', e => handleMessage(e as ExtendableMessageEvent));
	}

	dispose(): void {
		// when to dispose?
	}

	claim(handler: (event: ExtendableMessageEvent) => void): void {
		this._messageHandler = handler;
		this._beforeReadyEvents.forEach(this._messageHandler);
	}
};

class ResourceServiceWorker {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._updateEarlyResourceUris();
		_serviceWorker.claim(e => this._handleMessage(e));
	}

	private _handleMessage(event: ExtendableMessageEvent): void {
		this._logService.trace('SW - fetch', event.data.uri);

		const uri = URI.revive(event.data.uri);
		Promise.all([
			this._fileService.readFile(uri),
			this._isExtensionResource(uri)
		]).then(([file, isExtensionResource]) => {
			if (!event.source) {
				return;
			}
			event.source.postMessage({
				token: event.data.token,
				data: file.value.buffer.buffer,
				isExtensionResource
			}, [file.value.buffer.buffer]);
		});
	}

	private async _isExtensionResource(uri: URI): Promise<boolean> {
		for (const ext of await this._extensionService.getExtensions()) {
			if (isEqualOrParent(uri, ext.extensionLocation)) {
				return true;
			}
		}
		return false;
	}

	private _updateEarlyResourceUris(): void {

		let updateCount = 0;

		// find style-tags
		const styleElements = document.querySelectorAll('style');
		for (let i = 0; i < styleElements.length; i++) {
			const el = styleElements.item(i);
			if (!el.sheet) {
				continue;
			}
			const rules = (<CSSStyleSheet>el.sheet).rules;
			for (let j = 0; j < rules.length; j++) {
				const rule = rules[j];
				const newCssText = this._updateResourceUris(rule.cssText);
				if (newCssText) {
					(<CSSStyleSheet>el.sheet).deleteRule(j);
					(<CSSStyleSheet>el.sheet).insertRule(newCssText, j);
					updateCount += 1;
				}
			}
		}

		// find any tag using remote uris
		const htmlElements = document.querySelectorAll('[style*="/vscode-resources/fetch"]');
		for (let i = 0; i < htmlElements.length; i++) {
			const el = <HTMLElement>htmlElements.item(i);
			const newCssText = this._updateResourceUris(el.style.cssText);
			if (newCssText) {
				el.style.cssText = newCssText;
				updateCount += 1;
			}
		}

		this._logService.trace('SW - count of changed, early dom element: ', updateCount);
	}

	private _updateResourceUris(cssText: string): string | undefined {
		let changed = false;
		let newCssText = cssText.replace(/url\((["'])?(.+?\/vscode-resources\/fetch\?.+?)\1\)/g, (_match, g1, g2, _offset, _input) => {
			changed = true;
			return `url(${g1 || ''}${g2}&r=1${g1 || ''})`;
		});

		return changed ? newCssText : undefined;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourceServiceWorker,
	LifecyclePhase.Ready
);


