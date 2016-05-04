/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { watch, FSWatcher, readFileSync } from 'fs';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import * as json from 'vs/base/common/json';
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

	serviceId = IConfigurationService;

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
			this.cache = json.parse(content) || {};
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
