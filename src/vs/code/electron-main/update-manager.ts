/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as electron from 'electron';
import * as platform from 'vs/base/common/platform';
import { EventEmitter } from 'events';
import { IEnvironmentService, getPlatformIdentifier } from 'vs/code/electron-main/env';
import { ISettingsService } from 'vs/code/electron-main/settings';
import { Win32AutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.win32';
import { LinuxAutoUpdaterImpl } from 'vs/code/electron-main/auto-updater.linux';
import { ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { ServiceIdentifier, createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

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

interface IAutoUpdater extends NodeJS.EventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	serviceId: ServiceIdentifier<any>;
	feedUrl: string;
	channel: string;
	initialize(): void;
	state: State;
	availableUpdate: IUpdate;
	lastCheckDate: Date;
	checkForUpdates(explicit: boolean): void;
	on(event: string, listener: Function): this;
}

export class UpdateManager extends EventEmitter implements IUpdateService {

	serviceId = IUpdateService;

	private _state: State;
	private explicitState: ExplicitState;
	private _availableUpdate: IUpdate;
	private _lastCheckDate: Date;
	private raw: IAutoUpdater;
	private _feedUrl: string;
	private _channel: string;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEnvironmentService private envService: IEnvironmentService,
		@ISettingsService private settingsService: ISettingsService
	) {
		super();

		this._state = State.Uninitialized;
		this.explicitState = ExplicitState.Implicit;
		this._availableUpdate = null;
		this._lastCheckDate = null;
		this._feedUrl = null;
		this._channel = null;

		if (platform.isWindows) {
			this.raw = instantiationService.createInstance(Win32AutoUpdaterImpl);
		} else if (platform.isLinux) {
			this.raw = instantiationService.createInstance(LinuxAutoUpdaterImpl);
		} else if (platform.isMacintosh) {
			this.raw = electron.autoUpdater;
		}

		if (this.raw) {
			this.initRaw();
		}
	}

	private initRaw(): void {
		this.raw.on('error', (event: any, message: string) => {
			this.emit('error', event, message);
			this.setState(State.Idle);
		});

		this.raw.on('checking-for-update', () => {
			this.emit('checking-for-update');
			this.setState(State.CheckingForUpdate);
		});

		this.raw.on('update-available', (event, url: string) => {
			this.emit('update-available', url);

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
			this.emit('update-not-available', this.explicitState === ExplicitState.Explicit);
			this.setState(State.Idle);
		});

		this.raw.on('update-downloaded', (event: any, releaseNotes: string, version: string, date: Date, url: string, rawQuitAndUpdate: () => void) => {
			let data: IUpdate = {
				releaseNotes: releaseNotes,
				version: version,
				date: date,
				quitAndUpdate: () => this.quitAndUpdate(rawQuitAndUpdate)
			};

			this.emit('update-downloaded', data);
			this.setState(State.UpdateDownloaded, data);
		});
	}

	private quitAndUpdate(rawQuitAndUpdate: () => void): void {
		this.lifecycleService.quit(true /* from update */).done(vetod => {
			if (vetod) {
				return;
			}

			// for some reason updating on Mac causes the local storage not to be flushed.
			// we workaround this issue by forcing an explicit flush of the storage data.
			// see also https://github.com/Microsoft/vscode/issues/172
			if (platform.isMacintosh) {
				electron.session.defaultSession.flushStorageData();
			}

			rawQuitAndUpdate();
		});
	}

	public get feedUrl(): string {
		return this._feedUrl;
	}

	public get channel(): string {
		return this._channel;
	}

	public initialize(): void {
		if (this.feedUrl) {
			return; // already initialized
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

		this._channel = channel;
		this._feedUrl = feedUrl;

		this.setState(State.Idle);

		// Check for updates on startup after 30 seconds
		let timer = setTimeout(() => this.checkForUpdates(), 30 * 1000);

		// Clear timer when checking for update
		this.on('error', (error: any, message: string) => console.error(error, message));

		// Clear timer when checking for update
		this.on('checking-for-update', () => clearTimeout(timer));

		// If update not found, try again in 10 minutes
		this.on('update-not-available', () => {
			timer = setTimeout(() => this.checkForUpdates(), 10 * 60 * 1000);
		});
	}

	public get state(): State {
		return this._state;
	}

	public get availableUpdate(): IUpdate {
		return this._availableUpdate;
	}

	public get lastCheckDate(): Date {
		return this._lastCheckDate;
	}

	public checkForUpdates(explicit = false): void {
		this.explicitState = explicit ? ExplicitState.Explicit : ExplicitState.Implicit;
		this._lastCheckDate = new Date();
		this.raw.checkForUpdates();
	}

	private setState(state: State, availableUpdate: IUpdate = null): void {
		this._state = state;
		this._availableUpdate = availableUpdate;
		this.emit('change');
	}

	private getUpdateChannel(): string {
		const channel = this.settingsService.getValue<string>('update.channel') || 'default';
		return channel === 'none' ? null : this.envService.quality;
	}

	private getUpdateFeedUrl(channel: string): string {
		if (!channel) {
			return null;
		}

		if (platform.isWindows && !fs.existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))) {
			return null;
		}

		if (!this.envService.updateUrl || !this.envService.product.commit) {
			return null;
		}

		return `${this.envService.updateUrl}/api/update/${getPlatformIdentifier()}/${channel}/${this.envService.product.commit}`;
	}
}
