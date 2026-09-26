/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MeteredConnectionMonitor, MeteredConnectionState } from '@vscode/metered';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractMeteredConnectionService } from '../common/meteredConnection.js';

type MonitorFactory = () => Promise<MeteredConnectionMonitor>;
const INITIALIZATION_TIMEOUT = 10_000;

interface Options {
	readonly monitorFactory?: MonitorFactory;
	readonly initializationTimeout?: number;
}

async function createMonitor(): Promise<MeteredConnectionMonitor> {
	const { createMonitor } = await import('@vscode/metered');
	return createMonitor();
}

/**
 * Electron-main implementation of the metered connection service.
 * This implementation receives metered connection updates from the operating system.
 */
export class MeteredConnectionMainService extends AbstractMeteredConnectionService {
	private readonly monitorFactory: MonitorFactory;
	private readonly initialized = new DeferredPromise<void>();
	private readonly initializationTimeout: number;
	private started = false;
	override readonly whenInitialized = this.initialized.p;

	constructor(
		options: Options | undefined,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super(configurationService, false);
		this.monitorFactory = options?.monitorFactory ?? createMonitor;
		this.initializationTimeout = options?.initializationTimeout ?? INITIALIZATION_TIMEOUT;
	}

	public start(): void {
		if (!this.started) {
			this.started = true;
			void this.initialize();
		}
	}

	override dispose(): void {
		this.initialized.complete();
		super.dispose();
	}

	private async initialize(): Promise<void> {
		const initialization = this.doInitialize().catch(error => {
			this.logService.error('MeteredConnectionMainService#initialize - Failed to initialize native metered connection monitoring', error);
		});
		try {
			await raceTimeout(initialization, this.initializationTimeout, () => {
				this.logService.warn(`MeteredConnectionMainService#initialize - Native metered connection monitoring did not initialize within ${this.initializationTimeout}ms`);
			});
		} finally {
			this.initialized.complete();
		}
	}

	private async doInitialize(): Promise<void> {
		const monitor = await this.monitorFactory();
		if (this._store.isDisposed) {
			monitor.dispose();
			return;
		}
		this._register(monitor);

		let receivedDefinitiveChange = false;
		this._register(monitor.onDidChange(state => {
			receivedDefinitiveChange = this.updateState(state) || receivedDefinitiveChange;
		}));

		const state = await monitor.ready;
		if (!receivedDefinitiveChange && !this._store.isDisposed) {
			this.updateState(state);
		}
	}

	private updateState(state: MeteredConnectionState): boolean {
		try {
			if (state.status === 'unknown') {
				this.logService.info(`MeteredConnectionMainService#updateState - Metered connection state is unknown (source: ${state.source}, reason: ${state.reason ?? 'unspecified'})`);
				return false;
			}
			this.setIsUnderlyingConnectionMetered(state.status === 'metered');
			return true;
		} catch (error) {
			this.logService.error('MeteredConnectionMainService#updateState - Failed to apply native metered connection state', error);
			return false;
		}
	}
}
