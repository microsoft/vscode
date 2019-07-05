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


