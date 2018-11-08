/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter, fromNodeEventEmitter, filterEvent, debounceEvent } from 'vs/base/common/event';
import { Throttler, timeout } from 'vs/base/common/async';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUpdateService, State, StateType, AvailableForDownload, UpdateType } from 'vs/platform/update/common/update';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import * as path from 'path';
import { realpath, watch } from 'fs';
import { spawn } from 'child_process';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

abstract class AbstractUpdateService2 implements IUpdateService {

	_serviceBrand: any;

	private _state: State = State.Uninitialized;
	private throttler: Throttler = new Throttler();

	private _onStateChange = new Emitter<State>();
	get onStateChange(): Event<State> { return this._onStateChange.event; }

	get state(): State {
		return this._state;
	}

	protected setState(state: State): void {
		this.logService.info('update#setState', state.type);
		this._state = state;
		this._onStateChange.fire(state);
	}

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService protected logService: ILogService,
	) {
		if (environmentService.disableUpdates) {
			this.logService.info('update#ctor - updates are disabled');
			return;
		}

		this.setState(State.Idle(this.getUpdateType()));

		// Start checking for updates after 30 seconds
		this.scheduleCheckForUpdates(30 * 1000).then(undefined, err => this.logService.error(err));
	}

	private scheduleCheckForUpdates(delay = 60 * 60 * 1000): Thenable<void> {
		return timeout(delay)
			.then(() => this.checkForUpdates(null))
			.then(() => {
				// Check again after 1 hour
				return this.scheduleCheckForUpdates(60 * 60 * 1000);
			});
	}

	checkForUpdates(context: any): TPromise<void> {
		this.logService.trace('update#checkForUpdates, state = ', this.state.type);

		if (this.state.type !== StateType.Idle) {
			return TPromise.as(void 0);
		}

		return this.throttler.queue(() => TPromise.as(this.doCheckForUpdates(context)));
	}

	downloadUpdate(): TPromise<void> {
		this.logService.trace('update#downloadUpdate, state = ', this.state.type);

		if (this.state.type !== StateType.AvailableForDownload) {
			return TPromise.as(void 0);
		}

		return this.doDownloadUpdate(this.state);
	}

	protected doDownloadUpdate(state: AvailableForDownload): TPromise<void> {
		return TPromise.as(void 0);
	}

	applyUpdate(): TPromise<void> {
		this.logService.trace('update#applyUpdate, state = ', this.state.type);

		if (this.state.type !== StateType.Downloaded) {
			return TPromise.as(void 0);
		}

		return this.doApplyUpdate();
	}

	protected doApplyUpdate(): TPromise<void> {
		return TPromise.as(void 0);
	}

	quitAndInstall(): TPromise<void> {
		this.logService.trace('update#quitAndInstall, state = ', this.state.type);

		if (this.state.type !== StateType.Ready) {
			return TPromise.as(void 0);
		}

		this.logService.trace('update#quitAndInstall(): before lifecycle quit()');

		this.lifecycleService.quit(true /* from update */).then(vetod => {
			this.logService.trace(`update#quitAndInstall(): after lifecycle quit() with veto: ${vetod}`);
			if (vetod) {
				return;
			}

			this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
			this.doQuitAndInstall();
		});

		return TPromise.as(void 0);
	}


	protected getUpdateType(): UpdateType {
		return UpdateType.Snap;
	}

	protected doQuitAndInstall(): void {
		// noop
	}

	abstract isLatestVersion(): TPromise<boolean | undefined>;
	protected abstract doCheckForUpdates(context: any): void;
}

export class SnapUpdateService extends AbstractUpdateService2 {

	_serviceBrand: any;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super(lifecycleService, environmentService, logService);

		const watcher = watch(path.dirname(process.env.SNAP));
		const onChange = fromNodeEventEmitter(watcher, 'change', (_, fileName: string) => fileName);
		const onCurrentChange = filterEvent(onChange, n => n === 'current');
		const onDebouncedCurrentChange = debounceEvent(onCurrentChange, (_, e) => e, 2000);
		const listener = onDebouncedCurrentChange(this.checkForUpdates, this);

		lifecycleService.onShutdown(() => {
			listener.dispose();
			watcher.close();
		});
	}

	protected doCheckForUpdates(context: any): void {
		this.setState(State.CheckingForUpdates(context));

		this.isUpdateAvailable().then(result => {
			if (result) {
				this.setState(State.Ready({ version: 'something', productVersion: 'someting' }));
			} else {
				/* __GDPR__
					"update:notAvailable" : {
						"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
					}
					*/
				this.telemetryService.publicLog('update:notAvailable', { explicit: !!context });

				this.setState(State.Idle(UpdateType.Snap));
			}
		}, err => {
			this.logService.error(err);

			/* __GDPR__
				"update:notAvailable" : {
					"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
				}
				*/
			this.telemetryService.publicLog('update:notAvailable', { explicit: !!context });
			this.setState(State.Idle(UpdateType.Snap, err.message || err));
		});
	}

	protected doQuitAndInstall(): void {
		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		// Allow 3 seconds for VS Code to close
		spawn('bash', ['-c', path.join(process.env.SNAP, `usr/share/${product.applicationName}/snapUpdate.sh`)], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore']
		});
	}

	private isUpdateAvailable(): TPromise<boolean> {
		return new TPromise((c, e) => {
			realpath(`/snap/${product.applicationName}/current`, (err, resolvedCurrentSnapPath) => {
				if (err) { return e(err); }

				const currentRevision = path.basename(resolvedCurrentSnapPath);
				c(process.env.SNAP_REVISION !== currentRevision);
			});
		});
	}

	isLatestVersion(): TPromise<boolean | undefined> {
		return this.isUpdateAvailable().then(null, err => {
			this.logService.error('update#checkForSnapUpdate(): Could not get realpath of application.');
			return undefined;
		});
	}
}
