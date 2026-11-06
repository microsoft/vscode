/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as path from 'path';
import { Disposable, toDisposable } from '../../../../src/util/vs/base/common/lifecycle';
import { IBaselineTestSummary, OLD_BASELINE_FILENAME, PRODUCED_BASELINE_FILENAME, SIMULATION_FOLDER_NAME } from '../../shared/sharedTypes';
import { REPO_ROOT, genericEquals } from '../utils/utils';
import { SimulationRunner } from './simulationRunner';

export const BASELINE_PATH = path.join(REPO_ROOT, './test/simulation/baseline.json');

export class BaselineJSONProvider extends Disposable {

	@mobx.observable
	public workingTreeBaselineJSON: IBaselineTestSummary[] = [];

	/**
	 * Baseline produced by current run
	 */
	@mobx.observable
	public baselineJSONProducedByRun: IBaselineTestSummary[] = [];

	/**
	 * Baseline snapshotted before current run
	 */
	@mobx.observable
	public baselineJSONBeforeCurrentRun: IBaselineTestSummary[] = [];

	constructor(
		private readonly _runner: SimulationRunner
	) {
		super();
		mobx.makeObservable(this);

		// watch for working-tree baseline.json that's checked into git
		const listener = () => this._updateWorkingTreeBaselineJSON();
		fs.watchFile(BASELINE_PATH, listener);
		this._register(toDisposable(() => fs.unwatchFile(BASELINE_PATH, listener)));

		this._updateWorkingTreeBaselineJSON();

		mobx.autorun(() => {
			this._updateRunBaselines();
		});
	}

	private get oldBaselineJSONPath() {
		return path.join(REPO_ROOT, SIMULATION_FOLDER_NAME, this._runner.selectedRun, OLD_BASELINE_FILENAME);
	}

	private get baselineJSONProducedByRunPath() {
		return path.join(REPO_ROOT, SIMULATION_FOLDER_NAME, this._runner.selectedRun, PRODUCED_BASELINE_FILENAME);
	}

	private async _updateWorkingTreeBaselineJSON(): Promise<void> {
		const newBaseline = await this._readBaselineJSON(BASELINE_PATH);
		if (genericEquals(this.workingTreeBaselineJSON, newBaseline)) {
			return;
		}

		mobx.runInAction(() => {
			this.workingTreeBaselineJSON = newBaseline;
		});
	}

	async updateRootBaselineJSON() {
		await fs.promises.copyFile(this.baselineJSONProducedByRunPath, BASELINE_PATH);
		this._updateWorkingTreeBaselineJSON();
	}

	private async _updateRunBaselines(): Promise<void> {
		if (this._runner.selectedRun === '') {
			return;
		}

		// TODO@ulugbekna: a baseline.old.json.txt is written only if `casUseBaseline` is true, so we need to make sure it doesn't throw here
		const [bjBeforeCurrentRunR, bjProducedByRunR] = await Promise.allSettled([
			this._readBaselineJSON(this.oldBaselineJSONPath),
			this._readBaselineJSON(this.baselineJSONProducedByRunPath),
		]);

		if (bjBeforeCurrentRunR.status === 'rejected') {
			console.error(`Failed to read baseline.old.json.txt: ${bjBeforeCurrentRunR.reason}`);
			return;
		}

		if (bjProducedByRunR.status === 'rejected') {
			console.error(`Failed to read baseline.produced.json.txt: ${bjProducedByRunR.reason}`);
			return;
		}

		const bjBeforeCurrentRun = bjBeforeCurrentRunR.value;
		const bjProducedByRun = bjProducedByRunR.value;

		if (genericEquals(this.baselineJSONBeforeCurrentRun, bjBeforeCurrentRun) && genericEquals(this.baselineJSONProducedByRun, bjProducedByRun)) {
			return;
		}

		mobx.runInAction(() => {
			this.baselineJSONBeforeCurrentRun = bjBeforeCurrentRun;
			this.baselineJSONProducedByRun = bjProducedByRun;
		});
	}

	private async _readBaselineJSON(baselineJSONPath: string): Promise<IBaselineTestSummary[]> {
		const contents = await fs.promises.readFile(baselineJSONPath, 'utf8');
		const res = JSON.parse(contents) as IBaselineTestSummary[];
		res.sort((a, b) => a.name.localeCompare(b.name));
		return res;
	}
}
