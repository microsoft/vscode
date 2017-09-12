/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import * as electron from 'electron';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, once, filterEvent } from 'vs/base/common/event';
import { always, Throttler } from 'vs/base/common/async';
import { memoize } from 'vs/base/common/decorators';
import { fromEventEmitter } from 'vs/base/node/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Win32AutoUpdaterImpl } from './auto-updater.win32';
import { LinuxAutoUpdaterImpl } from './auto-updater.linux';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IRequestService } from 'vs/platform/request/node/request';
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUpdateService, State, IAutoUpdater, IUpdate, IRawUpdate } from 'vs/platform/update/common/update';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class UpdateService implements IUpdateService {

	_serviceBrand: any;

	private _state: State = State.Uninitialized;
	private _availableUpdate: IUpdate = null;
	private raw: IAutoUpdater;
	private throttler: Throttler = new Throttler();

	private _onError = new Emitter<any>();
	get onError(): Event<any> { return this._onError.event; }

	private _onCheckForUpdate = new Emitter<void>();
	get onCheckForUpdate(): Event<void> { return this._onCheckForUpdate.event; }

	private _onUpdateAvailable = new Emitter<{ url: string; version: string; }>();
	get onUpdateAvailable(): Event<{ url: string; version: string; }> { return this._onUpdateAvailable.event; }

	private _onUpdateNotAvailable = new Emitter<boolean>();
	get onUpdateNotAvailable(): Event<boolean> { return this._onUpdateNotAvailable.event; }

	private _onUpdateReady = new Emitter<IRawUpdate>();
	get onUpdateReady(): Event<IRawUpdate> { return this._onUpdateReady.event; }

	private _onStateChange = new Emitter<State>();
	get onStateChange(): Event<State> { return this._onStateChange.event; }

	@memoize
	private get onRawError(): Event<string> {
		return fromEventEmitter(this.raw, 'error', (_, message) => message);
	}

	@memoize
	private get onRawUpdateNotAvailable(): Event<void> {
		return fromEventEmitter<void>(this.raw, 'update-not-available');
	}

	@memoize
	private get onRawUpdateAvailable(): Event<{ url: string; version: string; }> {
		return filterEvent(fromEventEmitter(this.raw, 'update-available', (_, url, version) => ({ url, version })), ({ url }) => !!url);
	}

	@memoize
	private get onRawUpdateDownloaded(): Event<IRawUpdate> {
		return fromEventEmitter(this.raw, 'update-downloaded', (_, releaseNotes, version, date, url) => ({ releaseNotes, version, date }));
	}

	get state(): State {
		return this._state;
	}

	set state(state: State) {
		this._state = state;
		this._onStateChange.fire(state);
	}

	get availableUpdate(): IUpdate {
		return this._availableUpdate;
	}

	constructor(
		@IRequestService requestService: IRequestService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		if (process.platform === 'win32') {
			this.raw = new Win32AutoUpdaterImpl(requestService);
		} else if (process.platform === 'linux') {
			this.raw = new LinuxAutoUpdaterImpl(requestService);
		} else if (process.platform === 'darwin') {
			this.raw = electron.autoUpdater;
		} else {
			return;
		}

		const channel = this.getUpdateChannel();
		const feedUrl = this.getUpdateFeedUrl(channel);

		if (!feedUrl) {
			return; // updates not available
		}

		try {
			this.raw.setFeedURL(feedUrl);
		} catch (e) {
			return; // application not signed
		}

		this.state = State.Idle;

		// Start checking for updates after 30 seconds
		this.scheduleCheckForUpdates(30 * 1000)
			.done(null, err => console.error(err));
	}

	private scheduleCheckForUpdates(delay = 60 * 60 * 1000): TPromise<void> {
		return TPromise.timeout(delay)
			.then(() => this.checkForUpdates())
			.then(update => {
				if (update) {
					// Update found, no need to check more
					return TPromise.as(null);
				}

				// Check again after 1 hour
				return this.scheduleCheckForUpdates(60 * 60 * 1000);
			});
	}

	checkForUpdates(explicit = false): TPromise<IUpdate> {
		return this.throttler.queue(() => this._checkForUpdates(explicit))
			.then(null, err => {
				if (explicit) {
					this._onError.fire(err);
				}

				return null;
			});
	}

	private _checkForUpdates(explicit: boolean): TPromise<IUpdate> {
		if (this.state !== State.Idle) {
			return TPromise.as(null);
		}

		this._onCheckForUpdate.fire();
		this.state = State.CheckingForUpdate;

		const listeners: IDisposable[] = [];
		const result = new TPromise<IUpdate>((c, e) => {
			once(this.onRawError)(e, null, listeners);
			once(this.onRawUpdateNotAvailable)(() => c(null), null, listeners);
			once(this.onRawUpdateAvailable)(({ url, version }) => url && c({ url, version }), null, listeners);
			once(this.onRawUpdateDownloaded)(({ version, date, releaseNotes }) => c({ version, date, releaseNotes }), null, listeners);

			this.raw.checkForUpdates();
		}).then(update => {
			if (!update) {
				this._onUpdateNotAvailable.fire(explicit);
				this.state = State.Idle;
				this.telemetryService.publicLog('update:notAvailable', { explicit });

			} else if (update.url) {
				const data: IUpdate = {
					url: update.url,
					releaseNotes: '',
					version: update.version,
					date: new Date()
				};

				this._availableUpdate = data;
				this._onUpdateAvailable.fire({ url: update.url, version: update.version });
				this.state = State.UpdateAvailable;
				this.telemetryService.publicLog('update:available', { explicit, version: update.version, currentVersion: product.commit });

			} else {
				const data: IRawUpdate = {
					releaseNotes: update.releaseNotes,
					version: update.version,
					date: update.date
				};

				this._availableUpdate = data;
				this._onUpdateReady.fire(data);
				this.state = State.UpdateDownloaded;
				this.telemetryService.publicLog('update:downloaded', { version: update.version });
			}

			return update;
		}, err => {
			this.state = State.Idle;
			return TPromise.wrapError<IUpdate>(err);
		});

		return always(result, () => dispose(listeners));
	}

	private getUpdateChannel(): string {
		const config = this.configurationService.getConfiguration<{ channel: string; }>('update');
		const channel = config && config.channel;

		return channel === 'none' ? null : product.quality;
	}

	private getUpdateFeedUrl(channel: string): string {
		if (!channel) {
			return null;
		}

		if (process.platform === 'win32' && !fs.existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))) {
			return null;
		}

		if (!product.updateUrl || !product.commit) {
			return null;
		}

		const platform = this.getUpdatePlatform();

		return `${product.updateUrl}/api/update/${platform}/${channel}/${product.commit}`;
	}

	private getUpdatePlatform(): string {
		if (process.platform === 'linux') {
			return `linux-${process.arch}`;
		}

		if (process.platform === 'win32' && process.arch === 'x64') {
			return 'win32-x64';
		}

		return process.platform;
	}

	quitAndInstall(): TPromise<void> {
		if (!this._availableUpdate) {
			return TPromise.as(null);
		}

		if (this._availableUpdate.url) {
			electron.shell.openExternal(this._availableUpdate.url);
			return TPromise.as(null);
		}

		this.lifecycleService.quit(true /* from update */).done(vetod => {
			if (vetod) {
				return;
			}

			// for some reason updating on Mac causes the local storage not to be flushed.
			// we workaround this issue by forcing an explicit flush of the storage data.
			// see also https://github.com/Microsoft/vscode/issues/172
			if (process.platform === 'darwin') {
				electron.session.defaultSession.flushStorageData();
			}

			this.raw.quitAndInstall();
		});

		return TPromise.as(null);
	}
}
