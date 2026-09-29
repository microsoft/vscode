/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as path from 'path';
import { RunOnceScheduler } from '../../../../src/util/vs/base/common/async';
import { Disposable, toDisposable } from '../../../../src/util/vs/base/common/lifecycle';
import { RUN_METADATA, SIMULATION_FOLDER_NAME } from '../../shared/sharedTypes';
import { REPO_ROOT, genericEquals } from '../utils/utils';
import { SimulationRunner } from './simulationRunner';
import { SimulationStorage, SimulationStorageValue } from './simulationStorage';

const SIMULATION_FOLDER_PATH = path.join(REPO_ROOT, SIMULATION_FOLDER_NAME);

class SimulationRun {

	/** Shown in UI */
	public readonly friendlyName: string;

	/**
	 * @param name is the name of the run that is also the name of the directory that contains the run information (usually in `.simulation` directory)
	 */
	constructor(
		public readonly name: string,
		public readonly label?: string
	) {
		// example: out-20230804-105913 or out-external-20230804-105913
		const m = name.match(/^out-(?:\w+-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
		if (m) {
			const year = m ? parseInt(m[1], 10) : 0;
			const month = m ? parseInt(m[2], 10) : 0;
			const day = m ? parseInt(m[3], 10) : 0;
			const hour = m ? parseInt(m[4], 10) : 0;
			const minute = m ? parseInt(m[5], 10) : 0;
			const second = m ? parseInt(m[6], 10) : 0;
			const twodigits = (n: number) => String(n).padStart(2, '0');
			this.friendlyName = `${twodigits(hour)}:${twodigits(minute)}:${twodigits(second)} -- ${twodigits(day)}/${twodigits(month)}/${year}`;
		} else {
			this.friendlyName = name;
		}
		if (this.label?.length) {
			this.friendlyName = `${this.friendlyName} (${this.label})`;
		}
	}
}


/**
 * Detects possible baseline runs
 */
export class SimulationRunsProvider extends Disposable {
	private static readonly COMPARE_AGAINST_RUN_STORAGE_KEY = 'selectedBaseline';

	private readonly _updateSoon = this._register(new RunOnceScheduler(() => this._update(), 50));

	@mobx.observable
	public runs: SimulationRun[] = [];

	public selectedBaselineRunName: SimulationStorageValue<string>;

	@mobx.computed
	public get selectedBaselineRun(): SimulationRun | undefined {
		return this.runs.find(r => r.name === this.selectedBaselineRunName.value);
	}

	constructor(
		_storage: SimulationStorage,
		private readonly _runner: SimulationRunner
	) {
		super();
		mobx.makeObservable(this);

		this.selectedBaselineRunName = new SimulationStorageValue(_storage, SimulationRunsProvider.COMPARE_AGAINST_RUN_STORAGE_KEY, '');

		const listener = () => {
			if (!this._updateSoon.isScheduled()) {
				this._updateSoon.schedule();
			}
		};

		fs.promises.mkdir(SIMULATION_FOLDER_PATH, { recursive: true }).then(() => {
			fs.watch(SIMULATION_FOLDER_PATH, { recursive: false }, listener);
			this._register(toDisposable(() => fs.unwatchFile(SIMULATION_FOLDER_PATH, listener)));
			this._update();
		});
	}

	private _excludedFiles = new Set(['cache.sqlite', 'cache.version', 'token_cache.json']);

	private async _update(): Promise<void> {
		let entries = (await fs.promises.readdir(SIMULATION_FOLDER_PATH)).map((e) => ({ timestamp: e, label: undefined }));
		entries = entries.filter(entry => !entry.timestamp.startsWith('.') && !entry.timestamp.startsWith('tmp-') && !this._excludedFiles.has(entry.timestamp)); // ignore hidden & tmp- directories & cache-related files
		// Sort descending
		entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		if (genericEquals(entries, this.runs.map(r => r.name))) {
			return;
		}

		for (const entry of entries) {
			const runMetadata = path.join(SIMULATION_FOLDER_PATH, entry.timestamp, RUN_METADATA);
			try {
				const data = (await fs.promises.readFile(runMetadata, 'utf-8')).toString();
				entry.label = JSON.parse(data).label;
			} catch { }
		}

		mobx.runInAction(() => {
			// Try to reuse the old objects
			const existingRuns = new Map<string, SimulationRun>(this.runs.map(r => [r.name, r]));
			this.runs = entries.map(entry => existingRuns.get(entry.timestamp) ?? new SimulationRun(entry.timestamp, entry.label));
		});
	}

	public async renameRun(oldName: string, newName: string): Promise<boolean> {
		if (!this._runner) {
			console.log('Cannot rename: no runner available');
			return false;
		}

		console.log('Attempting to rename run from', oldName, 'to', newName);
		const success = await this._runner.renameRun(oldName, newName);

		if (success) {
			// Update selected baseline if it was renamed
			if (this.selectedBaselineRunName.value === oldName) {
				console.log('Updating selected baseline name from', oldName, 'to', newName);
				mobx.runInAction(() => {
					this.selectedBaselineRunName.value = newName;
				});
			}
		} else {
			console.log('Failed to rename run');
		}
		return success;
	}
}
