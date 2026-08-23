/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Barrier } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILifecycleService, WillShutdownEvent, StartupKind, LifecyclePhase, LifecyclePhaseToString, ShutdownReason, BeforeShutdownErrorEvent, InternalBeforeShutdownEvent } from './lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mark } from '../../../../base/common/performance.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';

export abstract class AbstractLifecycleService extends Disposable implements ILifecycleService {

	private static readonly LAST_SHUTDOWN_REASON_KEY = 'lifecyle.lastShutdownReason';

	declare readonly _serviceBrand: undefined;

	protected readonly _onBeforeShutdown = this._register(new Emitter<InternalBeforeShutdownEvent>());
	readonly onBeforeShutdown = this._onBeforeShutdown.event;

	protected readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	readonly onWillShutdown = this._onWillShutdown.event;

	protected readonly _onDidShutdown = this._register(new Emitter<void>());
	readonly onDidShutdown = this._onDidShutdown.event;

	protected readonly _onBeforeShutdownError = this._register(new Emitter<BeforeShutdownErrorEvent>());
	readonly onBeforeShutdownError = this._onBeforeShutdownError.event;

	protected readonly _onShutdownVeto = this._register(new Emitter<void>());
	readonly onShutdownVeto = this._onShutdownVeto.event;

	private _startupKind: StartupKind;
	get startupKind(): StartupKind { return this._startupKind; }

	private _phase = LifecyclePhase.Starting;
	get phase(): LifecyclePhase { return this._phase; }

	protected _willShutdown = false;
	get willShutdown(): boolean { return this._willShutdown; }

	private readonly phaseWhen = new Map<LifecyclePhase, Barrier>();

	protected shutdownReason: ShutdownReason | undefined;

	constructor(
		@ILogService protected readonly logService: ILogService,
		@IStorageService protected readonly storageService: IStorageService
	) {
		super();

		// Resolve startup kind
		this._startupKind = this.resolveStartupKind();

		// Save shutdown reason to retrieve on next startup
		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				this.storageService.store(AbstractLifecycleService.LAST_SHUTDOWN_REASON_KEY, this.shutdownReason, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
		}));
	}

	private resolveStartupKind(): StartupKind {
		const startupKind = this.doResolveStartupKind() ?? StartupKind.NewWindow;
		this.logService.trace(`[lifecycle] starting up (startup kind: ${startupKind})`);

		return startupKind;
	}

	protected doResolveStartupKind(): StartupKind | undefined {

		// Retrieve and reset last shutdown reason
		const lastShutdownReason = this.storageService.getNumber(AbstractLifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);
		this.storageService.remove(AbstractLifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);

		// Convert into startup kind
		let startupKind: StartupKind | undefined = undefined;
		switch (lastShutdownReason) {
			case ShutdownReason.RELOAD:
				startupKind = StartupKind.ReloadedWindow;
				break;
			case ShutdownReason.LOAD:
				startupKind = StartupKind.ReopenedWindow;
				break;
		}

		return startupKind;
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
		mark(`code/LifecyclePhase/${LifecyclePhaseToString(value)}`);

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

	/**
	 * Subclasses to implement the explicit shutdown method.
	 */
	abstract shutdown(): Promise<void>;
}
