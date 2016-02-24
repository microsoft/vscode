/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import fs = require('fs');
import path = require('path');
import events = require('events');

import electron = require('electron');
import platform = require('vs/base/common/platform');
import env = require('vs/workbench/electron-main/env');
import settings = require('vs/workbench/electron-main/settings');
import {Win32AutoUpdaterImpl} from 'vs/workbench/electron-main/win32/auto-updater.win32';
import {manager as Lifecycle} from 'vs/workbench/electron-main/lifecycle';

'use strict';

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

export class UpdateManager extends events.EventEmitter {

	private _state: State;
	private explicitState: ExplicitState;
	private _availableUpdate: IUpdate;
	private _lastCheckDate: Date;
	private raw: IAutoUpdater;
	private _feedUrl: string;
	private _channel: string;

	constructor() {
		super();

		this._state = State.Uninitialized;
		this.explicitState = ExplicitState.Implicit;
		this._availableUpdate = null;
		this._lastCheckDate = null;
		this._feedUrl = null;
		this._channel = null;

		if (platform.isWindows) {
			this.raw = new Win32AutoUpdaterImpl();
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

		this.raw.on('update-available', () => {
			this.emit('update-available');
			this.setState(State.UpdateAvailable);
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
		Lifecycle.quit().done(vetod => {
			if (vetod) {
				return;
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

		const channel = UpdateManager.getUpdateChannel();
		const feedUrl = UpdateManager.getUpdateFeedUrl(channel);

		if (!feedUrl) {
			return; // updates not available
		}

		this._channel = channel;
		this._feedUrl = feedUrl;

		this.raw.setFeedURL(feedUrl);
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

	private static getUpdateChannel(): string {
		const channel = settings.manager.getValue('update.channel') || 'default';
		return channel === 'none' ? null : env.quality;
	}

	private static getUpdateFeedUrl(channel: string): string {
		if (!channel) {
			return null;
		}

		if (platform.isLinux) {
			return null;
		}

		if (platform.isWindows && !fs.existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))) {
			return null;
		}

		if (!env.updateUrl || !env.product.commit) {
			return null;
		}

		return `${ env.updateUrl }/api/update/${ env.getPlatformIdentifier() }/${ channel }/${ env.product.commit }`;
	}
}

export const Instance = new UpdateManager();
