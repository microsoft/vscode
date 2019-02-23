/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ILifecycleService, LifecyclePhase, StartupKind, BeforeShutdownEvent, WillShutdownEvent, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class SimpleLifecycleService implements ILifecycleService {

	_serviceBrand: any;

	phase: LifecyclePhase;
	startupKind: StartupKind;

	private _onBeforeShutdown = new Emitter<BeforeShutdownEvent>();
	private _onWillShutdown = new Emitter<WillShutdownEvent>();
	private _onShutdown = new Emitter<void>();

	when(): Promise<void> {
		return Promise.resolve();
	}

	fireShutdown(reason = ShutdownReason.QUIT): void {
		this._onWillShutdown.fire({
			join: () => { },
			reason
		});
	}

	fireWillShutdown(event: BeforeShutdownEvent): void {
		this._onBeforeShutdown.fire(event);
	}

	get onBeforeShutdown(): Event<BeforeShutdownEvent> {
		return this._onBeforeShutdown.event;
	}

	get onWillShutdown(): Event<WillShutdownEvent> {
		return this._onWillShutdown.event;
	}

	get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}
}