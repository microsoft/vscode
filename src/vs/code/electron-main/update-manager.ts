/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import * as electron from 'electron';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, once } from 'vs/base/common/event';
import { always, Throttler } from 'vs/base/common/async';
import { memoize } from 'vs/base/common/decorators';
import { fromEventEmitter } from 'vs/base/node/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Win32AutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.win32';
import { LinuxAutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.linux';
import { ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from 'vs/platform/request/common/request';
import product from 'vs/platform/product';
import { TPromise } from 'vs/base/common/winjs.base';

export enum State {
	Uninitialized,
	Idle,
	CheckingForUpdate,
	UpdateAvailable,
	UpdateDownloaded
}

export enum ExplicitState {
	Implicit,
	Explicit
}

export interface IRawUpdate {
	releaseNotes: string;
	version: string;
	date: Date;
	quitAndUpdate: () => void;
}

export interface IRawAvailableUpdate {
	url: string;
	version: string;
}

export interface IUpdate {
	version: string;
	url?: string;
	releaseNotes?: string;
	date?: Date;
}

interface IRawUpdate2 extends IUpdate {
	quitAndUpdate?: () => void;
}

interface IRawAutoUpdater extends NodeJS.EventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	_serviceBrand: any;

	readonly onError: Event<any>;
	readonly onUpdateAvailable: Event<{ url: string; version: string; }>;
	readonly onUpdateNotAvailable: Event<boolean>;
	readonly onUpdateReady: Event<IRawUpdate>;
	readonly onStateChange: Event<void>;

	readonly state: State;
	readonly availableUpdate: IRawUpdate;
	checkForUpdates(explicit: boolean): TPromise<IUpdate>;
}

export class UpdateManager implements IUpdateService {

	_serviceBrand: any;

	private _state: State = State.Uninitialized;
	private _availableUpdate: IRawUpdate = null;
	private raw: IRawAutoUpdater;
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

	private _onStateChange = new Emitter<void>();
	get onStateChange(): Event<void> { return this._onStateChange.event; }

	@memoize
	private get onRawError(): Event<string> {
		return fromEventEmitter<string>(this.raw, 'error', (_, message) => message);
	}

	@memoize
	private get onRawUpdateNotAvailable(): Event<void> {
		return fromEventEmitter<void>(this.raw, 'update-not-available');
	}

	@memoize
	private get onRawUpdateAvailable(): Event<IRawAvailableUpdate> {
		return fromEventEmitter<IRawAvailableUpdate>(this.raw, 'update-available', (_, url, version) => ({ url, version }));
	}

	@memoize
	private get onRawUpdateDownloaded(): Event<IRawUpdate> {
		return fromEventEmitter<IRawUpdate>(this.raw, 'update-not-available', (_, releaseNotes, version, date, url, rawQuitAndUpdate) => ({
			releaseNotes,
			version,
			date,
			quitAndUpdate: () => this.quitAndUpdate(rawQuitAndUpdate)
		}));
	}

	get state(): State {
		return this._state;
	}

	set state(state: State) {
		this._state = state;
		this._onStateChange.fire();
	}

	get availableUpdate(): IRawUpdate {
		return this._availableUpdate;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IRequestService requestService: IRequestService
	) {
		if (process.platform === 'win32') {
			this.raw = instantiationService.createInstance(Win32AutoUpdaterImpl);
		} else if (process.platform === 'linux') {
			this.raw = instantiationService.createInstance(LinuxAutoUpdaterImpl);
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
		return this.throttler.queue(() => this._checkForUpdates(explicit));
	}

	private _checkForUpdates(explicit: boolean): TPromise<IUpdate> {
		this._onCheckForUpdate.fire();
		this.state = State.CheckingForUpdate;

		const listeners: IDisposable[] = [];
		const result = new TPromise<IRawUpdate2>((c, e) => {
			once(this.onRawError)(e, null, listeners);
			once(this.onRawUpdateNotAvailable)(() => c(null), null, listeners);
			once(this.onRawUpdateAvailable)(({ url, version }) => url && c({ url, version }), null, listeners);
			once(this.onRawUpdateDownloaded)(({ version, date, releaseNotes, quitAndUpdate }) => c({ version, date, releaseNotes, quitAndUpdate }), null, listeners);

			this.raw.checkForUpdates();
		}).then(update => {
			if (!update) {
				this._onUpdateNotAvailable.fire(explicit);
				this.state = State.Idle;

			} else if (update.url) {
				const data: IRawUpdate = {
					releaseNotes: '',
					version: '',
					date: new Date(),
					quitAndUpdate: () => electron.shell.openExternal(update.url)
				};

				this._availableUpdate = data;
				this._onUpdateAvailable.fire({ url: update.url, version: update.version });
				this.state = State.UpdateAvailable;

			} else {
				const data: IRawUpdate = {
					releaseNotes: update.releaseNotes,
					version: update.version,
					date: update.date,
					quitAndUpdate: () => this.quitAndUpdate(update.quitAndUpdate)
				};

				this._availableUpdate = data;
				this._onUpdateReady.fire(data);
				this.state = State.UpdateDownloaded;
			}

			return update;
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

		const platform = process.platform === 'linux' ? `linux-${process.arch}` : process.platform;

		return `${product.updateUrl}/api/update/${platform}/${channel}/${product.commit}`;
	}

	private quitAndUpdate(rawQuitAndUpdate: () => void): void {
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

			rawQuitAndUpdate();
		});
	}
}
