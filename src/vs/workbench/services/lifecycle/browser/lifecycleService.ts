/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShutdownReason, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractLifecycleService } from 'vs/platform/lifecycle/common/lifecycleService';
import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserLifecycleService extends AbstractLifecycleService {

	_serviceBrand: undefined;

	constructor(
		@ILogService readonly logService: ILogService
	) {
		super(logService);

		this.registerListeners();
	}

	private registerListeners(): void {
		// Note: we cannot change this to window.addEventListener('beforeUnload')
		// because it seems that mechanism does not allow for preventing the unload
		window.onbeforeunload = () => this.onBeforeUnload();
	}

	private onBeforeUnload(): string | null {
		const logService = this.logService;
		logService.info('[lifecycle] onBeforeUnload triggered');

		let veto = false;

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value) {
				if (value === true) {
					veto = true;
				} else if (value instanceof Promise && !veto) {
					logService.error('[lifecycle] Long running onBeforeShutdown currently not supported in the web');
					veto = true;
				}
			},
			reason: ShutdownReason.QUIT
		});

		// Veto: signal back to browser by returning a non-falsify return value
		if (veto) {
			return localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
		}

		// No Veto: continue with Will Shutdown
		this._onWillShutdown.fire({
			join() {
				logService.error('[lifecycle] Long running onWillShutdown currently not supported in the web');
			},
			reason: ShutdownReason.QUIT
		});

		// Finally end with Shutdown event
		this._onShutdown.fire();

		return null;
	}
}

registerSingleton(ILifecycleService, BrowserLifecycleService);
