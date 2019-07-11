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
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { isEqualOrParent } from 'vs/base/common/resources';
import { ILogService } from 'vs/platform/log/common/log';

class ResourceServiceWorker {

	private readonly _disposables = new DisposableStore();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
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
			return navigator.serviceWorker.ready;
		}).then(() => {
			this._logService.trace('SW#init', navigator.serviceWorker.controller);
		}).catch(err => {
			this._logService.error('SW#init', err);
		});
	}

	private _initFetchHandler(): void {

		const fetchListener: (this: ServiceWorkerContainer, ev: ExtendableMessageEvent) => void = event => {
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
		};
		navigator.serviceWorker.addEventListener('message', fetchListener);
		this._disposables.add(toDisposable(() => navigator.serviceWorker.removeEventListener('message', fetchListener)));
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
	LifecyclePhase.Starting
);


