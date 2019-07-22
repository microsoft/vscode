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
		_serviceWorker.claim(e => this._handleMessage(e));
	}

	private _handleMessage(event: ExtendableMessageEvent): void {
		this._logService.trace('SW#fetch', event.data.uri);

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
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourceServiceWorker,
	LifecyclePhase.Ready
);


