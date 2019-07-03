/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { dirname } from 'vs/base/common/path';
import * as objects from 'vs/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as json from 'vs/base/common/json';
import { statLink } from 'vs/base/node/pfs';
import { realpath } from 'vs/base/node/extpath';
import { watchFolder, watchFile } from 'vs/base/node/watcher';

export interface IConfigurationChangeEvent<T> {
	config: T;
}

export interface IConfigWatcher<T> {
	path: string;
	hasParseErrors: boolean;

	reload(callback: (config: T) => void): void;
	getConfig(): T;
}

export interface IConfigOptions<T> {
	onError: (error: Error | string) => void;
	defaultConfig: T;
	changeBufferDelay?: number;
	parse?: (content: string, errors: any[]) => T;
	initCallback?: (config: T) => void;
}

/**
 * A simple helper to watch a configured file for changes and process its contents as JSON object.
 * Supports:
 * - comments in JSON files and errors
 * - symlinks for the config file itself
 * - delayed processing of changes to accomodate for lots of changes
 * - configurable defaults
 */
export class ConfigWatcher<T> extends Disposable implements IConfigWatcher<T> {
	private cache: T;
	private parseErrors: json.ParseError[];
	private disposed: boolean;
	private loaded: boolean;
	private timeoutHandle: NodeJS.Timer | null;
	private readonly _onDidUpdateConfiguration: Emitter<IConfigurationChangeEvent<T>>;

	constructor(private _path: string, private options: IConfigOptions<T> = { defaultConfig: Object.create(null), onError: error => console.error(error) }) {
		super();
		this._onDidUpdateConfiguration = this._register(new Emitter<IConfigurationChangeEvent<T>>());

		this.registerWatcher();
		this.initAsync();
	}

	get path(): string {
		return this._path;
	}

	get hasParseErrors(): boolean {
		return this.parseErrors && this.parseErrors.length > 0;
	}

	get onDidUpdateConfiguration(): Event<IConfigurationChangeEvent<T>> {
		return this._onDidUpdateConfiguration.event;
	}

	private initAsync(): void {
		this.loadAsync(config => {
			if (!this.loaded) {
				this.updateCache(config); // prevent race condition if config was loaded sync already
			}
			if (this.options.initCallback) {
				this.options.initCallback(this.getConfig());
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

			return res || this.options.defaultConfig;
		} catch (error) {
			return this.options.defaultConfig; // Ignore parsing errors
		}
	}

	private registerWatcher(): void {

		// Watch the parent of the path so that we detect ADD and DELETES
		const parentFolder = dirname(this._path);
		this.watch(parentFolder, true);

		// Check if the path is a symlink and watch its target if so
		this.handleSymbolicLink().then(undefined, () => { /* ignore error */ });
	}

	private async handleSymbolicLink(): Promise<void> {
		const { stat, isSymbolicLink } = await statLink(this._path);
		if (isSymbolicLink && !stat.isDirectory()) {
			const realPath = await realpath(this._path);

			this.watch(realPath, false);
		}
	}

	private watch(path: string, isFolder: boolean): void {
		if (this.disposed) {
			return; // avoid watchers that will never get disposed by checking for being disposed
		}

		if (isFolder) {
			this._register(watchFolder(path, (type, path) => path === this._path ? this.onConfigFileChange() : undefined, error => this.options.onError(error)));
		} else {
			this._register(watchFile(path, () => this.onConfigFileChange(), error => this.options.onError(error)));
		}
	}

	private onConfigFileChange(): void {
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		// we can get multiple change events for one change, so we buffer through a timeout
		this.timeoutHandle = global.setTimeout(() => this.reload(), this.options.changeBufferDelay || 0);
	}

	reload(callback?: (config: T) => void): void {
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

	getConfig(): T {
		this.ensureLoaded();

		return this.cache;
	}

	private ensureLoaded(): void {
		if (!this.loaded) {
			this.updateCache(this.loadSync());
		}
	}

	dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}