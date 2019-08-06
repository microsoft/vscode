/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';

class ResourceServiceWorker {

	private static _url = require.toUrl('./resourceServiceWorkerMain.js');

	private readonly _disposables = new DisposableStore();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		navigator.serviceWorker.register(ResourceServiceWorker._url, { scope: '/' }).then(reg => {
			this._logService.trace('SW#reg', reg);
			return reg.update();
		}).then(() => {
			this._logService.info('SW#ready');
		}).catch(err => {
			this._logService.error('SW#init', err);
		});

		const handler = (e: ExtendableMessageEvent) => this._handleMessage(e);
		navigator.serviceWorker.addEventListener('message', handler);
		this._disposables.add(toDisposable(() => navigator.serviceWorker.removeEventListener('message', handler)));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _handleMessage(event: ExtendableMessageEvent): void {
		this._logService.trace('SW', event.data);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourceServiceWorker,
	LifecyclePhase.Ready
);


