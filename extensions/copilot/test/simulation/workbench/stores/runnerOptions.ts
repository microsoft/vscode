/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import { SimulationStorage, SimulationStorageValue } from './simulationStorage';

export enum CacheMode {
	Disable = 'disable', // never use the cache, don't update the cache
	Require = 'require', // always use the cache, and fail if it's not available
	Default = 'default', // use cache of available, but don't require it
	Regenerate = 'regenerate', // regenerate the cache even if cache files are available
}

export class RunnerOptions {
	public readonly grep: SimulationStorageValue<string>;

	public readonly cacheMode: SimulationStorageValue<CacheMode>;

	public readonly noFetch: SimulationStorageValue<boolean>;

	public readonly n: SimulationStorageValue<string>;

	public readonly additionalArgs: SimulationStorageValue<string>;

	constructor(storage: SimulationStorage) {
		this.grep = new SimulationStorageValue(storage, 'grep', '');
		this.cacheMode = new SimulationStorageValue(storage, 'cacheMode', CacheMode.Default);
		this.noFetch = new SimulationStorageValue(storage, 'noFetch', false);
		this.n = new SimulationStorageValue(storage, 'n', '');
		this.additionalArgs = new SimulationStorageValue(storage, 'additionalArgs', '');
		mobx.makeObservable(this);
	}
}
