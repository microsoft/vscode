/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as objects from 'vs/base/common/objects';
import {IDisposable, dispose, toDisposable} from 'vs/base/common/lifecycle';
import Event, {Emitter} from 'vs/base/common/event';
import * as json from 'vs/base/common/json';

export interface IConfigurationServiceEvent<T> {
	config: T;
}

export interface IConfigWatcher<T> {
	getConfig(): T;
	getValue<V>(key: string, fallback?: V): V;
}

export interface IConfigOptions<T> {
	defaultConfig?: T;
	changeBufferDelay?: number;
}

/**
 * A simple helper to watch a configured file for changes and process its contents as JSON object.
 */
export class ConfigWatcher<T> implements IConfigWatcher<T>, IDisposable {
	private cache: T;
	private loaded: boolean;
	private timeoutHandle: number;
	private disposables: IDisposable[];
	private _onDidUpdateConfiguration;

	constructor(private path: string, private options: IConfigOptions<T> = { changeBufferDelay: 0, defaultConfig: Object.create(null) }) {
		this.disposables = [];

		this._onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent<T>>();
		this.disposables.push(this._onDidUpdateConfiguration);

		this.registerWatcher();
		this.initAsync();
	}

	public get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent<T>> {
		return this._onDidUpdateConfiguration.event;
	}

	private initAsync(): void {
		this.loadAsync(config => {
			if (!this.loaded) {
				this.updateCache(config); // prevent race condition if config was loaded sync already
			}
		});
	}

	private updateCache(value: T): void {
		this.cache = value;
		this.loaded = true;
	}

	private loadSync(): T {
		let raw: string;
		try {
			raw = fs.readFileSync(this.path).toString();
		} catch (error) {
			return this.options.defaultConfig;
		}

		return this.parse(raw);
	}

	private loadAsync(callback: (config: T) => void): void {
		fs.readFile(this.path, (error, raw) => {
			if (error) {
				return callback(this.options.defaultConfig);
			}

			return callback(this.parse(raw.toString()));
		});
	}

	private parse(raw: string): T {
		try {
			return json.parse(raw) || this.options.defaultConfig;
		} catch (error) {
			// Ignore loading and parsing errors
		}

		return this.options.defaultConfig;
	}

	private registerWatcher(): void {

		// Support for watching symlinks
		fs.lstat(this.path, (err, stat) => {
			if (err || stat.isDirectory()) {
				return; // path is not a valid file
			}

			// We found a symlink
			if (stat.isSymbolicLink()) {
				fs.readlink(this.path, (err, realPath) => {
					if (err) {
						return; // path is not a valid symlink
					}

					this.watch(realPath);
				});
			}

			// We found a normal file
			else {
				this.watch(this.path);
			}
		});
	}

	private watch(path: string): void {
		const watcher = fs.watch(path);
		watcher.on('change', () => this.onConfigFileChange());

		this.disposables.push(toDisposable(() => {
			watcher.removeAllListeners();
			watcher.close();
		}));
	}

	private onConfigFileChange(): void {

		// we can get multiple change events for one change, so we buffer through a timeout
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		this.timeoutHandle = global.setTimeout(() => {
			this.loadAsync(currentConfig => {
				if (!objects.equals(currentConfig, this.cache)) {
					this.updateCache(currentConfig);

					this._onDidUpdateConfiguration.fire({ config: this.cache });
				}
			});
		}, this.options.changeBufferDelay);
	}

	public getConfig(): T {
		this.ensureLoaded();

		return this.cache;
	}

	public getValue<V>(key: string, fallback?: V): V {
		this.ensureLoaded();

		if (!key) {
			return fallback;
		}

		const value = this.cache ? this.cache[key] : void 0;

		return typeof value !== 'undefined' ? value : fallback;
	}

	private ensureLoaded(): void {
		if (!this.loaded) {
			this.updateCache(this.loadSync());
		}
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}