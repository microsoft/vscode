/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { readFile, writeFile } from 'vs/base/node/pfs';
import { watch, FSWatcher, readFileSync } from 'fs';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import { JSONPath, parse } from 'vs/base/common/json';
import { applyEdits } from 'vs/base/common/jsonFormatter';
import { setProperty } from 'vs/base/common/jsonEdit';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';
import Event, {Emitter} from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

/**
 * Configuration service to be used in the node side.
 * TODO@Joao:
 * 	- defaults handling
 *  - async reading
 *
 * At some point, an async get() on the configuration service would be
 * much easier to implement and reason about. IConfigurationService2?
 */
export class NodeConfigurationService implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private configurationPath: string;
	private watcher: FSWatcher;
	private cache: any;
	private delayer: Delayer<void>;
	private disposables: IDisposable[];

	private _onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
	get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> { return this._onDidUpdateConfiguration.event; }

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.cache = {};
		this.disposables = [];

		this.delayer = new Delayer<void>(300);

		// TODO@joao cleanup!
		this.configurationPath = path.join(environmentService.userDataPath, 'User', 'settings.json');

		// TODO@joao sync?
		this.load();

		this.watcher = watch(path.dirname(this.configurationPath));
		this.disposables.push(toDisposable(() => {
			this.watcher.removeAllListeners();
			this.watcher.close();
		}));

		this.watcher.on('change', () => this.delayer.trigger(() => this.load()));
	}

	getConfiguration<T>(section?: string): T {
		return this._getConfiguration<T>(section);
	}

	setUserConfiguration(key: string | JSONPath, value: any) : Thenable<void> {
		return readFile(this.configurationPath, 'utf8').then(content => {
			// todo: revisit when defaults are read as well
			let config = this.getConfiguration<{ tabSize: number; insertSpaces: boolean }>('editor');
			let tabSize = typeof config.tabSize === 'number' ? config.tabSize : 4;
			let insertSpaces = typeof config.insertSpaces === 'boolean' ? config.insertSpaces : false;

			let path: JSONPath = typeof key === 'string' ? (<string> key).split('.') : <JSONPath> key;
			let edits = setProperty(content, path, value, { insertSpaces, tabSize, eol: '\n' });
			content = applyEdits(content, edits);
			return writeFile(this.configurationPath, content, 'utf8');
		});
	}

	loadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.wrapError(new Error('not implemented'));
	}

	private _getConfiguration<T>(section: string = ''): T {
		let value = this.cache;

		let parts = section
			.split('.')
			.filter(p => !!p);

		while (parts.length && value) {
			let part = parts.shift();
			value = value[part];
		}

		return value;
	}

	private load(): void {
		let content = '{}';

		try {
			// TODO@Joao: is sync really the way to go?
			content = readFileSync(this.configurationPath, 'utf8');
		} catch (error) {
			content = '{}';
		}

		try {
			this.cache = parse(content) || {};
		} catch (error) {
			// noop
		}
	}

	hasWorkspaceConfiguration(): boolean {
		return false;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
