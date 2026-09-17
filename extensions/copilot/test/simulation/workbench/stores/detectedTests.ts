/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import { Disposable, toDisposable } from '../../../../src/util/vs/base/common/lifecycle';
import { IDetectedTestOutput } from '../../shared/sharedTypes';
import { spawnSimulation } from '../utils/simulationExec';
import { genericEquals } from '../utils/utils';

/**
 * Detects tests that are available in the simulation.
 *
 * @param extraArgs - Additional CLI args to pass to `simulationMain` when listing tests.
 *                    Used by NES External mode to pass `--nes=external --external-scenarios=<path>`.
 */

export class DetectedTests extends Disposable {

	@mobx.observable
	public tests: IDetectedTestOutput[] = [];

	constructor(private readonly _extraArgs?: () => string[]) {
		super();
		mobx.makeObservable(this);

		let timer: TimeoutHandle | undefined = undefined;
		this._register(toDisposable(() => clearInterval(timer)));
		const resume = () => {
			this._updateTests();
			timer = setInterval(() => this._updateTests(), 5000);
		};
		const suspend = () => {
			clearInterval(timer);
			timer = undefined;
		};

		mobx.onBecomeObserved(this, 'tests', resume);
		mobx.onBecomeUnobserved(this, 'tests', suspend);
	}

	private async _updateTests(): Promise<void> {
		const newTests = await this._fetchTests();
		if (genericEquals(this.tests, newTests)) {
			return;
		}

		mobx.runInAction(() => {
			this.tests = newTests;
		});
	}

	private async _fetchTests(): Promise<IDetectedTestOutput[]> {
		const args = ['--list-tests', '--json', ...(this._extraArgs?.() ?? [])];
		const result = await spawnSimulation<IDetectedTestOutput>({
			args,
			ignoreNonJSONLines: true
		}).toPromise();
		result.sort((a, b) => a.name.localeCompare(b.name));
		return result;
	}
}
