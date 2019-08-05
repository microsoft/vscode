/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Barrier } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILifecycleService, BeforeShutdownEvent, WillShutdownEvent, StartupKind, LifecyclePhase, LifecyclePhaseToString } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { mark } from 'vs/base/common/performance';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export abstract class AbstractLifecycleService extends Disposable implements ILifecycleService {

	_serviceBrand!: ServiceIdentifier<ILifecycleService>;

	protected readonly _onBeforeShutdown = this._register(new Emitter<BeforeShutdownEvent>());
	readonly onBeforeShutdown: Event<BeforeShutdownEvent> = this._onBeforeShutdown.event;

	protected readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	readonly onWillShutdown: Event<WillShutdownEvent> = this._onWillShutdown.event;

	protected readonly _onShutdown = this._register(new Emitter<void>());
	readonly onShutdown: Event<void> = this._onShutdown.event;

	protected _startupKind: StartupKind;
	get startupKind(): StartupKind { return this._startupKind; }

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	get phase(): LifecyclePhase { return this._phase; }

	private phaseWhen = new Map<LifecyclePhase, Barrier>();

	constructor(
		@ILogService protected readonly logService: ILogService
	) {
		super();
	}

	set phase(value: LifecyclePhase) {
		if (value < this.phase) {
			throw new Error('Lifecycle cannot go backwards');
		}

		if (this._phase === value) {
			return;
		}

		this.logService.trace(`lifecycle: phase changed (value: ${value})`);

		this._phase = value;
		mark(`LifecyclePhase/${LifecyclePhaseToString(value)}`);

		const barrier = this.phaseWhen.get(this._phase);
		if (barrier) {
			barrier.open();
			this.phaseWhen.delete(this._phase);
		}
	}

	async when(phase: LifecyclePhase): Promise<void> {
		if (phase <= this._phase) {
			return;
		}

		let barrier = this.phaseWhen.get(phase);
		if (!barrier) {
			barrier = new Barrier();
			this.phaseWhen.set(phase, barrier);
		}

		await barrier.wait();
	}
}
