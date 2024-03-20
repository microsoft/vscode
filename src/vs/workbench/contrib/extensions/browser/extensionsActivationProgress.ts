/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';

export class ExtensionActivationProgress implements IWorkbenchContribution {

	private readonly _listener: IDisposable;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IProgressService progressService: IProgressService,
		@ILogService logService: ILogService,
	) {

		const options = {
			location: ProgressLocation.Window,
			title: localize('activation', "Activating Extensions...")
		};

		let deferred: DeferredPromise<any> | undefined;
		let count = 0;

		this._listener = extensionService.onWillActivateByEvent(e => {
			logService.trace('onWillActivateByEvent: ', e.event);

			if (!deferred) {
				deferred = new DeferredPromise();
				progressService.withProgress(options, _ => deferred!.p);
			}

			count++;

			Promise.race([e.activation, timeout(5000, CancellationToken.None)]).finally(() => {
				if (--count === 0) {
					deferred!.complete(undefined);
					deferred = undefined;
				}
			});
		});
	}

	dispose(): void {
		this._listener.dispose();
	}
}
