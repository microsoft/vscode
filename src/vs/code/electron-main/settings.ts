/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as json from 'vs/base/common/json';
import * as objects from 'vs/base/common/objects';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvService } from 'vs/code/electron-main/env';
import Event, {Emitter} from 'vs/base/common/event';

export const ISettingsService = createDecorator<ISettingsService>('settingsService');

export interface ISettings {
	settings: any;
	settingsParseErrors?: string[];
}

export interface ISettingsService {
	_serviceBrand: any;
	globalSettings: ISettings;
	loadSync(): boolean;
	getValue<T>(key: string, fallback?: T): T;
	onChange: Event<ISettings>;
}

/**
 * TODO@Joao TODO@Ben - this needs to die
 *
 * We need to have each participant (renderer, main, cli, shared) be able
 * to listen on changes to each of these files, independently.
 */

export class SettingsManager implements ISettingsService {

	_serviceBrand: any;

	private static CHANGE_BUFFER_DELAY = 300;

	globalSettings: ISettings;

	private timeoutHandle: number;
	private watcher: fs.FSWatcher;
	private appSettingsPath: string;

	private _onChange: Emitter<ISettings>;

	constructor(@IEnvService envService: IEnvService) {
		this.appSettingsPath = envService.appSettingsPath;
		this._onChange = new Emitter<ISettings>();

		this.registerWatchers();
		app.on('will-quit', () => this.dispose());
	}

	loadSync(): boolean {
		let settingsChanged = false;

		const loadedSettings = this.doLoadSync();
		if (!objects.equals(loadedSettings, this.globalSettings)) {

			// Keep in class
			this.globalSettings = loadedSettings;
			settingsChanged = true; // changed value
		}

		// Store into global so that any renderer can access the value with remote.getGlobal()
		if (settingsChanged) {
			global.globalSettingsValue = JSON.stringify(this.globalSettings);
		}

		return settingsChanged;
	}

	get onChange(): Event<ISettings> {
		return this._onChange.event;
	}

	getValue(key: string, fallback?: any): any {
		return this.doGetValue(key, fallback);
	}

	private doGetValue(key: string, fallback?: any): any {
		if (!key) {
			return fallback;
		}

		let value = this.globalSettings.settings;

		const parts = key.split('\.');
		while (parts.length && value) {
			const part = parts.shift();
			value = value[part];
		}

		return typeof value !== 'undefined' ? value : fallback;
	}

	private registerWatchers(): void {
		const self = this;
		function attachSettingsChangeWatcher(watchPath: string): void {
			self.watcher = fs.watch(watchPath);
			self.watcher.on('change', () => self.onSettingsFileChange());
		}

		// Attach a watcher to the settings directory
		attachSettingsChangeWatcher(path.dirname(this.appSettingsPath));

		// Follow symlinks and attach watchers if they resolve
		fs.lstat(this.appSettingsPath, (err, stats) => {
			if (err) {
				return;
			}

			if (stats.isSymbolicLink() && !stats.isDirectory()) {
				fs.readlink(this.appSettingsPath, (err, realPath) => {
					if (err) {
						return;
					}

					attachSettingsChangeWatcher(realPath);
				});
			}
		});
	}

	private onSettingsFileChange(): void {

		// we can get multiple change events for one change, so we buffer through a timeout
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		this.timeoutHandle = global.setTimeout(() => {

			// Reload
			const didChange = this.loadSync();

			// Emit event
			if (didChange) {
				this._onChange.fire(this.globalSettings);
			}

		}, SettingsManager.CHANGE_BUFFER_DELAY);
	}

	private doLoadSync(): ISettings {
		const settings = this.doLoadSettingsSync();

		return {
			settings: settings.contents,
			settingsParseErrors: settings.parseErrors
		};
	}

	private doLoadSettingsSync(): { contents: any; parseErrors?: string[]; } {
		const root = Object.create(null);
		let content = '{}';
		try {
			content = fs.readFileSync(this.appSettingsPath).toString();
		} catch (error) {
			// ignore
		}

		let contents = Object.create(null);
		try {
			contents = json.parse(content);
		} catch (error) {
			// parse problem
			return {
				contents: Object.create(null),
				parseErrors: [this.appSettingsPath]
			};
		}

		for (let key in contents) {
			this.setNode(root, key, contents[key]);
		}

		return {
			contents: root
		};
	}

	private setNode(root: any, key: string, value: any): any {
		const segments = key.split('.');
		const last = segments.pop();

		let curr = root;
		segments.forEach((s) => {
			let obj = curr[s];
			switch (typeof obj) {
				case 'undefined':
					obj = curr[s] = {};
					break;
				case 'object':
					break;
				default:
					console.log('Conflicting user settings: ' + key + ' at ' + s + ' with ' + JSON.stringify(obj));
			}
			curr = obj;
		});
		curr[last] = value;
	}

	dispose(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}
}