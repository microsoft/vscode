/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as objects from 'vs/base/common/objects';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import * as json from 'vs/base/common/json';

export interface IConfigurationChangeEvent<T> {
	config: T;
}

export interface IConfigWatcher<T> {
	path: string;
	hasParseErrors: boolean;

	reload(callback: (config: T) => void): void;
	getConfig(): T;
	getValue<V>(key: string, fallback?: V): V;
}

export interface IConfigOptions<T> {
	defaultConfig?: T;
	changeBufferDelay?: number;
	parse?: (content: string, errors: any[]) => T;
}

/**
 * A simple helper to watch a configured file for changes and process its contents as JSON object.
 * Supports:
 * - comments in JSON files and errors
 * - symlinks for the config file itself
 * - delayed processing of changes to accomodate for lots of changes
 * - configurable defaults
 */
export class ConfigWatcher<T> implements IConfigWatcher<T>, IDisposable {
	private cache: T;
	private parseErrors: json.ParseError[];
	private disposed: boolean;
	private loaded: boolean;
	private timeoutHandle: NodeJS.Timer;
	private disposables: IDisposable[];
	private _onDidUpdateConfiguration: Emitter<IConfigurationChangeEvent<T>>;

	constructor(private _path: string, private options: IConfigOptions<T> = { changeBufferDelay: 0, defaultConfig: Object.create(null) }) {
		this.disposables = [];

		this._onDidUpdateConfiguration = new Emitter<IConfigurationChangeEvent<T>>();
		this.disposables.push(this._onDidUpdateConfiguration);

		this.registerWatcher();
		this.initAsync();
	}

	public get path(): string {
		return this._path;
	}

	public get hasParseErrors(): boolean {
		return this.parseErrors && this.parseErrors.length > 0;
	}

	public get onDidUpdateConfiguration(): Event<IConfigurationChangeEvent<T>> {
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
		try {
			return this.parse(fs.readFileSync(this._path).toString());
		} catch (error) {
			return this.options.defaultConfig;
		}
	}

	private loadAsync(callback: (config: T) => void): void {
		fs.readFile(this._path, (error, raw) => {
			if (error) {
				return callback(this.options.defaultConfig);
			}

			return callback(this.parse(raw.toString()));
		});
	}

	private parse(raw: string): T {
		let res: T;
		try {
			this.parseErrors = [];
			res = this.options.parse ? this.options.parse(raw, this.parseErrors) : json.parse(raw, this.parseErrors);
		} catch (error) {
			// Ignore parsing errors
		}

		return res || this.options.defaultConfig;
	}

	private registerWatcher(): void {

		// Watch the parent of the path so that we detect ADD and DELETES
		const parentFolder = path.dirname(this._path);
		this.watch(parentFolder);

		// Check if the path is a symlink and watch its target if so
		fs.lstat(this._path, (err, stat) => {
			if (err || stat.isDirectory()) {
				return; // path is not a valid file
			}

			// We found a symlink
			if (stat.isSymbolicLink()) {
				fs.readlink(this._path, (err, realPath) => {
					if (err) {
						return; // path is not a valid symlink
					}

					this.watch(realPath);
				});
			}
		});
	}

	private watch(path: string): void {
		if (this.disposed) {
			return; // avoid watchers that will never get disposed by checking for being disposed
		}

		try {
			const watcher = fs.watch(path);
			watcher.on('change', () => this.onConfigFileChange());

			this.disposables.push(toDisposable(() => {
				watcher.removeAllListeners();
				watcher.close();
			}));
		} catch (error) {
			fs.exists(path, exists => {
				if (exists) {
					console.warn(`Failed to watch ${path} for configuration changes (${error.toString()})`);
				}
			});
		}
	}

	private onConfigFileChange(): void {
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		// we can get multiple change events for one change, so we buffer through a timeout
		this.timeoutHandle = global.setTimeout(() => this.reload(), this.options.changeBufferDelay);
	}

	public reload(callback?: (config: T) => void): void {
		this.loadAsync(currentConfig => {
			if (!objects.equals(currentConfig, this.cache)) {
				this.updateCache(currentConfig);

				this._onDidUpdateConfiguration.fire({ config: this.cache });
			}

			if (callback) {
				return callback(currentConfig);
			}
		});
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
		this.disposed = true;
		this.disposables = dispose(this.disposables);
	}
}