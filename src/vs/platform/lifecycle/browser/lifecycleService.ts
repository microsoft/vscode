/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShutdownReason, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractLifecycleService } from 'vs/platform/lifecycle/common/lifecycleService';
import { localize } from 'vs/nls';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';

export class BrowserLifecycleService extends AbstractLifecycleService {

	_serviceBrand!: ServiceIdentifier<ILifecycleService>;

	constructor(
		@ILogService readonly logService: ILogService
	) {
		super(logService);

		this.registerListeners();
	}

	private registerListeners(): void {
		addDisposableListener(window, EventType.BEFORE_UNLOAD, () => this.onBeforeUnload());
	}

	private onBeforeUnload(): string | null {
		let veto = false;

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value) {
				if (value === true) {
					veto = true;
				} else if (value instanceof Promise && !veto) {
					console.warn(new Error('Long running onBeforeShutdown currently not supported in the web'));
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
				console.warn(new Error('Long running onWillShutdown currently not supported in the web'));
			},
			reason: ShutdownReason.QUIT
		});

		// Finally end with Shutdown event
		this._onShutdown.fire();

		return null;
	}
}
