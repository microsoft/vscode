/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractLifecycleService } from 'vs/platform/lifecycle/common/lifecycleService';
import { ILogService } from 'vs/platform/log/common/log';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class SimpleLifecycleService extends AbstractLifecycleService {

	_serviceBrand: any;

	constructor(
		@ILogService readonly logService: ILogService
	) {
		super(logService);

		this.registerListeners();
	}

	private registerListeners(): void {
		window.onbeforeunload = () => this.beforeUnload();
	}

	private beforeUnload(): string {

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value) {
				if (value === true) {
					console.warn(new Error('Preventing onBeforeUnload currently not supported'));
				} else if (value instanceof Promise) {
					console.warn(new Error('Long running onBeforeShutdown currently not supported'));
				}
			},
			reason: ShutdownReason.QUIT
		});

		// Will Shutdown
		this._onWillShutdown.fire({
			join() {
				console.warn(new Error('Long running onWillShutdown currently not supported'));
			},
			reason: ShutdownReason.QUIT
		});

		return null;
	}
}