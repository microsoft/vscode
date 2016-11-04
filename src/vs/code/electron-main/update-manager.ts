/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import * as electron from 'electron';
import Event, { Emitter } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Win32AutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.win32';
import { LinuxAutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.linux';
import { ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from 'vs/platform/request/common/request';
import product from 'vs/platform/product';

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

export interface IUpdate {
	releaseNotes: string;
	version: string;
	date: Date;
	quitAndUpdate: () => void;
}

interface IRawAutoUpdater extends NodeJS.EventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	_serviceBrand: any;

	readonly onError: Event<any>;
	readonly onCheckForUpdate: Event<void>;
	readonly onUpdateAvailable: Event<{ url: string; version: string; }>;
	readonly onUpdateNotAvailable: Event<boolean>;
	readonly onUpdateReady: Event<IUpdate>;
	readonly onStateChange: Event<void>;

	readonly state: State;
	readonly availableUpdate: IUpdate;
	checkForUpdates(explicit: boolean): void;
}

export class UpdateManager implements IUpdateService {

	_serviceBrand: any;

	private _state: State;
	private explicitState: ExplicitState;
	private _availableUpdate: IUpdate;
	private raw: IRawAutoUpdater;
	private _feedUrl: string;
	private _channel: string;

	private _onError = new Emitter<any>();
	get onError(): Event<any> { return this._onError.event; }

	private _onCheckForUpdate = new Emitter<void>();
	get onCheckForUpdate(): Event<void> { return this._onCheckForUpdate.event; }

	private _onUpdateAvailable = new Emitter<{ url: string; version: string; }>();
	get onUpdateAvailable(): Event<{ url: string; version: string; }> { return this._onUpdateAvailable.event; }

	private _onUpdateNotAvailable = new Emitter<boolean>();
	get onUpdateNotAvailable(): Event<boolean> { return this._onUpdateNotAvailable.event; }

	private _onUpdateReady = new Emitter<IUpdate>();
	get onUpdateReady(): Event<IUpdate> { return this._onUpdateReady.event; }

	private _onStateChange = new Emitter<void>();
	get onStateChange(): Event<void> { return this._onStateChange.event; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IRequestService requestService: IRequestService
	) {
		this._state = State.Uninitialized;
		this.explicitState = ExplicitState.Implicit;
		this._availableUpdate = null;
		this._feedUrl = null;
		this._channel = null;

		if (process.platform === 'win32') {
			this.raw = instantiationService.createInstance(Win32AutoUpdaterImpl);
		} else if (process.platform === 'linux') {
			this.raw = instantiationService.createInstance(LinuxAutoUpdaterImpl);
		} else if (process.platform === 'darwin') {
			this.raw = electron.autoUpdater;
		}

		if (!this.raw) {
			return;
		}

		this.raw.on('error', (event: any, message: string) => {
			// TODO: improve
			console.error(message);
			this.setState(State.Idle);
		});

		this.raw.on('checking-for-update', () => {
			this._onCheckForUpdate.fire();
			this.setState(State.CheckingForUpdate);
		});

		this.raw.on('update-available', (event, url: string, version: string) => {
			this._onUpdateAvailable.fire({ url, version });

			let data: IUpdate = null;

			if (url) {
				data = {
					releaseNotes: '',
					version: '',
					date: new Date(),
					quitAndUpdate: () => electron.shell.openExternal(url)
				};
			}

			this.setState(State.UpdateAvailable, data);
		});

		this.raw.on('update-not-available', () => {
			this._onUpdateNotAvailable.fire(this.explicitState === ExplicitState.Explicit);
			this.setState(State.Idle);
		});

		this.raw.on('update-downloaded', (event: any, releaseNotes: string, version: string, date: Date, url: string, rawQuitAndUpdate: () => void) => {
			const data: IUpdate = {
				releaseNotes: releaseNotes,
				version: version,
				date: date,
				quitAndUpdate: () => this.quitAndUpdate(rawQuitAndUpdate)
			};

			this._onUpdateReady.fire(data);
			this.setState(State.UpdateDownloaded, data);
		});

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

		this._channel = channel;
		this._feedUrl = feedUrl;

		this.setState(State.Idle);

		// Check for updates on startup after 30 seconds
		let timer = setTimeout(() => this.checkForUpdates(), 30 * 1000);

		// Clear timer when checking for update
		this.onCheckForUpdate(() => clearTimeout(timer));

		// If update not found, try again in 1 hour
		this.onUpdateNotAvailable(() => timer = setTimeout(() => this.checkForUpdates(), 60 * 60 * 1000));
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

	get state(): State {
		return this._state;
	}

	get availableUpdate(): IUpdate {
		return this._availableUpdate;
	}

	checkForUpdates(explicit = false): void {
		this.explicitState = explicit ? ExplicitState.Explicit : ExplicitState.Implicit;
		this.raw.checkForUpdates();
	}

	private setState(state: State, availableUpdate: IUpdate = null): void {
		this._state = state;
		this._availableUpdate = availableUpdate;
		this._onStateChange.fire();
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
}
